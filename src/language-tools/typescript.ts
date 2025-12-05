import * as vscode from 'vscode'
import * as path from 'path'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'
import {TestFinish} from '../bsp/bsp'
import {SourceFileTestCaseInfo, TestCaseInfo} from '../test-info/test-info'
import {BaseLanguageTools} from './base'
import {JUnitStyleTestCaseData, TestFinishDataKind} from '../bsp/bsp-ext'

const TEST_FILE_REGEX = /^.+\.test\.ts$/

export class TypeScriptLanguageTools
  extends BaseLanguageTools
  implements LanguageTools
{
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
