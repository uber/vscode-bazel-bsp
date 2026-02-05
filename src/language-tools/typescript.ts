import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'
import {TestFinish} from '../bsp/bsp'
import {SourceFileTestCaseInfo, TestCaseInfo} from '../test-info/test-info'
import {BaseLanguageTools} from './base'
import {JUnitStyleTestCaseData, TestFinishDataKind} from '../bsp/bsp-ext'
import * as bsp from '../bsp/bsp'

const TEST_FILE_REGEX = /^.+\.(test|spec)\.tsx?$/

export class TypeScriptLanguageTools
  extends BaseLanguageTools
  implements LanguageTools
{
  isValidTestSource(uri: string): boolean {
    if (uri.includes('node_modules')) return false
    if (uri.includes('bazel-out')) return false
    const filePath = uri.startsWith('file:')
      ? vscode.Uri.parse(uri).fsPath
      : uri
    return TEST_FILE_REGEX.test(path.basename(filePath))
  }

  getDebugRemoteRoot(
    workspaceRoot: string,
    targetUri: string
  ): string | undefined {
    if (!workspaceRoot || !targetUri) {
      return undefined
    }

    const colonIndex = targetUri.lastIndexOf(':')
    if (colonIndex === -1) {
      return undefined
    }
    const targetName = targetUri.slice(colonIndex + 1)

    let packagePath = ''
    const atSlashSlashIndex = targetUri.indexOf('@//')
    if (atSlashSlashIndex !== -1) {
      packagePath = targetUri.slice(atSlashSlashIndex + 3, colonIndex)
    }

    const bazelBinPath = path.join(workspaceRoot, 'bazel-bin')
    let resolvedBazelBin: string
    try {
      resolvedBazelBin = fs.realpathSync(bazelBinPath)
    } catch {
      return undefined
    }

    const execrootMatch = resolvedBazelBin.match(/execroot[/\\]([^/\\]+)/)
    if (!execrootMatch) {
      return undefined
    }
    const workspaceName = execrootMatch[1]

    const pathComponents = [resolvedBazelBin]

    if (packagePath) {
      pathComponents.push(packagePath)
    }

    pathComponents.push(
      `${targetName}_`,
      `${targetName}.runfiles`,
      workspaceName
    )

    return pathComponents.join('/').replace(/\/+/g, '/')
  }

  inferSourcesFromTarget(
    targetUri: string,
    baseDirectory: string | undefined
  ): bsp.SourcesResult | undefined {
    if (!baseDirectory) {
      return undefined
    }

    // Handle :test targets (web-code / Jazelle pattern)
    if (targetUri.endsWith(':test')) {
      const testFiles = this.findTestFilesInDirectory(baseDirectory)
      if (testFiles.length > 0) {
        return {
          items: [
            {
              target: {uri: targetUri},
              sources: testFiles.map(file => ({
                uri: file,
                kind: bsp.SourceItemKind.File,
                generated: false,
              })),
              roots: [],
            },
          ],
        }
      }
      return undefined
    }

    // Handle _jest targets (aspect_rules_jest pattern)
    if (!targetUri.endsWith('_jest')) {
      return undefined
    }

    const colonIndex = targetUri.lastIndexOf(':')
    if (colonIndex === -1) {
      return undefined
    }

    const targetName = targetUri.slice(colonIndex + 1, -5)
    const isTestFile = targetName.includes('_test_')
    const baseName = targetName
      .replace(/_spec_ts_library$/, '')
      .replace(/_test_ts_library$/, '')
      .replace(/_ts_library$/, '')
      .replace(/_spec$/, '')
      .replace(/_test$/, '')
    const extension = isTestFile ? '.test.ts' : '.spec.ts'
    const fileName = baseName.replace(/_/g, '-') + extension
    const normalizedBaseDir = baseDirectory.endsWith('/')
      ? baseDirectory.slice(0, -1)
      : baseDirectory
    const fileUri = `${normalizedBaseDir}/${fileName}`

    return {
      items: [
        {
          target: {uri: targetUri},
          sources: [
            {
              uri: fileUri,
              kind: bsp.SourceItemKind.File,
              generated: false,
            },
          ],
          roots: [],
        },
      ],
    }
  }

  /**
   * Recursively find all test files (*.test.ts, *.spec.ts, *.test.tsx, *.spec.tsx)
   * in a directory. Used for web_test-style targets where tests are discovered
   * by scanning.
   */
  private findTestFilesInDirectory(baseDirectory: string): string[] {
    const testFiles: string[] = []
    const normalizedDir = baseDirectory.startsWith('file://')
      ? baseDirectory.slice(7)
      : baseDirectory

    try {
      this.scanDirectoryForTests(normalizedDir, testFiles)
    } catch {
      // Directory may not exist or be inaccessible
      return []
    }

    // Convert back to file:// URIs
    return testFiles.map(file => `file://${file}`)
  }

  private scanDirectoryForTests(dir: string, results: string[]): void {
    const entries = fs.readdirSync(dir, {withFileTypes: true})

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      // Skip node_modules and other non-relevant directories
      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === 'bazel-out' ||
          entry.name === '.fusion' ||
          entry.name === '__generated__' ||
          entry.name === 'dist' ||
          entry.name === 'coverage'
        ) {
          continue
        }
        this.scanDirectoryForTests(fullPath, results)
      } else if (entry.isFile() && TEST_FILE_REGEX.test(entry.name)) {
        results.push(fullPath)
      }
    }
  }
  mapTestFinishDataToLookupKey(testFinishData: TestFinish): string | undefined {
    if (
      testFinishData.dataKind === TestFinishDataKind.JUnitStyleTestCaseData &&
      testFinishData.data
    ) {
      const testCaseData = testFinishData.data as JUnitStyleTestCaseData
      return testCaseData.className || testFinishData.displayName
    }
    return undefined
  }

  mapTestCaseInfoToLookupKey(testCaseInfo: TestCaseInfo): string | undefined {
    if (!(testCaseInfo instanceof SourceFileTestCaseInfo)) {
      return undefined
    }

    const data = testCaseInfo.getDocumentTestItem()
    return data?.lookupKey
  }

  async getDocumentTestCases(
    document: vscode.Uri,
    workspaceRoot: string
  ): Promise<TestFileContents> {
    const basename = path.basename(document.fsPath)
    const matchesRegex = TEST_FILE_REGEX.test(basename)
    if (!matchesRegex) {
      return {
        isTestFile: false,
        testCases: [],
      }
    }

    const fileContents = await vscode.workspace.fs.readFile(document)
    const text = fileContents.toString()
    const lines = text.split('\n')

    const testCases: DocumentTestItem[] = []
    const documentTest: DocumentTestItem = {
      name: path.basename(document.fsPath),
      range: new vscode.Range(0, 0, 0, 0),
      uri: document,
      testFilter: '',
    }

    const describeStack: DocumentTestItem[] = []
    const indentStack: number[] = []

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]
      const indent = line.search(/\S/)

      if (indent === -1) continue

      while (
        indentStack.length > 0 &&
        indent <= indentStack[indentStack.length - 1]
      ) {
        describeStack.pop()
        indentStack.pop()
      }

      const describeMatch = line.match(/describe\s*\(\s*['"`]([^'"`]+)['"`]/)
      if (describeMatch) {
        const position = new vscode.Position(lineNum, 0)
        const describeName = describeMatch[1]
        const parent =
          describeStack.length > 0
            ? describeStack[describeStack.length - 1]
            : undefined

        const lookupKey = parent?.lookupKey
          ? `${parent.lookupKey} ${describeName}`
          : describeName

        const describeItem: DocumentTestItem = {
          name: describeName,
          range: new vscode.Range(position, position),
          uri: document,
          testFilter: describeName,
          parent: parent,
          lookupKey: lookupKey,
        }
        testCases.push(describeItem)
        describeStack.push(describeItem)
        indentStack.push(indent)
        continue
      }

      const testMatch = line.match(/(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/)
      if (testMatch) {
        const position = new vscode.Position(lineNum, 0)
        const testName = testMatch[1]
        const parent =
          describeStack.length > 0
            ? describeStack[describeStack.length - 1]
            : undefined

        const lookupKey = parent?.lookupKey
          ? `${parent.lookupKey} ${testName}`
          : testName

        const testItem: DocumentTestItem = {
          name: testName,
          range: new vscode.Range(position, position),
          uri: document,
          testFilter: testName,
          parent: parent,
          lookupKey: lookupKey,
        }
        testCases.push(testItem)
      }
    }

    return {
      isTestFile: true,
      testCases: testCases,
      documentTest: documentTest,
    }
  }
}
