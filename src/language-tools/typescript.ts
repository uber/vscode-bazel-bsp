import * as vscode from 'vscode'
import * as path from 'path'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'
import {TestFinish} from '../bsp/bsp'
import {SourceFileTestCaseInfo, TestCaseInfo} from '../test-info/test-info'
import {BaseLanguageTools} from './base'
import {JUnitStyleTestCaseData, TestFinishDataKind} from '../bsp/bsp-ext'

const TEST_FILE_REGEX =
  /^(.+\.test\.ts|.+\.spec\.ts|.+\.test\.tsx|.+\.spec\.tsx)$/

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
      if (testCaseData.className) {
        return `${testCaseData.className}.${testFinishData.displayName}`
      }
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
    const fileName = path.basename(
      document.fsPath,
      path.extname(document.fsPath)
    )
    const documentTest: DocumentTestItem = {
      name: path.basename(document.fsPath),
      range: new vscode.Range(0, 0, 0, 0),
      uri: document,
      testFilter: '',
    }

    const DESCRIBE_REGEX = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g
    const TEST_REGEX = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g

    let currentDescribe: DocumentTestItem | undefined
    let lineStartIndex = 0
    let currentLine = 0

    const describeMatches = Array.from(text.matchAll(DESCRIBE_REGEX))
    for (const match of describeMatches) {
      while (lineStartIndex + lines[currentLine].length < match.index!) {
        lineStartIndex += lines[currentLine].length + 1
        currentLine++
      }

      const position = new vscode.Position(currentLine, 0)
      currentDescribe = {
        name: match[1],
        range: new vscode.Range(position, position),
        uri: document,
        testFilter: match[1],
        lookupKey: `${fileName}.${match[1]}`,
      }
      testCases.push(currentDescribe)
    }

    lineStartIndex = 0
    currentLine = 0

    const testMatches = Array.from(text.matchAll(TEST_REGEX))
    for (const match of testMatches) {
      while (lineStartIndex + lines[currentLine].length < match.index!) {
        lineStartIndex += lines[currentLine].length + 1
        currentLine++
      }

      const position = new vscode.Position(currentLine, 0)
      const testName = match[1]
      const testItem: DocumentTestItem = {
        name: testName,
        range: new vscode.Range(position, position),
        uri: document,
        testFilter: testName,
        parent: currentDescribe,
        lookupKey: `${fileName}.${testName}`,
      }
      testCases.push(testItem)
    }

    return {
      isTestFile: true,
      testCases: testCases,
      documentTest: documentTest,
    }
  }
}
