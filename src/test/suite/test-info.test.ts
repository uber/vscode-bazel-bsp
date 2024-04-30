import * as vscode from 'vscode'
import * as assert from 'assert'
import sinon from 'sinon'
import {
  BuildTargetTestCaseInfo,
  TestCaseInfo,
  TestItemType,
} from '../../test-info/test-info'
import {BuildTarget, StatusCode, TestResult} from '../../bsp/bsp'
import {TestCaseStatus, TestRunTracker} from '../../test-runner/run-tracker'
import {beforeEach, afterEach} from 'mocha'
import {TestParamsDataKind} from '../../bsp/bsp-ext'

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
    test('params for Bazel target', async () => {
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

    test('params for non Bazel target', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const testInfo = new TestCaseInfo(testItem, undefined, TestItemType.Root)

      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
      const result = testInfo.prepareTestRunParams(currentRun)
      assert.equal(result, undefined)
    })
  })

  suite('Test Run Result', () => {
    let testItem: vscode.TestItem
    let testInfo: TestCaseInfo
    let currentRun: sinon.SinonStubbedInstance<TestRunTracker>

    beforeEach(() => {
      testItem = testController.createTestItem('sample', 'sample')
      testInfo = new BuildTargetTestCaseInfo(testItem, sampleTarget)

      currentRun = sandbox.createStubInstance(TestRunTracker)
      currentRun.pendingChildrenIterator.returns((function* (parent) {})())
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
    })

    test('ok result', async () => {
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
    })

    test('error result', async () => {
      const bspResult: TestResult = {
        statusCode: StatusCode.Error,
        originId: 'sample',
        data: {message: 'test error details'},
      }
      testInfo.processTestRunResult(currentRun, bspResult)
      assert.equal(currentRun.updateStatus.getCall(0).args[0], testItem)
      assert.equal(
        currentRun.updateStatus.getCall(0).args[1],
        TestCaseStatus.Failed
      )
    })

    test('cancelled result', async () => {
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
