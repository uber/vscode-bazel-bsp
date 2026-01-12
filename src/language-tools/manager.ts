import * as vscode from 'vscode'
import {Injectable} from '@nestjs/common'

import * as bsp from '../bsp/bsp'
import {BuildTarget, TestFinish} from '../bsp/bsp'
import {PythonLanguageTools} from './python'
import {BaseLanguageTools} from './base'
import {JavaLanguageTools} from './java'
import {TypeScriptLanguageTools} from './typescript'
import {TestCaseInfo} from '../test-info/test-info'

/**
 * LanguageTools is used to define behavior that should differ based on language.
 * The LanguageToolManager will be used throughout the extension to select the right set of language tools given the conditions.
 */
export interface LanguageTools {
  getDocumentTestCases(
    document: vscode.Uri,
    workspaceRoot: string
  ): Promise<TestFileContents>
  mapTestFinishDataToLookupKey(testFinishData: TestFinish): string | undefined
  mapTestCaseInfoToLookupKey(testCaseInfo: TestCaseInfo): string | undefined
  getDebugRemoteRoot(
    workspaceRoot: string,
    targetUri: string
  ): string | undefined
  isValidTestSource(uri: string): boolean
  inferSourcesFromTarget(
    targetUri: string,
    baseDirectory: string | undefined
  ): bsp.SourcesResult | undefined
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
  private typescriptLanguageTools = new TypeScriptLanguageTools()

  getLanguageTools(target: BuildTarget | undefined): LanguageTools {
    if (target?.languageIds.find(val => val === 'typescript')) {
      return this.typescriptLanguageTools
    } else if (target?.languageIds.find(val => val === 'python')) {
      return this.pythonLanguageTools
    } else if (target?.languageIds.find(val => val === 'java')) {
      return this.javaLanguageTools
    }
    return this.baseLanguageTools
  }

  getLanguageToolsForFile(document: vscode.TextDocument): LanguageTools {
    if (document.languageId === 'typescript') {
      return this.typescriptLanguageTools
    } else if (document.languageId === 'python') {
      return this.pythonLanguageTools
    } else if (document.languageId === 'java') {
      return this.javaLanguageTools
    }
    return this.baseLanguageTools
  }
}
