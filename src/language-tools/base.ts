import * as vscode from 'vscode'
import {LanguageTools, TestFileContents} from './manager'

/**
 * Fallback implementation for languages that do not have their own specific logic built out.
 */
export class BaseLanguageTools implements LanguageTools {
  /**
   * No support for individual test cases or test file identification.
   * @param document URI of the document to be analyzed for test cases.
   * @returns Result always contains isTestFile value of true, and no test cases.
   */
  async getDocumentTestCases(document: vscode.Uri): Promise<TestFileContents> {
    return {
      // Do not filter out any files.
      isTestFile: true,
      // No test case discovery.
      testCases: [],
    }
  }
}
