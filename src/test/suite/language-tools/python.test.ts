import * as vscode from 'vscode'
import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import {LanguageToolManager} from '../../../language-tools/manager'
import {BuildTarget} from '../../../bsp/bsp'
import {PythonLanguageTools} from '../../../language-tools/python'
import sinon from 'sinon'
import Sinon from 'sinon'

suite('Python Language Tools', () => {
  let languageTools: PythonLanguageTools
  let executeCommandStub: Sinon.SinonStub

  const sandbox = sinon.createSandbox()
  beforeEach(async () => {
    languageTools = new PythonLanguageTools()
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
  })

  afterEach(() => {
    sandbox.restore()
  })

  test('process test cases', async () => {
    executeCommandStub.resolves(sampleDocumentSymbols)
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///sample/my_test.py')
    )
    assert.strictEqual(result.isTestFile, true)
    assert.strictEqual(result.testCases.length, 5)

    const expectedTests = [
      'TestExample',
      'test_example',
      'test_other',
      'test_sample',
      'test_separate_function',
    ]
    for (const test of result.testCases) {
      assert.ok(expectedTests.includes(test.name))
    }
  })

  test('non test file', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///sample/my_file.py')
    )
    assert.strictEqual(result.isTestFile, false)
    assert.strictEqual(result.testCases.length, 0)
    assert.ok(executeCommandStub.notCalled)
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
