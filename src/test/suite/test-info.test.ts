import * as vscode from 'vscode'
import * as assert from 'assert'
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

suite('TestInfo', () => {
  const sampleTarget: BuildTarget = {
    id: {uri: '//sample/target:test'},
    tags: [],
    languageIds: [],
    dependencies: [],
    capabilities: {},
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

    test('source directory', async () => {
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

    test('error result', async () => {
      const testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)
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
