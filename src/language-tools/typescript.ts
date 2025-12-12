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
