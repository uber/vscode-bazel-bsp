import * as vscode from 'vscode'
import * as path from 'path'

import {DocumentTestItem, LanguageTools, TestFileContents} from './manager'
import {TestFinish} from '../bsp/bsp'
import {JUnitStyleTestCaseData, TestFinishDataKind} from '../bsp/bsp-ext'
import {SourceFileTestCaseInfo, TestCaseInfo} from '../test-info/test-info'

const TEST_FILE_REGEX = /^(Test.+\.java|.+Test\.java)$/
const JAVA_TEST_REGEX =
  /@Test\s+.*\s+void (?<methodName>\w+)|class (?<className>(Test\w*|\w+Test))\s+/
const PACKAGE_NAME_REGEX =
  /package\s+(?<packageName>([a-zA-Z_][a-zA-Z0-9_]*)(\.[a-zA-Z_][a-zA-Z0-9_]*)*);/
const PARAMETERIZED_TEST_REGEX = /^(?<lookupKey>.*?)(?=\[.*?\])(.*)$/

export class JavaLanguageTools implements LanguageTools {
  /**
   * Maps testFinishData into a unique identifier for each test case.
   * @param testFinishData TestFinish data reported by the build server.
   * @returns Lookup key to find this test case in the TestRunTracker.
   */
  mapTestFinishDataToLookupKey(testFinishData: TestFinish): string | undefined {
    if (
      testFinishData.dataKind === TestFinishDataKind.JUnitStyleTestCaseData &&
      testFinishData.data
    ) {
      const testCaseData = testFinishData.data as JUnitStyleTestCaseData
      if (testCaseData.className !== undefined) {
        let testCaseName = testFinishData.displayName

        // In case of a parameterized test, keep the method name.
        const match = testCaseName.match(PARAMETERIZED_TEST_REGEX)
        if (match?.groups?.lookupKey) {
          testCaseName = match.groups.lookupKey
        }

        // Use the class name as the base, and append the test case name if available.
        let result = testCaseData.className
        if (testCaseName.length > 0) result += `.${testCaseName}`
        return result
      } else {
        return testFinishData.displayName
      }
    }
    return undefined
  }

  /**
   * Maps a TestCaseValue into a standard lookup key in the TestRunTracker.
   * @param testCaseInfo Test case information to be converted into a lookup key.
   * @returns Lookup key which will be used to identify this test case in the TestRunTracker.
   */
  mapTestCaseInfoToLookupKey(testCaseInfo: TestCaseInfo): string | undefined {
    // Check whether a key is relevant to this TestCase, and return if applicable.
    if (testCaseInfo instanceof SourceFileTestCaseInfo) {
      const data = testCaseInfo.getDocumentTestItem()
      return data?.testFilter
    }

    // For other test case types, e.g. those above an individual source file level, they won't be added to the lookup table.
    // Their children, if present, will also be visited and captured instead.
    return undefined
  }

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
    const fileContents = await vscode.workspace.fs.readFile(uri)
    const text = fileContents.toString()
    const lines = text.split('\n')

    const testCases: DocumentTestItem[] = []
    let classTestCase: DocumentTestItem | undefined

    // Match the package name
    const packageMatch = PACKAGE_NAME_REGEX.exec(text)
    const packageName = packageMatch?.groups?.packageName ?? ''

    let match
    const regex = new RegExp(JAVA_TEST_REGEX, 'g')

    let lineStartIndex = 0
    let currentLine = 0
    while ((match = regex.exec(text)) !== null) {
      // Advance the current line each time there is a match.
      while (lineStartIndex + lines[currentLine].length < match.index) {
        lineStartIndex += lines[currentLine].length + 1 // +1 for the newline character.
        currentLine++
      }
      const position = new vscode.Position(currentLine, 0)

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
