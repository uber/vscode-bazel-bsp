import * as vscode from 'vscode'
import * as path from 'path'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'
import {TestFinish} from '../bsp/bsp'
import {SourceFileTestCaseInfo, TestCaseInfo} from '../test-info/test-info'
import {BaseLanguageTools} from './base'
import {JUnitStyleTestCaseData, TestFinishDataKind} from '../bsp/bsp-ext'
import * as bsp from '../bsp/bsp'

const TEST_FILE_REGEX = /^.+\.(test|spec)\.ts$/

export class TypeScriptLanguageTools
  extends BaseLanguageTools
  implements LanguageTools
{
  static isValidTestSource(uri: string): boolean {
    if (uri.includes('node_modules')) return false
    if (uri.includes('bazel-out')) return false
    return true
  }

  /**
   * Constructs the debug remoteRoot path for a jest_test target.
   * This path points to the Bazel runfiles directory where the test runs.
   *
   * @param executionRoot The Bazel execution root (from `bazel info execution_root`)
   * @param targetUri The target URI (e.g., `@//:calculate_test`)
   * @param platform The Bazel platform configuration (e.g., `darwin_arm64-fastbuild`)
   * @returns The remoteRoot path for debugging, or undefined if construction fails
   *
   * @example
   * executionRoot: "/private/var/tmp/_bazel_hoseni/.../execroot/typescript_jest_test"
   * targetUri: "@//:calculate_test"
   * platform: "darwin_arm64-fastbuild"
   * returns: "/private/var/tmp/_bazel_hoseni/.../execroot/typescript_jest_test/bazel-out/darwin_arm64-fastbuild/bin/calculate_test_/calculate_test.runfiles/typescript_jest_test"
   */
  static constructDebugRemoteRoot(
    executionRoot: string,
    targetUri: string,
    platform?: string
  ): string | undefined {
    if (!executionRoot || !targetUri) {
      return undefined
    }

    // Extract target name from URI (e.g., "@//:calculate_test" -> "calculate_test")
    const colonIndex = targetUri.lastIndexOf(':')
    if (colonIndex === -1) {
      return undefined
    }
    const targetName = targetUri.slice(colonIndex + 1)

    // Extract workspace name from execution root
    // execution_root format: .../execroot/{workspace_name}x
    const execrootMatch = executionRoot.match(/execroot[/\\]([^/\\]+)$/)
    if (!execrootMatch) {
      return undefined
    }
    const workspaceName = execrootMatch[1]

    // Use provided platform or try to detect from execution root path
    // If not found, use a default that should work for most cases
    let platformToUse = platform || 'darwin_arm64-fastbuild' // Default fallback
    if (!platform) {
      const platformMatch = executionRoot.match(
        /bazel-out[/\\]([^/\\]+-[^/\\]+)/
      )
      if (platformMatch) {
        platformToUse = platformMatch[1]
      }
    }

    // Construct the runfiles path
    // Format: {execution_root}/bazel-out/{platform}/bin/{target_name}_/{target_name}.runfiles/{workspace_name}
    // Use forward slashes since Bazel paths are always Unix-style
    const remoteRoot = [
      executionRoot,
      'bazel-out',
      platformToUse,
      'bin',
      `${targetName}_`,
      `${targetName}.runfiles`,
      workspaceName,
    ]
      .join('/')
      .replace(/\/+/g, '/') // Normalize multiple slashes

    return remoteRoot
  }

  static inferSourcesFromJestTarget(
    targetUri: string,
    baseDirectory: string | undefined
  ): bsp.SourcesResult | undefined {
    if (!targetUri.endsWith('_jest') || !baseDirectory) {
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
    const fileUri = `${baseDirectory}/${fileName}`

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
    if (!TEST_FILE_REGEX.test(path.basename(document.fsPath))) {
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
