import * as vscode from 'vscode'
import {LanguageTools, TestFileContents} from './manager'
import * as bsp from '../bsp/bsp'
import {TestFinish} from '../bsp/bsp'
import {TestCaseInfo} from '../test-info/test-info'

/**
 * Fallback implementation for languages that do not have their own specific logic built out.
 */
export class BaseLanguageTools implements LanguageTools {
  /**
   * No support for individual test case updates.
   * @param testFinishData individual TestFinish data reported by build server.
   * @returns undefined as there is no support for individual test case identification.
   */
  mapTestFinishDataToLookupKey(testFinishData: TestFinish): string | undefined {
    return undefined
  }

  /**
   * No support for individual test case updates.
   * @param testFinishData individual TestFinish data reported by build server.
   * @returns undefined as there is no support for individual test case identification.
   */
  mapTestCaseInfoToLookupKey(testCaseInfo: TestCaseInfo): string | undefined {
    return undefined
  }

  async getDocumentTestCases(
    document: vscode.Uri,
    workspaceRoot: string
  ): Promise<TestFileContents> {
    return {
      isTestFile: false,
      testCases: [],
    }
  }

  getDebugRemoteRoot(
    workspaceRoot: string,
    targetUri: string
  ): string | undefined {
    return undefined
  }

  isValidTestSource(uri: string): boolean {
    return true
  }

  inferSourcesFromTarget(
    targetUri: string,
    baseDirectory: string | undefined
  ): bsp.SourcesResult | undefined {
    return undefined
  }
}
