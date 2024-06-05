import * as vscode from 'vscode'
import * as path from 'path'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'

const TEST_FILE_REGEX = /^(Test.+\.java|.+Test\.java)$/
const JAVA_TEST_REGEX =
  /@Test\s+.*\s+public void (?<methodName>\w+)|public class (?<className>\w+Test)\s+extends/
const PACKAGE_NAME_REGEX =
  /package\s+(?<packageName>([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)*);/

export class JavaLanguageTools implements LanguageTools {
  /**
   * Identification of Java test cases.
   * @param document URI of the document to be analyzed for test cases.
   * @returns Result indicating whether this should be considered a test file, and the analyzed test case contents.
   */
  async getDocumentTestCases(document: vscode.Uri): Promise<TestFileContents> {
    if (!TEST_FILE_REGEX.test(path.basename(document.fsPath))) {
      // Evaluate only test files, and not additional classes that are part of a test package.
      return {
        isTestFile: false,
        testCases: [],
      }
    }

    // Attempt to get document symbols via VS Code API.
    // TODO(IDE-1109): Request document symbols and process them.

    // Fallback to resolve directly from document text.
    // Due to the variety of VS Code extensions and setups in the JVM ecosystem, this allows basic functionality even if the user is missing other extensions or has them misconfigured.
    const result = await this.findTestCasesRegexFallback(document)
    return result
  }

  /**
   * Resolve test case positioning directly from the document text.
   * As this Regex-based approach is slow and limited, it should be used only as a fallback to VS Code's document symbols API.
   * @param uri Document to be evaluated for test cases.
   * @returns Processed TestFileContents containing the data to be added to the TestExplorer.
   */
  private async findTestCasesRegexFallback(
    uri: vscode.Uri
  ): Promise<TestFileContents> {
    // Get document text.
    const textDocument = await vscode.workspace.openTextDocument(uri)
    const text = textDocument.getText()

    const testCases: DocumentTestItem[] = []
    let classTestCase: DocumentTestItem | undefined

    // Match the package name
    const packageMatch = PACKAGE_NAME_REGEX.exec(text)
    const packageName = packageMatch?.groups?.packageName ?? ''

    let match
    const regex = new RegExp(JAVA_TEST_REGEX, 'g')
    while ((match = regex.exec(text)) !== null) {
      const position = textDocument.positionAt(match.index)

      // Each match will contain either the full Class, or an individual test method.
      if (match.groups.className) {
        // Class information will be used to run the whole file.
        classTestCase = {
          name: match.groups.className,
          range: new vscode.Range(position, position),
          uri: uri,
          testFilter: `${packageName}.${match.groups.className}`,
        }
      } else if (match.groups.methodName && classTestCase) {
        // Method information with @Test decorator will be used to run an individual test case.
        const newItem: DocumentTestItem = {
          name: match.groups.methodName,
          range: new vscode.Range(position, position),
          uri: uri,
          testFilter: `${classTestCase?.testFilter}.${match.groups.methodName}`,
        }
        testCases.push(newItem)
      }
    }

    return {
      isTestFile: true,
      documentTest: classTestCase,
      testCases: testCases,
    }
  }
}