import * as vscode from 'vscode'
import * as path from 'path'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'
import {TestFinish} from '../bsp/bsp'
import {SourceFileTestCaseInfo, TestCaseInfo} from '../test-info/test-info'
import {BaseLanguageTools} from './base'

const TEST_FILE_REGEX = /^(test_.+\.py|.+_test\.py)$/

export class PythonLanguageTools
  extends BaseLanguageTools
  implements LanguageTools
{
  /**
   * Identification of Python test cases.
   * @param document URI of the document to be analyzed for test cases.
   * @returns Result indicating whether this should be considered a test file, and the analyzed test case contents.
   */
  async getDocumentTestCases(document: vscode.Uri): Promise<TestFileContents> {
    if (!TEST_FILE_REGEX.test(path.basename(document.fsPath))) {
      // Exclude files that do not match Python convention of *_test.py or test_*.py
      return {
        isTestFile: false,
        testCases: [],
      }
    }

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
            testFilter: symbol.name,
            parent: parent,
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
        newItem = {
          name: symbol.name,
          range: symbol.range,
          uri: document,
          testFilter: symbol.name,
          parent: parent,
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
