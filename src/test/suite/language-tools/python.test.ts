import * as vscode from 'vscode'
import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import {TestStatus} from '../../../bsp/bsp'
import {PythonLanguageTools} from '../../../language-tools/python'
import sinon from 'sinon'
import Sinon from 'sinon'
import {TestFinishDataKind} from '../../../bsp/bsp-ext'
import {
  SourceFileTestCaseInfo,
  TestItemTestCaseInfo,
} from '../../../test-info/test-info'
import {sampleBuildTarget} from '../test-utils'

suite('Python Language Tools', () => {
  let languageTools: PythonLanguageTools
  let executeCommandStub: Sinon.SinonStub
  let testController: vscode.TestController

  const sandbox = sinon.createSandbox()
  beforeEach(async () => {
    testController = vscode.tests.createTestController('py sample', 'sample')
    languageTools = new PythonLanguageTools()
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
  })

  afterEach(() => {
    sandbox.restore()
    testController.dispose()
  })

  test('process test cases', async () => {
    executeCommandStub.resolves(sampleDocumentSymbols)
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///repo/root/sample/my_test.py'),
      '/repo/root/'
    )
    assert.strictEqual(result.isTestFile, true)
    assert.strictEqual(result.testCases.length, 7)

    const expectedTests: Map<string, string[]> = new Map()
    expectedTests.set('TestExample', [
      'sample.my_test.TestExample',
      'my_test and TestExample',
    ])
    expectedTests.set('test_example', [
      'sample.my_test.TestExample.test_example',
      'my_test and TestExample and test_example',
    ])
    expectedTests.set('test_other', [
      'sample.my_test.TestExample.test_other',
      'my_test and TestExample and test_other',
    ])
    expectedTests.set('test_sample', [
      'sample.my_test.TestExample.test_sample',
      'my_test and TestExample and test_sample',
    ])
    expectedTests.set('test_separate_function', [
      'sample.my_test.test_separate_function',
      'my_test and test_separate_function',
    ])
    expectedTests.set('ExampleTest', [
      'sample.my_test.ExampleTest',
      'my_test and ExampleTest',
    ])
    expectedTests.set('test_example_2', [
      'sample.my_test.ExampleTest.test_example_2',
      'my_test and ExampleTest and test_example_2',
    ])

    for (const test of result.testCases) {
      const expected = expectedTests.get(test.name)
      assert.ok(expected)
      assert.strictEqual(test.lookupKey, expected[0])
      assert.strictEqual(test.testFilter, expected[1])
    }
    assert.equal(result.documentTest?.testFilter, 'my_test.py')
    assert.equal(result.documentTest?.name, 'my_test.py')
  })

  test('non test file', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///repo/root/sample/my_file.py'),
      '/repo/root/'
    )
    assert.strictEqual(result.isTestFile, false)
    assert.strictEqual(result.testCases.length, 0)
    assert.ok(executeCommandStub.notCalled)
  })

  test('map test finish data to lookup key', async () => {
    let result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'test_method',
      status: TestStatus.Failed,
      dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
      data: {
        time: 0,
        className: 'my.example.test_example.TestMyClass',
      },
    })
    assert.strictEqual(
      result,
      'my.example.test_example.TestMyClass.test_method'
    )

    result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'test_method',
      status: TestStatus.Failed,
      dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
      data: {
        time: 0,
        className: 'my.example.test_example',
      },
    })
    assert.strictEqual(result, 'my.example.test_example.test_method')

    result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'test_method[example1]',
      status: TestStatus.Failed,
      dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
      data: {
        time: 0,
        className: 'my.example.test_example',
      },
    })
    assert.strictEqual(result, 'my.example.test_example.test_method')

    result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'pytest',
      status: TestStatus.Failed,
    })
    assert.strictEqual(result, undefined)
  })

  test('map test case info to lookup key', async () => {
    let testInfo = testController.createTestItem('test1', 'test1')
    let testCaseInfo = new SourceFileTestCaseInfo(testInfo, sampleBuildTarget())
    testCaseInfo.setDocumentTestItem({
      name: 'my sample',
      range: new vscode.Range(0, 0, 0, 0),
      testFilter: 'test_example and TestMyClass and test_method',
      uri: vscode.Uri.parse('file:///sample/test_example.py'),
      lookupKey: 'my.example.test_example.TestMyClass.test_method',
    })

    let result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(
      result,
      'my.example.test_example.TestMyClass.test_method'
    )

    testInfo = testController.createTestItem('test2', 'test2')
    const sampleDetails = {
      name: 'my sample',
      range: new vscode.Range(0, 0, 0, 0),
      testFilter: 'test_example and TestMyClass and test_method',
      uri: vscode.Uri.parse('file:///sample/test_example.py'),
      lookupKey: 'my.example.test_example.TestMyClass.test_method',
    }
    testCaseInfo = new TestItemTestCaseInfo(
      testInfo,
      sampleBuildTarget(),
      sampleDetails
    )

    result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(
      result,
      'my.example.test_example.TestMyClass.test_method'
    )

    testCaseInfo = new SourceFileTestCaseInfo(testInfo, sampleBuildTarget())
    result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
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
    // Class name that matches but contains no methods.
    name: 'TestExampleEmpty',
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
    children: [],
  },
  {
    name: 'ExampleTest',
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
        name: 'test_example_2',
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
    ],
  },
]
