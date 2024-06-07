import * as vscode from 'vscode'
import * as path from 'path'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'
import {TestFinish} from '../bsp/bsp'
import {SourceFileTestCaseInfo, TestCaseInfo} from '../test-info/test-info'
import {BaseLanguageTools} from './base'
import {JUnitStyleTestCaseData, TestFinishDataKind} from '../bsp/bsp-ext'

const TEST_FILE_REGEX = /^(test_.+\.py|.+_test\.py)$/

export class PythonLanguageTools
  extends BaseLanguageTools
  implements LanguageTools
{
  /**
   * Maps testFinishData into a unique identifier for each test case.
   * For Python, this will consist of the fully qualified path to the test case:
   *   path.to.test_example.TestMyClass.test_method or  path.to.test_example.test_method
   * @param testFinishData individual TestFinish data reported by build server.
   * @returns Lookup key to find this test case in the TestRunTracker.
   */
  mapTestFinishDataToLookupKey(testFinishData: TestFinish): string | undefined {
    if (testFinishData.dataKind === TestFinishDataKind.JUnitStyleTestCaseData) {
      const testCaseData = testFinishData.data as JUnitStyleTestCaseData
      return `${testCaseData.className}.${testFinishData.displayName}`
    }
    return undefined
  }

  /**
   * Maps a TestCaseValue into a standard lookup key in the TestRunTracker.
   * For Python, this differs in format from the test filter, as it includes the full path to the test case.
   * @param testCaseInfo Test case information to be converted into a lookup key.
   * @returns Lookup key which will be used to identify this test case in the TestRunTracker.
   */
  mapTestCaseInfoToLookupKey(testCaseInfo: TestCaseInfo): string | undefined {
    if (!(testCaseInfo instanceof SourceFileTestCaseInfo)) {
      return undefined
    }

    const data = testCaseInfo.getDocumentTestItem()
    return data?.lookupKey
  }

  /**
   * Identification of Python test cases.
   * @param document URI of the document to be analyzed for test cases.
   * @returns Result indicating whether this should be considered a test file, and the analyzed test case contents.
   */
  async getDocumentTestCases(
    document: vscode.Uri,
    workspaceRoot: string
  ): Promise<TestFileContents> {
    if (!TEST_FILE_REGEX.test(path.basename(document.fsPath))) {
      // Exclude files that do not match Python convention of *_test.py or test_*.py
      return {
        isTestFile: false,
        testCases: [],
      }
    }

    // Generate a prefix to be used for the lookup key.
    // Converts file path, after the repo root, to a Python module path.
    // Example: /path/to/repo/src/test/test_example.py -> src.test.test_example
    let fileInfo = path.parse(path.relative(workspaceRoot, document.fsPath))
    const lookupKeyBase = `${fileInfo.dir.replaceAll('/', '.')}.${
      fileInfo.name
    }`

    // File name to be included in test filter
    const testFilterBase = fileInfo.name

    const fullDocTestItem: DocumentTestItem = {
      name: path.basename(document.fsPath),
      range: new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(0, 0)
      ),
      uri: document,
      testFilter: path.basename(document.fsPath),
    }

    // Document symbols provided by Pylance.
    const symbols: vscode.DocumentSymbol[] =
      await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        document
      )
    const result: DocumentTestItem[] = []
    const evaluateCurrentSymbol = (
      symbol: vscode.DocumentSymbol,
      parent: DocumentTestItem | undefined = undefined
    ) => {
      let newItem: DocumentTestItem | undefined
      if (symbol.kind === vscode.SymbolKind.Class) {
        if (symbol.name.startsWith('Test')) {
          // Capture class names that begin with 'Test'
          newItem = {
            name: symbol.name,
            range: symbol.range,
            uri: document,
            testFilter: `${testFilterBase} and ${symbol.name}`,
            parent: parent,
            lookupKey: `${lookupKeyBase}.${symbol.name}`,
          }
        } else {
          // Per Python test discovery convention, don't evaluate non-test classes.
          return
        }
      } else if (
        // Capture function/method names that begin with 'test'
        (symbol.kind === vscode.SymbolKind.Method ||
          symbol.kind === vscode.SymbolKind.Function) &&
        symbol.name.startsWith('test')
      ) {
        const testFilter = parent
          ? `${parent.testFilter} and ${symbol.name}`
          : `${testFilterBase} and ${symbol.name}`

        const lookupKey = parent?.lookupKey
          ? `${parent.lookupKey}.${symbol.name}`
          : `${lookupKeyBase}.${symbol.name}`

        newItem = {
          name: symbol.name,
          range: symbol.range,
          uri: document,
          testFilter: testFilter,
          parent: parent,
          lookupKey: lookupKey,
        }
      }
      if (newItem) {
        result.push(newItem)
      }

      for (const child of symbol.children) {
        // Recurse through nested symbols.
        evaluateCurrentSymbol(child, newItem ?? parent)
      }
    }

    // Start at top level and evaluate each symbol in the document.
    for (const symbol of symbols) {
      evaluateCurrentSymbol(symbol)
    }

    return {
      isTestFile: true,
      testCases: result,
      documentTest: fullDocTestItem,
    }
  }
}
