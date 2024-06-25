import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import {beforeEach, afterEach} from 'mocha'
import {JavaLanguageTools} from '../../../language-tools/java'
import {TestFinish, TestStatus} from '../../../bsp/bsp'
import {TestFinishDataKind} from '../../../bsp/bsp-ext'
import {
  SourceFileTestCaseInfo,
  TestItemTestCaseInfo,
} from '../../../test-info/test-info'
import {sampleBuildTarget} from '../test-utils'

const fixtureDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src',
  'test',
  'testdata'
)

suite('Java Language Tools', () => {
  let languageTools: JavaLanguageTools
  let testController: vscode.TestController
  beforeEach(async () => {
    testController = vscode.tests.createTestController('java sample', 'sample')
    languageTools = new JavaLanguageTools()
  })

  afterEach(async () => {
    testController.dispose()
  })

  test('process test cases, example 1', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.file(
        path.join(fixtureDir, 'language_files', 'SampleValidExampleTest.java')
      )
    )

    assert.strictEqual(result.isTestFile, true)
    assert.strictEqual(result.testCases.length, 2)

    const expectedBaseTestFilter =
      'com.sample.project.common.client.samplepackage.SampleValidExampleTest'

    const expectedTests = ['testGetInstance', 'testGetSampleClient']
    for (const test of result.testCases) {
      assert.ok(expectedTests.includes(test.name))
      assert.ok(test.testFilter.startsWith(expectedBaseTestFilter))
      assert.ok(test.testFilter.endsWith(test.name))
    }
    assert.equal(result.documentTest?.testFilter, expectedBaseTestFilter)
    assert.equal(result.documentTest?.name, 'SampleValidExampleTest')
  })

  test('process test cases, example 2', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.file(
        path.join(fixtureDir, 'language_files', 'TestSampleValidExample.java')
      )
    )

    assert.strictEqual(result.isTestFile, true)
    assert.strictEqual(result.testCases.length, 2)

    const expectedBaseTestFilter =
      'com.sample.project.common.client.samplepackage.TestSampleValidExample'

    const expectedTests = ['testGetInstance', 'testGetSampleClient']
    for (const test of result.testCases) {
      assert.ok(expectedTests.includes(test.name))
      assert.ok(test.testFilter.startsWith(expectedBaseTestFilter))
      assert.ok(test.testFilter.endsWith(test.name))
    }
    assert.equal(result.documentTest?.testFilter, expectedBaseTestFilter)
    assert.equal(result.documentTest?.name, 'TestSampleValidExample')
  })

  test('no matching test class name', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.file(
        path.join(fixtureDir, 'language_files', 'SampleInvalidTest.java')
      )
    )

    assert.strictEqual(result.isTestFile, true)
    assert.strictEqual(result.testCases.length, 0)
  })

  test('non test file', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///sample/OtherFile.java')
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
    assert.strictEqual(result, 'com.example.ClassName.myTest')

    result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'com.example.MySuite',
      status: TestStatus.Failed,
      dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
      data: {
        time: 0,
      },
    })
    assert.strictEqual(result, 'com.example.MySuite')

    result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'com.example.MySuite',
      status: TestStatus.Failed,
    })
    assert.strictEqual(result, undefined)

    result = languageTools.mapTestFinishDataToLookupKey({
      displayName: 'myTest[example1]',
      status: TestStatus.Failed,
      dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
      data: {
        time: 0,
        className: 'com.example.ClassName',
      },
    })
    assert.strictEqual(result, 'com.example.ClassName.myTest')
  })

  test('map test case info to lookup key', async () => {
    let testInfo = testController.createTestItem('test1', 'test1')
    let testCaseInfo = new SourceFileTestCaseInfo(testInfo, sampleBuildTarget())
    testCaseInfo.setDocumentTestItem({
      name: 'my sample',
      range: new vscode.Range(0, 0, 0, 0),
      testFilter: 'com.example.ClassName.myTest',
      uri: vscode.Uri.parse('file:///sample/MyTest.java'),
    })

    let result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(result, 'com.example.ClassName.myTest')

    testInfo = testController.createTestItem('test2', 'test2')
    const sampleDetails = {
      name: 'my sample',
      range: new vscode.Range(0, 0, 0, 0),
      testFilter: 'com.example.ClassName.myTest',
      uri: vscode.Uri.parse('file:///sample/MyTest.java'),
    }
    testCaseInfo = new TestItemTestCaseInfo(
      testInfo,
      sampleBuildTarget(),
      sampleDetails
    )

    result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(result, 'com.example.ClassName.myTest')

    testCaseInfo = new SourceFileTestCaseInfo(testInfo, sampleBuildTarget())
    result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(result, undefined)
  })
})
