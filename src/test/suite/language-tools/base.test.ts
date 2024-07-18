import * as vscode from 'vscode'
import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import {LanguageTools} from '../../../language-tools/manager'
import {BuildTarget} from '../../../bsp/bsp'
import {PythonLanguageTools} from '../../../language-tools/python'
import sinon from 'sinon'
import Sinon from 'sinon'
import {BaseLanguageTools} from '../../../language-tools/base'
import {TestFinish, TestStatus} from '../../../bsp/bsp'
import {TestFinishDataKind} from '../../../bsp/bsp-ext'

suite('Base Language Tools', () => {
  let languageTools: LanguageTools
  let executeCommandStub: Sinon.SinonStub

  const sandbox = sinon.createSandbox()
  beforeEach(async () => {
    languageTools = new BaseLanguageTools()
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
  })

  afterEach(() => {
    sandbox.restore()
  })

  test('process test cases', async () => {
    executeCommandStub.resolves(sampleDocumentSymbols)
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///repo/root/sample/my_test.py'),
      '/repo/root/'
    )
    assert.strictEqual(result.isTestFile, false)
    assert.strictEqual(result.testCases.length, 0)
  })

  test('map test finish data to lookup key', async () => {
    let result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'myTest',
      status: TestStatus.Failed,
      dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
      data: {
        time: 0,
        className: 'com.example.ClassName',
      },
    })
    assert.strictEqual(result, undefined)
  })
})

const sampleDocumentSymbols: vscode.DocumentSymbol[] = [
  {
    name: 'TestExample',
    detail: '',
    kind: vscode.SymbolKind.Class,
    range: new vscode.Range(
      new vscode.Position(8, 0),
      new vscode.Position(35, 44)
    ),
    selectionRange: new vscode.Range(
      new vscode.Position(8, 6),
      new vscode.Position(8, 25)
    ),
    children: [
      {
        name: 'test_example',
        detail: '',
        kind: vscode.SymbolKind.Method,
        range: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(12, 5)
        ),
        selectionRange: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(10, 16)
        ),
        children: [],
      },
      {
        name: 'test_other',
        detail: '',
        kind: vscode.SymbolKind.Method,
        range: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(12, 5)
        ),
        selectionRange: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(10, 16)
        ),
        children: [],
      },
      {
        name: 'not_a_test',
        detail: '',
        kind: vscode.SymbolKind.Method,
        range: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(12, 5)
        ),
        selectionRange: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(10, 16)
        ),
        children: [],
      },
      {
        name: 'test_sample',
        detail: '',
        kind: vscode.SymbolKind.Method,
        range: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(12, 5)
        ),
        selectionRange: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(10, 16)
        ),
        children: [],
      },
      {
        name: 'test_separate_function',
        detail: '',
        kind: vscode.SymbolKind.Function,
        range: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(12, 5)
        ),
        selectionRange: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(10, 16)
        ),
        children: [],
      },
      {
        name: 'non_test_function',
        detail: '',
        kind: vscode.SymbolKind.Function,
        range: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(12, 5)
        ),
        selectionRange: new vscode.Range(
          new vscode.Position(10, 4),
          new vscode.Position(10, 16)
        ),
        children: [],
      },
    ],
  },
]
