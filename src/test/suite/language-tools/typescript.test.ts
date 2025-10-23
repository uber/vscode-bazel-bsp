import * as vscode from 'vscode'
import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import {TestStatus} from '../../../bsp/bsp'
import {TypeScriptLanguageTools} from '../../../language-tools/typescript'
import {TestFinishDataKind} from '../../../bsp/bsp-ext'
import {
  SourceFileTestCaseInfo,
  TestItemTestCaseInfo,
} from '../../../test-info/test-info'
import {sampleBuildTarget} from '../test-utils'

suite('TypeScript Language Tools', () => {
  let languageTools: TypeScriptLanguageTools
  let testController: vscode.TestController

  beforeEach(async () => {
    testController = vscode.tests.createTestController('ts sample', 'sample')
    languageTools = new TypeScriptLanguageTools()
  })

  afterEach(() => {
    testController.dispose()
  })

  test('non test file', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///repo/root/sample/my_file.ts'),
      '/repo/root/'
    )
    assert.strictEqual(result.isTestFile, false)
    assert.strictEqual(result.testCases.length, 0)
  })

  test('regex patterns for describe and it blocks', async () => {
    const sampleFileContent = `
describe('UserService', () => {
  it('should create a user', () => {
    expect(true).toBe(true)
  })

  it('should delete a user', () => {
    expect(true).toBe(true)
  })
})

describe('AuthService', () => {
  test('should authenticate user', () => {
    expect(true).toBe(true)
  })
})
`
    const DESCRIBE_REGEX = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g
    const TEST_REGEX = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g

    const describes = Array.from(sampleFileContent.matchAll(DESCRIBE_REGEX))
    const tests = Array.from(sampleFileContent.matchAll(TEST_REGEX))

    assert.strictEqual(describes.length, 2)
    assert.strictEqual(tests.length, 3)
    assert.strictEqual(describes[0][1], 'UserService')
    assert.strictEqual(describes[1][1], 'AuthService')
    assert.strictEqual(tests[0][1], 'should create a user')
    assert.strictEqual(tests[1][1], 'should delete a user')
    assert.strictEqual(tests[2][1], 'should authenticate user')
  })

  test('regex patterns for nested describe blocks', async () => {
    const sampleFileContent = `
describe('Outer Suite', () => {
  describe('Inner Suite', () => {
    it('nested test', () => {
      expect(true).toBe(true)
    })
  })
})
`
    const DESCRIBE_REGEX = /describe\s*\(\s*['"`]([^'"`]+)['"`]/g
    const TEST_REGEX = /(?:it|test)\s*\(\s*['"`]([^'"`]+)['"`]/g

    const describes = Array.from(sampleFileContent.matchAll(DESCRIBE_REGEX))
    const tests = Array.from(sampleFileContent.matchAll(TEST_REGEX))

    assert.strictEqual(describes.length, 2)
    assert.strictEqual(tests.length, 1)
  })

  const testCases = [
    {
      description: 'test case with className',
      input: {
        displayName: 'should create a user',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'user.test',
        },
      },
      expected: 'user.test.should create a user',
    },
    {
      description: 'test case without className',
      input: {
        displayName: 'should authenticate',
        status: TestStatus.Passed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 1,
        },
      },
      expected: undefined,
    },
    {
      description: 'result with no data',
      input: {
        displayName: 'jest',
        status: TestStatus.Failed,
      },
      expected: undefined,
    },
    {
      description: 'unknown dataKind',
      input: {
        displayName: 'unknown_test',
        status: TestStatus.Failed,
        dataKind: 'UnknownDataKind',
        data: {
          time: 0,
          className: 'my.example.test',
        },
      },
      expected: undefined,
    },
    {
      description: 'null data gracefully',
      input: {
        displayName: 'null_data_test',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: null,
      },
      expected: undefined,
    },
    {
      description: 'test with special characters',
      input: {
        displayName: 'should handle "quotes" and \'apostrophes\'',
        status: TestStatus.Passed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0.5,
          className: 'special.test',
        },
      },
      expected: 'special.test.should handle "quotes" and \'apostrophes\'',
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
      name: 'should create a user',
      range: new vscode.Range(0, 0, 0, 0),
      testFilter: 'should create a user',
      uri: vscode.Uri.parse('file:///sample/user.test.ts'),
      lookupKey: 'user.test.should create a user',
    })

    let result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(result, 'user.test.should create a user')

    testInfo = testController.createTestItem('test2', 'test2')
    const sampleDetails = {
      name: 'should authenticate',
      range: new vscode.Range(0, 0, 0, 0),
      testFilter: 'should authenticate',
      uri: vscode.Uri.parse('file:///sample/auth.test.ts'),
      lookupKey: 'auth.test.should authenticate',
    }
    testCaseInfo = new TestItemTestCaseInfo(
      testInfo,
      sampleBuildTarget(),
      sampleDetails
    )

    result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(result, 'auth.test.should authenticate')

    testCaseInfo = new SourceFileTestCaseInfo(testInfo, sampleBuildTarget())
    result = languageTools.mapTestCaseInfoToLookupKey(testCaseInfo)
    assert.strictEqual(result, undefined)
  })
})
