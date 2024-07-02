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

  const testCases = [
    {
      description: 'test method within a class',
      input: {
        displayName: 'myTest',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'com.example.ClassName',
        },
      },
      expected: 'com.example.ClassName.myTest',
    },
    {
      description: 'suite level test case',
      input: {
        displayName: 'com.example.MySuite',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
        },
      },
      expected: 'com.example.MySuite',
    },
    {
      description: 'no dataKind provided',
      input: {
        displayName: 'com.example.MySuite',
        status: TestStatus.Failed,
      },
      expected: undefined,
    },
    {
      description: 'parameterized test cases',
      input: {
        displayName: 'myTest[example1]',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'com.example.ClassName',
        },
      },
      expected: 'com.example.ClassName.myTest',
    },
    {
      description: 'parameterized test with special characters',
      input: {
        displayName: 'testMethod[example1!@#]',
        status: TestStatus.Passed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 1,
          className: 'com.example.SpecialCharsExample',
        },
      },
      expected: 'com.example.SpecialCharsExample.testMethod',
    },
    {
      description: 'parameterized test with spaces',
      input: {
        displayName: 'testMethod[example with spaces]',
        status: TestStatus.Skipped,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0.5,
          className: 'com.example.SpaceTestExample',
        },
      },
      expected: 'com.example.SpaceTestExample.testMethod',
    },
    {
      description: 'parameterized test with multiple brackets',
      input: {
        displayName: 'testMethod[example[inner]]',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 2,
          className: 'com.example.MultiBracketTestExample',
        },
      },
      expected: 'com.example.MultiBracketTestExample.testMethod',
    },
    {
      description: 'parameterized test with numbers',
      input: {
        displayName: 'testMethod[12345]',
        status: TestStatus.Passed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0.1,
          className: 'com.example.NumericTestExample',
        },
      },
      expected: 'com.example.NumericTestExample.testMethod',
    },
    {
      description: 'parameterized test with empty brackets',
      input: {
        displayName: 'testMethod[]',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 1.5,
          className: 'com.example.EmptyBracketTestExample',
        },
      },
      expected: 'com.example.EmptyBracketTestExample.testMethod',
    },
    {
      description: 'parameterized test with special symbols',
      input: {
        displayName: 'testMethod[!@#$%^&*()]',
        status: TestStatus.Skipped,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 3,
          className: 'com.example.SymbolsTestExample',
        },
      },
      expected: 'com.example.SymbolsTestExample.testMethod',
    },
    {
      description: 'parameterized test with long name',
      input: {
        displayName: 'testMethod[averylongsubtestnamethatisunusuallylong]',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 2.5,
          className: 'com.example.LongNameTestExample',
        },
      },
      expected: 'com.example.LongNameTestExample.testMethod',
    },
    {
      description: 'parameterized test with nested brackets',
      input: {
        displayName: 'testMethod[example[nested[brackets]]]',
        status: TestStatus.Passed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0.2,
          className: 'com.example.NestedBracketsTestExample',
        },
      },
      expected: 'com.example.NestedBracketsTestExample.testMethod',
    },
    {
      description: 'successful tests with data',
      input: {
        displayName: 'mySuccessfulTest',
        status: TestStatus.Passed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 1,
          className: 'com.example.SuccessClass',
        },
      },
      expected: 'com.example.SuccessClass.mySuccessfulTest',
    },
    {
      description: 'tests with no className',
      input: {
        displayName: 'myTestWithoutClass',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 2,
        },
      },
      expected: 'myTestWithoutClass',
    },
    {
      description: 'unknown dataKind',
      input: {
        displayName: 'unknownTest',
        status: TestStatus.Failed,
        dataKind: 'UnknownDataKind',
        data: {
          time: 0,
          className: 'com.example.UnknownClass',
        },
      },
      expected: undefined,
    },
    {
      description: 'null data gracefully',
      input: {
        displayName: 'nullDataTest',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: null,
      },
      expected: undefined,
    },
    {
      description: 'numeric displayName',
      input: {
        displayName: '123456',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'com.example.ClassName',
        },
      },
      expected: 'com.example.ClassName.123456',
    },
    {
      description: 'special characters in displayName',
      input: {
        displayName: '!@#$%^&*()',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'com.example.ClassName',
        },
      },
      expected: 'com.example.ClassName.!@#$%^&*()',
    },
    {
      description: 'empty string as displayName',
      input: {
        displayName: '',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'com.example.ClassName',
        },
      },
      expected: 'com.example.ClassName',
    },
  ]

  for (const testCase of testCases) {
    test(`map test finish data to lookup key: ${testCase.description}`, async () => {
      const result = languageTools.mapTestFinishDataToLookupKey(testCase.input)
      assert.strictEqual(result, testCase.expected)
    })
  }

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
