import * as vscode from 'vscode'
import * as assert from 'assert'
import sinon from 'sinon'
import {TestCaseInfo, TestItemType} from '../../test-explorer/test-info'
import {BuildTargetIdentifier, StatusCode, TestResult} from '../../bsp/bsp'
import {TestCaseStatus, TestRunTracker} from '../../test-runner/run-tracker'
import {beforeEach, afterEach} from 'mocha'

suite('TestInfo', () => {
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
    sandbox.reset()
  })

  suite('Test Run Params', () => {
    test('params for Bazel target', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const sampleTarget: BuildTargetIdentifier = {
        uri: '//sample/target:test',
      }
      const testInfo = new TestCaseInfo(
        testItem,
        TestItemType.BazelTarget,
        [],
        sampleTarget
      )
      const currentRun = sandbox.createStubInstance(TestRunTracker)
      sandbox.stub(currentRun, 'originName').get(() => 'sample')
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
      })
    })

    test('params for non Bazel target', async () => {
      const testItem = testController.createTestItem('sample', 'sample')
      const sampleTarget: BuildTargetIdentifier = {
        uri: '//sample/target:test',
      }
      const testInfo = new TestCaseInfo(
        testItem,
        TestItemType.Root,
        [],
        sampleTarget
      )

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
      const sampleTarget: BuildTargetIdentifier = {
        uri: '//sample/target:test',
      }
      testInfo = new TestCaseInfo(testItem, TestItemType.Root, [], sampleTarget)

      currentRun = sandbox.createStubInstance(TestRunTracker)
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
