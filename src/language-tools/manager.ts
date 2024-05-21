import * as vscode from 'vscode'
import {Injectable} from '@nestjs/common'

import {BuildTarget} from '../bsp/bsp'
import {PythonLanguageTools} from './python'
import {BaseLanguageTools} from './base'

/**
 * LanguageTools is used to define behavior that should differ based on language.
 * The LanguageToolManager will be used throughout the extension to select the right set of language tools given the conditions.
 */
export interface LanguageTools {
  // Get a document's test cases and convert them into an intermediate format for use in test case creation.
  getDocumentTestCases(document: vscode.Uri): Promise<TestFileContents>
}

// Results from analyzing a test file.
export type TestFileContents = {
  isTestFile: boolean
  testCases: DocumentTestItem[]
}

// Test item parsed from the document, including a parent if applicable to determine tree shape.
export type DocumentTestItem = {
  name: string
  range: vscode.Range
  uri: vscode.Uri
  testFilter: string
  parent?: DocumentTestItem
}

@Injectable()
export class LanguageToolManager {
  private baseLanguageTools = new BaseLanguageTools()
  private pythonLanguageTools = new PythonLanguageTools()

  getLanguageTools(target: BuildTarget): LanguageTools {
    if (target.languageIds.find(val => val === 'python')) {
      return this.pythonLanguageTools
    }
    return this.baseLanguageTools
  }
}
