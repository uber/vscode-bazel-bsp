import * as vscode from 'vscode'
import * as assert from 'assert'
import * as fs from 'fs'
import sinon from 'sinon'
import {
  BuildTargetTestCaseInfo,
  SourceDirTestCaseInfo,
  SourceFileTestCaseInfo,
  TargetDirTestCaseInfo,
  TestCaseInfo,
  TestItemTestCaseInfo,
  TestItemType,
} from '../../test-info/test-info'
import {BuildTarget, StatusCode, TestResult} from '../../bsp/bsp'
import {TestCaseStatus, TestRunTracker} from '../../test-runner/run-tracker'
import {beforeEach, afterEach} from 'mocha'
import {TestParamsDataKind} from '../../bsp/bsp-ext'
import {DocumentTestItem} from '../../language-tools/manager'
import {Utils} from '../../utils/utils'

suite('TestInfo', () => {
  const sampleTarget: BuildTarget = {
    id: {uri: '//sample/target:test'},
    tags: [],
    languageIds: [],
    dependencies: [],
    capabilities: {},
  }
  const sampleTypeScriptTarget: BuildTarget = {
    ...sampleTarget,
    languageIds: ['typescript'],
  }

  let testController: vscode.TestController
  const sandbox = sinon.createSandbox()
  beforeEach(() => {
    testController = vscode.tests.createTestController(
      'testController',
      'testController'
    )
  })

  afterEach(() => {
    testController.dispose()
    sandbox.restore()
  })

  suite('Test Run Params', () => {
    const testCases = [
      {
        profile: vscode.TestRunProfileKind.Run,
        expectedResult: {
          arguments: [],
          environmentVariables: {},
          originId: 'sample',
          targets: [
            {
              uri: '//sample/target:test',
            },
          ],
          workingDirectory: '',
          dataKind: TestParamsDataKind.BazelTest,
          data: {
            coverage: false,
          },
        },
      },
      {
        profile: vscode.TestRunProfileKind.Coverage,
        expectedResult: {
          arguments: [],
          environmentVariables: {},
          originId: 'sample',
          targets: [
            {
              uri: '//sample/target:test',
            },
          ],
          workingDirectory: '',
          dataKind: TestParamsDataKind.BazelTest,
          data: {
            coverage: true,
          },
        },
      },
    ]

    test('build target', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)
      for (const testCase of testCases) {
        const currentRun = sandbox.createStubInstance(TestRunTracker)
        sandbox.stub(currentRun, 'originName').get(() => 'sample')
        currentRun.getRunProfileKind.returns(testCase.profile)
        const result = testInfo.prepareTestRunParams(currentRun)
        assert.deepStrictEqual(result, testCase.expectedResult)
      }
    })

    test('non-typescript source directory runs target directly', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new SourceDirTestCaseInfo(
        testItem,
        sampleTarget,
        '/sample/dir'
      )
      for (const testCase of testCases) {
        const currentRun = sandbox.createStubInstance(TestRunTracker)
        sandbox.stub(currentRun, 'originName').get(() => 'sample')
        currentRun.getRunProfileKind.returns(testCase.profile)
        const result = testInfo.prepareTestRunParams(currentRun)
        assert.deepStrictEqual(result, testCase.expectedResult)
      }
    })

    test('typescript source directory defers to source file runs', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new SourceDirTestCaseInfo(
        testItem,
        sampleTypeScriptTarget,
        '/sample/dir'
      )
      const currentRun = sandbox.createStubInstance(TestRunTracker)
      const result = testInfo.prepareTestRunParams(currentRun)
      assert.equal(result, undefined)
    })

    test('source file', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const sampleDetails: DocumentTestItem = {
        uri: vscode.Uri.parse('file:///sample/file'),
        name: 'test',
        parent: undefined,
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: 'myDocumentName.py',
      }

      const testInfo = new SourceFileTestCaseInfo(testItem, sampleTarget)
      testInfo.setDocumentTestItem(sampleDetails)
      assert.deepStrictEqual(testInfo.getDocumentTestItem(), sampleDetails)

      for (const testCase of testCases) {
        const currentRun = sandbox.createStubInstance(TestRunTracker)
        sandbox.stub(currentRun, 'originName').get(() => 'sample')
        currentRun.getRunProfileKind.returns(testCase.profile)
        const result = testInfo.prepareTestRunParams(currentRun)
        assert.ok(result)
        for (const key in testCase.expectedResult) {
          if (key !== 'data') {
            assert.deepStrictEqual(
              result[key],
              testCase.expectedResult[key],
              `Field ${key} does not match`
            )
          }
        }
        assert.deepStrictEqual(result.data, {
          testFilter: sampleDetails.testFilter,
          coverage: testCase.expectedResult.data.coverage,
        })
      }
    })

    test('typescript source file adds file argument', async () => {
      sandbox
        .stub(Utils, 'getWorkspaceRoot')
        .returns(vscode.Uri.file('/sample'))

      const testItem = testController.createTestItem('sample', 'sample')
      const sampleDetails: DocumentTestItem = {
        uri: vscode.Uri.file('/sample/src/example/__tests__/sample.browser.ts'),
        name: 'sample.browser.ts',
        parent: undefined,
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: '',
      }

      const testInfo = new SourceFileTestCaseInfo(
        testItem,
        sampleTypeScriptTarget
      )
      testInfo.setDocumentTestItem(sampleDetails)

      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
      currentRun.getRunProfileKind.returns(vscode.TestRunProfileKind.Run)

      const result = testInfo.prepareTestRunParams(currentRun)
      assert.ok(result)
      assert.deepStrictEqual(result.arguments, [
        'src/example/__tests__/sample.browser.ts',
      ])
      assert.deepStrictEqual(result.data, {
        coverage: false,
      })
    })

    test('typescript source file adds file argument before test case analysis', async () => {
      sandbox
        .stub(Utils, 'getWorkspaceRoot')
        .returns(vscode.Uri.file('/sample'))

      const testItem = testController.createTestItem(
        'sample',
        'sample',
        vscode.Uri.file('/sample/src/example/__tests__/sample.browser.ts')
      )
      const testInfo = new SourceFileTestCaseInfo(
        testItem,
        sampleTypeScriptTarget
      )

      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
      currentRun.getRunProfileKind.returns(vscode.TestRunProfileKind.Run)

      const result = testInfo.prepareTestRunParams(currentRun)
      assert.ok(result)
      assert.deepStrictEqual(result.arguments, [
        'src/example/__tests__/sample.browser.ts',
      ])
    })

    test('test case', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const sampleDetails: DocumentTestItem = {
        uri: vscode.Uri.parse('file:///sample/file'),
        name: 'test',
        parent: undefined,
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: 'myTestFilter',
      }

      const testInfo = new TestItemTestCaseInfo(
        testItem,
        sampleTarget,
        sampleDetails
      )
      for (const testCase of testCases) {
        const currentRun = sandbox.createStubInstance(TestRunTracker)
        sandbox.stub(currentRun, 'originName').get(() => 'sample')
        currentRun.getRunProfileKind.returns(testCase.profile)
        const result = testInfo.prepareTestRunParams(currentRun)
        assert.ok(result)
        for (const key in testCase.expectedResult) {
          if (key !== 'data') {
            assert.deepStrictEqual(
              result[key],
              testCase.expectedResult[key],
              `Field ${key} does not match`
            )
          }
        }
        assert.deepStrictEqual(result.data, {
          testFilter: sampleDetails.testFilter,
          coverage: testCase.expectedResult.data.coverage,
        })
      }
    })

    test('typescript test case adds file argument and test filter', async () => {
      sandbox
        .stub(Utils, 'getWorkspaceRoot')
        .returns(vscode.Uri.file('/sample'))

      const testItem = testController.createTestItem('sample', 'sample')
      const sampleDetails: DocumentTestItem = {
        uri: vscode.Uri.file('/sample/src/example/__tests__/sample.browser.ts'),
        name: 'renders selected state',
        parent: undefined,
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: 'renders selected state',
      }

      const testInfo = new TestItemTestCaseInfo(
        testItem,
        sampleTypeScriptTarget,
        sampleDetails
      )
      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
      currentRun.getRunProfileKind.returns(vscode.TestRunProfileKind.Run)

      const result = testInfo.prepareTestRunParams(currentRun)
      assert.ok(result)
      assert.deepStrictEqual(result.arguments, [
        'src/example/__tests__/sample.browser.ts',
      ])
      assert.deepStrictEqual(result.data, {
        testFilter: sampleDetails.testFilter,
        coverage: false,
      })
    })

    test('root', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      let testInfo = new TestCaseInfo(testItem, undefined, TestItemType.Root)

      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
      const result = testInfo.prepareTestRunParams(currentRun)
      assert.equal(result, undefined)
    })

    test('target directory', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new TargetDirTestCaseInfo(testItem, '/sample/dir')
      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
      const result = testInfo.prepareTestRunParams(currentRun)
      assert.equal(result, undefined)
    })

    test('build target with IDE tag', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)

      // Test with IDE tag
      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
      currentRun.getRunProfileKind.returns(vscode.TestRunProfileKind.Run)
      currentRun.getIdeTag.returns('--test_env=IDE_CLIENT=cursor')

      const result = testInfo.prepareTestRunParams(currentRun)
      assert.deepStrictEqual(result, {
        arguments: [],
        environmentVariables: {},
        originId: 'sample',
        targets: [
          {
            uri: '//sample/target:test',
          },
        ],
        workingDirectory: '',
        dataKind: TestParamsDataKind.BazelTest,
        data: {
          coverage: false,
          additionalBazelParams: '--test_env=IDE_CLIENT=cursor',
        },
      })
    })

    test('build target with IDE tag and debug flags', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)

      // Test with IDE tag and debug flags
      const currentRunWithDebug = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRunWithDebug, 'originName').get(() => 'sample')
      currentRunWithDebug.getRunProfileKind.returns(
        vscode.TestRunProfileKind.Debug
      )
      currentRunWithDebug.getIdeTag.returns('--define=ide_client=vscode')
      currentRunWithDebug.getDebugBazelFlags.returns(['--flag1', '--flag2'])

      const resultWithDebug = testInfo.prepareTestRunParams(currentRunWithDebug)
      assert.deepStrictEqual(resultWithDebug, {
        arguments: [],
        environmentVariables: {},
        originId: 'sample',
        targets: [
          {
            uri: '//sample/target:test',
          },
        ],
        workingDirectory: '',
        dataKind: TestParamsDataKind.BazelTest,
        data: {
          coverage: false,
          additionalBazelParams: '--flag1 --flag2 --define=ide_client=vscode',
        },
      })
    })
  })

  suite('Set display name', () => {
    test('source directory, compare to different item type', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new SourceDirTestCaseInfo(
        testItem,
        sampleTarget,
        '/sample/dir'
      )
      const relativeToItem = new BuildTargetTestCaseInfo(
        testController.createTestItem('sample', 'sample'),
        sampleTarget
      )
      testInfo.setDisplayName(relativeToItem)
      assert.equal(testItem.label, '/sample/dir')
    })

    test('source directory, compare to same item type', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new SourceDirTestCaseInfo(
        testItem,
        sampleTarget,
        '/sample/dir'
      )
      const relativeToItem = new SourceDirTestCaseInfo(
        testController.createTestItem('sample', 'sample'),
        sampleTarget,
        '/sample'
      )
      testInfo.setDisplayName(relativeToItem)
      assert.equal(testItem.label, 'dir')
    })

    test('target directory, compare to different item type', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new TargetDirTestCaseInfo(testItem, '/sample/dir')
      const relativeToItem = new BuildTargetTestCaseInfo(
        testController.createTestItem('sample', 'sample'),
        sampleTarget
      )
      testInfo.setDisplayName(relativeToItem)
      assert.equal(testItem.label, '/sample/dir')
    })

    test('target directory, compare to same item type', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new TargetDirTestCaseInfo(testItem, '/sample/dir')
      const relativeToItem = new TargetDirTestCaseInfo(
        testController.createTestItem('sample', 'sample'),
        '/sample'
      )
      testInfo.setDisplayName(relativeToItem)
      assert.equal(testItem.label, 'dir')
    })

    test('build target', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)
      testInfo.setDisplayName()
      assert.equal(testItem.label, 'test')
    })

    test('test case', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const sampleDetails: DocumentTestItem = {
        uri: vscode.Uri.parse('file:///sample/file'),
        name: 'test',
        parent: undefined,
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: 'test',
      }
      const testInfo = new TestItemTestCaseInfo(
        testItem,
        sampleTarget,
        sampleDetails
      )
      testInfo.setDisplayName()
      assert.equal(testItem.label, 'test')
    })
  })

  suite('Test Run Result', () => {
    let testItem: vscode.TestItem
    let currentRun: sinon.SinonStubbedInstance<TestRunTracker>

    beforeEach(() => {
      testItem = testController.createTestItem('sample', 'sample')

      currentRun = sandbox.createStubInstance(TestRunTracker)
      currentRun.pendingChildrenIterator.returns((function* (parent) {})())
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
    })

    function createTypeScriptTestCase(
      id: string,
      label: string,
      lookupKey?: string
    ) {
      const item = testController.createTestItem(id, label)
      const info = new TestItemTestCaseInfo(item, sampleTypeScriptTarget, {
        uri: vscode.Uri.file('/sample/src/example/__tests__/sample.browser.ts'),
        name: label,
        parent: undefined,
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: label,
        lookupKey,
      })
      return {item, info}
    }

    test('ok result, build target', async () => {
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)
      const bspResult: TestResult = {
        statusCode: StatusCode.Ok,
        originId: 'sample',
      }
      testInfo.processTestRunResult(currentRun, bspResult)
      assert.ok(
        currentRun.updateStatus.calledOnceWithExactly(
          testItem,
          TestCaseStatus.Passed
        )
      )

      assert.ok(
        currentRun.pendingChildrenIterator.calledOnceWithExactly(
          testItem,
          TestItemType.BazelTarget
        )
      )
    })

    test('ok result, source file marks pending children passed', async () => {
      const childItem = testController.createTestItem('child', 'child')
      const childInfo = new TestItemTestCaseInfo(
        childItem,
        sampleTypeScriptTarget,
        {
          uri: vscode.Uri.file(
            '/sample/src/example/__tests__/sample.browser.ts'
          ),
          name: 'child',
          parent: undefined,
          range: new vscode.Range(0, 0, 0, 0),
          testFilter: 'child',
        }
      )
      currentRun.pendingChildrenIterator.returns(
        (function* () {
          yield childInfo
        })()
      )

      const testInfo = new SourceFileTestCaseInfo(
        testItem,
        sampleTypeScriptTarget
      )
      const bspResult: TestResult = {
        statusCode: StatusCode.Ok,
        originId: 'sample',
      }

      testInfo.processTestRunResult(currentRun, bspResult)

      assert.ok(
        currentRun.updateStatus.calledWithExactly(
          testItem,
          TestCaseStatus.Passed
        )
      )
      assert.ok(
        currentRun.updateStatus.calledWithExactly(
          childItem,
          TestCaseStatus.Passed
        )
      )
      assert.ok(
        currentRun.pendingChildrenIterator.calledOnceWithExactly(
          testItem,
          TestItemType.SourceFile
        )
      )
    })

    test('error result, source file preserves mixed child statuses from jest output', async () => {
      sandbox
        .stub(fs, 'readFileSync')
        .returns(
          [
            '    ✕ fails one child test (8 ms)',
            '    ✓ passes a sibling child test (1 ms)',
          ].join('\n')
        )

      const failed = createTypeScriptTestCase('failed', 'fails one child test')
      const passed = createTypeScriptTestCase(
        'passed',
        'passes a sibling child test'
      )
      currentRun.pendingChildrenIterator.returns(
        (function* () {
          yield failed.info
          yield passed.info
        })()
      )

      const testInfo = new SourceFileTestCaseInfo(
        testItem,
        sampleTypeScriptTarget
      )
      const bspResult: TestResult = {
        statusCode: StatusCode.Error,
        originId: 'sample',
        data: {
          stdoutCollector: {
            lines: ['FAIL: //sample:test (see /tmp/sample/test.log)'],
          },
        },
      }

      testInfo.processTestRunResult(currentRun, bspResult)

      assert.ok(
        currentRun.updateStatus.calledWith(failed.item, TestCaseStatus.Failed)
      )
      assert.ok(
        currentRun.updateStatus.calledWith(passed.item, TestCaseStatus.Passed)
      )
    })

    test('error result, source file uses lookup keys for duplicate jest labels', async () => {
      sandbox
        .stub(fs, 'readFileSync')
        .returns(
          [
            '  loading state',
            '    ✕ renders (8 ms)',
            '  success state',
            '    ✓ renders (1 ms)',
          ].join('\n')
        )

      const failed = createTypeScriptTestCase(
        'failed',
        'renders',
        'loading state renders'
      )
      const passed = createTypeScriptTestCase(
        'passed',
        'renders',
        'success state renders'
      )
      currentRun.pendingChildrenIterator.returns(
        (function* () {
          yield failed.info
          yield passed.info
        })()
      )

      const testInfo = new SourceFileTestCaseInfo(
        testItem,
        sampleTypeScriptTarget
      )
      const bspResult: TestResult = {
        statusCode: StatusCode.Error,
        originId: 'sample',
        data: {
          stdoutCollector: {
            lines: ['FAIL: //sample:test (see /tmp/sample/test.log)'],
          },
        },
      }

      testInfo.processTestRunResult(currentRun, bspResult)

      assert.ok(
        currentRun.updateStatus.calledWith(failed.item, TestCaseStatus.Failed)
      )
      assert.ok(
        currentRun.updateStatus.calledWith(passed.item, TestCaseStatus.Passed)
      )
    })

    test('error result', async () => {
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)
      const childItem = testController.createTestItem('child', 'child')
      const childInfo = new TestCaseInfo(
        childItem,
        sampleTarget,
        TestItemType.TestCase
      )
      currentRun.pendingChildrenIterator.returns(
        (function* () {
          yield childInfo
        })()
      )
      const bspResult: TestResult = {
        statusCode: StatusCode.Error,
        originId: 'sample',
        data: {
          stdoutCollector: {
            lines: ['hello', 'world'],
          },
        },
      }
      testInfo.processTestRunResult(currentRun, bspResult)
      assert.equal(currentRun.updateStatus.getCall(0).args[0], testItem)
      assert.equal(
        currentRun.updateStatus.getCall(0).args[1],
        TestCaseStatus.Failed
      )
      assert.equal(
        currentRun.updateStatus.getCall(0).args[2]?.message,
        'hello\nworld'
      )
      assert.equal(currentRun.updateStatus.getCall(1).args[0], childItem)
      assert.equal(
        currentRun.updateStatus.getCall(1).args[1],
        TestCaseStatus.Skipped
      )
    })

    test('cancelled result', async () => {
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)
      const bspResult: TestResult = {
        statusCode: StatusCode.Cancelled,
        originId: 'sample',
      }
      testInfo.processTestRunResult(currentRun, bspResult)
      assert.ok(
        currentRun.updateStatus.calledOnceWithExactly(
          testItem,
          TestCaseStatus.Skipped
        )
      )
    })
  })
})
