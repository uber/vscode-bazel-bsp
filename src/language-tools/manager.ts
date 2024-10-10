import * as vscode from 'vscode'
import {Injectable} from '@nestjs/common'

import {BuildTarget, TestFinish} from '../bsp/bsp'
import {PythonLanguageTools} from './python'
import {BaseLanguageTools} from './base'
import {JavaLanguageTools} from './java'
import {TestCaseInfo} from '../test-info/test-info'

/**
 * LanguageTools is used to define behavior that should differ based on language.
 * The LanguageToolManager will be used throughout the extension to select the right set of language tools given the conditions.
 */
export interface LanguageTools {
  // Get a document's test cases and convert them into an intermediate format for use in test case creation.
  getDocumentTestCases(
    document: vscode.Uri,
    workspaceRoot: string
  ): Promise<TestFileContents>
  // Maps test finish data into a unique key that can be used to find an individual test case in a run.
  mapTestFinishDataToLookupKey(testFinishData: TestFinish): string | undefined
  // Maps test case info into a unique key  that can be used to find an individual test case in a run.
  mapTestCaseInfoToLookupKey(testCaseInfo: TestCaseInfo): string | undefined
}

// Results from analyzing a test file.
export type TestFileContents = {
  isTestFile: boolean
  testCases: DocumentTestItem[]
  documentTest?: DocumentTestItem
}

// Test item parsed from the document, including a parent if applicable to determine tree shape.
export type DocumentTestItem = {
  name: string
  range: vscode.Range
  uri: vscode.Uri
  testFilter: string
  parent?: DocumentTestItem
  lookupKey?: string
}

@Injectable()
export class LanguageToolManager {
  private baseLanguageTools = new BaseLanguageTools()
  private pythonLanguageTools = new PythonLanguageTools()
  private javaLanguageTools = new JavaLanguageTools()

  getLanguageTools(target: BuildTarget | undefined): LanguageTools {
    if (target?.languageIds.find(val => val === 'python')) {
      return this.pythonLanguageTools
    } else if (target?.languageIds.find(val => val === 'java')) {
      return this.javaLanguageTools
    }
    return this.baseLanguageTools
  }

  getLanguageToolsForFile(document: vscode.TextDocument): LanguageTools {
    if (document.languageId === 'python') {
      return this.pythonLanguageTools
    } else if (document.languageId === 'java') {
      return this.javaLanguageTools
    }
    return this.baseLanguageTools
  }
}
