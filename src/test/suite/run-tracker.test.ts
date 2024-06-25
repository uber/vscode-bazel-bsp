import * as vscode from 'vscode'
import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import sinon from 'sinon'

import {TestCaseStatus, TestRunTracker} from '../../test-runner/run-tracker'
import {
  BuildTargetTestCaseInfo,
  TestCaseInfo,
  TestItemType,
} from '../../test-info/test-info'
import {sampleBuildTarget, sampleTestData} from './test-utils'
import {
  LogMessageParams,
  MessageType,
  StatusCode,
  TaskFinishDataKind,
  TaskFinishParams,
  TaskStartDataKind,
  TaskStartParams,
  TestStart,
  TestStatus,
} from '../../bsp/bsp'
import {CoverageTracker} from '../../coverage-utils/coverage-tracker'
import {LanguageToolManager} from '../../language-tools/manager'
import {TestFinishDataKind} from '../../bsp/bsp-ext'
import {BaseLanguageTools} from '../../language-tools/base'

suite('Test Run Tracker', () => {
  let testRunner: TestRunTracker
  let testController: vscode.TestController
  let createdTestItems: vscode.TestItem[]
  let metadata: WeakMap<vscode.TestItem, TestCaseInfo>
  let runSpy: sinon.SinonSpiedInstance<vscode.TestRun>
  let cancelTokenSource: vscode.CancellationTokenSource
  let languageToolStub: sinon.SinonStubbedInstance<LanguageToolManager>

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    metadata = new WeakMap<vscode.TestItem, TestCaseInfo>()
    testController = vscode.tests.createTestController(
      'testRunTracker',
      'testRunTracker'
    )
    createdTestItems = []

    const createTestItems = (parent: vscode.TestItem | undefined, items) => {
      items.forEach(item => {
        const testItem = testController.createTestItem(item.id, item.label)

        if (item.type === TestItemType.BazelTarget) {
          metadata.set(
            testItem,
            new BuildTargetTestCaseInfo(testItem, sampleBuildTarget())
          )
        } else {
          metadata.set(
            testItem,
            new TestCaseInfo(testItem, undefined, item.type)
          )
        }

        createdTestItems.push(testItem)
        if (parent) {
          parent.children.add(testItem)
        } else {
          testController.items.add(testItem)
        }

        if (item.children) {
          createTestItems(testItem, item.children)
        }
      })
    }
    createTestItems(undefined, sampleTestData)
    const request = new vscode.TestRunRequest(
      // Parent items only.
      createdTestItems.filter(item => item.parent === undefined)
    )

    cancelTokenSource = new vscode.CancellationTokenSource()

    const run = testController.createTestRun(request)
    const coverageTracker = new CoverageTracker()

    languageToolStub = sandbox.createStubInstance(LanguageToolManager)
    const languageToolsInstance = sinon.createStubInstance(BaseLanguageTools)
    languageToolsInstance.mapTestCaseInfoToLookupKey.callsFake(
      item => item.testItem.id
    )
    languageToolsInstance.mapTestFinishDataToLookupKey.callsFake(
      finishData => finishData.displayName
    )
    languageToolStub.getLanguageTools.returns(languageToolsInstance)

    runSpy = sandbox.spy(run)
    testRunner = new TestRunTracker({
      testCaseMetadata: metadata,
      run: run,
      request: request,
      originName: 'sample',
      cancelToken: cancelTokenSource.token,
      coverageTracker: coverageTracker,
      languageToolManager: languageToolStub,
    })
  })

  afterEach(() => {
    testController.dispose()
    sandbox.restore()
  })

  test('execute all items', async () => {
    const remainingItems = new Set(createdTestItems)
    await testRunner.executeRun(async item => {
      testRunner.updateStatus(item, TestCaseStatus.Passed)
      remainingItems.delete(item)
    })

    // All items execute individually.
    assert.equal(remainingItems.size, 0)
    assert.equal(runSpy.enqueued.callCount, createdTestItems.length)
    assert.equal(runSpy.started.callCount, createdTestItems.length)
    assert.equal(runSpy.passed.callCount, createdTestItems.length)
  })

  test('execute with cancellation', async () => {
    const remainingItems = new Set(createdTestItems)

    const runItemCount = 4
    let count = 0
    await testRunner.executeRun(async (item, cancelToken) => {
      testRunner.updateStatus(item, TestCaseStatus.Passed)
      remainingItems.delete(item)
      if (count === runItemCount - 1) {
        // Simulate cancellation after running first 4 items
        cancelTokenSource.cancel()
      }
      count++
    })

    // Items stop executing after the point of cancellation.
    assert.equal(remainingItems.size, createdTestItems.length - runItemCount)
    assert.equal(runSpy.enqueued.callCount, createdTestItems.length)
    assert.equal(runSpy.started.callCount, runItemCount)
    assert.equal(runSpy.passed.callCount, runItemCount)
  })

  test('execute parent that updates children', async () => {
    const remainingItems = new Set(createdTestItems)
    const includedTypes: Set<TestItemType | undefined> = new Set([
      TestItemType.BazelTarget,
    ])
    await testRunner.executeRun(async item => {
      const itemMetadata = metadata.get(item)
      assert.ok(itemMetadata)
      if (includedTypes.has(itemMetadata.type)) {
        // Simulate a callback that updates the status of children.
        for (const child of testRunner.pendingChildrenIterator(
          item,
          itemMetadata.type
        )) {
          testRunner.updateStatus(child.testItem, TestCaseStatus.Passed)
        }
      }
      remainingItems.delete(item)
    })

    assert.equal(runSpy.enqueued.callCount, createdTestItems.length)

    // Assert that only the items in includedTypes were executed.
    // Others had a status update by their parent.
    const nonIncludedItems = createdTestItems.filter(
      item => !includedTypes.has(metadata.get(item)?.type)
    )
    assert.equal(remainingItems.size, nonIncludedItems.length)
    assert.equal(runSpy.passed.callCount, nonIncludedItems.length)
    nonIncludedItems.forEach(item => assert.ok(remainingItems.has(item)))

    // Since the callback does not update the parents, remaining items marked skipped.
    assert.equal(
      runSpy.skipped.callCount,
      createdTestItems.length - nonIncludedItems.length
    )
  })

  test('filtered pending children', async () => {
    const remainingItems = new Set(createdTestItems)
    const includedTypes: Set<TestItemType | undefined> = new Set([
      TestItemType.BazelTarget,
    ])
    await testRunner.executeRun(async item => {
      const itemMetadata = metadata.get(item)
      assert.ok(itemMetadata)
      remainingItems.delete(item)
    })

    for (const item of testRunner.pendingChildrenIterator(
      createdTestItems[0],
      TestItemType.BazelTarget
    )) {
      assert.ok(item.type > TestItemType.BazelTarget)
    }
  })

  test('execute run with no pending items', async () => {
    // Mark all items as passed
    createdTestItems.forEach(item =>
      testRunner.updateStatus(item, TestCaseStatus.Passed)
    )

    await testRunner.executeRun(async item => {
      assert.fail('Callback should not be called')
    })

    assert.equal(runSpy.enqueued.callCount, 0)
    assert.equal(runSpy.started.callCount, 0)
  })

  test('execute run with empty request', async () => {
    const request = new vscode.TestRunRequest([])
    const run = testController.createTestRun(request)
    const coverageTracker = new CoverageTracker()
    const languageToolManager = new LanguageToolManager()
    const emptyTestRunner = new TestRunTracker({
      testCaseMetadata: metadata,
      run: run,
      request: request,
      originName: 'sample',
      cancelToken: cancelTokenSource.token,
      coverageTracker: coverageTracker,
      languageToolManager: languageToolManager,
    })

    await emptyTestRunner.executeRun(async itesm => {
      assert.fail('Callback should not be called')
    })

    assert.equal(runSpy.enqueued.callCount, 0)
    assert.equal(runSpy.started.callCount, 0)
    assert.equal(runSpy.passed.callCount, 0)
  })

  test('update status with message', async () => {
    const testItem = createdTestItems[0]
    const message: vscode.TestMessage = {
      message: 'Test failed due to assertion error',
      location: new vscode.Location(
        vscode.Uri.file('/path/to/file'),
        new vscode.Range(1, 1, 1, 10)
      ),
    }
    await testRunner.updateStatus(testItem, TestCaseStatus.Failed, message)

    assert.equal(runSpy.failed.callCount, 1)
    assert.equal(runSpy.failed.getCall(0).args[0], testItem)
    assert.equal(runSpy.failed.getCall(0).args[1], message)
  })

  test('multiple updates', async () => {
    const testItem = createdTestItems[0]
    const message: vscode.TestMessage = {
      message: 'Test failed due to assertion error',
      location: new vscode.Location(
        vscode.Uri.file('/path/to/file'),
        new vscode.Range(1, 1, 1, 10)
      ),
    }
    await testRunner.updateStatus(testItem, TestCaseStatus.Failed, message)
    assert.equal(runSpy.failed.callCount, 1)
    assert.equal(runSpy.failed.getCall(0).args[0], testItem)
    assert.equal(runSpy.failed.getCall(0).args[1], message)

    // Calls with a lower rank status should not update the status.
    await testRunner.updateStatus(testItem, TestCaseStatus.Passed, message)
    assert.equal(runSpy.passed.callCount, 0)
    assert.equal(runSpy.enqueued.callCount, 0)
    assert.equal(runSpy.failed.callCount, 1)

    await testRunner.updateStatus(testItem, TestCaseStatus.Pending, message)
    assert.equal(runSpy.passed.callCount, 0)
    assert.equal(runSpy.enqueued.callCount, 0)
    assert.equal(runSpy.failed.callCount, 1)

    // Additional failures should update the status.
    await testRunner.updateStatus(testItem, TestCaseStatus.Failed, message)
    assert.equal(runSpy.failed.callCount, 2)
    assert.equal(runSpy.failed.getCall(0).args[0], testItem)
    assert.equal(runSpy.failed.getCall(0).args[1], message)
  })

  test('skip test item', async () => {
    const testItem = createdTestItems[0]
    await testRunner.updateStatus(testItem, TestCaseStatus.Skipped)

    assert.equal(runSpy.skipped.callCount, 1)
    assert.equal(runSpy.skipped.getCall(0).args[0], testItem)
  })

  test('test task updates', async () => {
    type SampleEventPair = {
      start: TaskStartParams
      finish: TaskFinishParams
    }

    const sampleEvents: SampleEventPair[] = [
      {
        start: {
          originId: 'sample',
          taskId: {id: 'task1', parents: []},
          message: 'task1 started',
          dataKind: TaskStartDataKind.TestTask,
          data: {
            target: {
              uri: 'sample',
            },
          },
        },
        finish: {
          originId: 'sample',
          taskId: {id: 'task1', parents: []},
          status: StatusCode.Ok,
          message: 'task1 finished',
        },
      },
      {
        start: {
          originId: 'sample',
          taskId: {id: 'task2', parents: ['task1']},
          message: 'task1 started',
          dataKind: TaskStartDataKind.TestStart,
        },
        finish: {
          originId: 'sample',
          taskId: {id: 'task2', parents: ['task1']},
          status: StatusCode.Ok,
          message: 'task2 finished',
          dataKind: TaskFinishDataKind.TestFinish,
          data: {
            displayName: 'test1_1',
            status: TestStatus.Passed,
            dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
            data: {
              time: 0,
              className: 'sample',
              displayName: 'sample test',
            },
          },
        },
      },
      {
        start: {
          originId: 'sample',
          taskId: {id: 'task3', parents: ['task1']},
          message: 'task3 started',
          dataKind: TaskStartDataKind.TestStart,
        },
        finish: {
          originId: 'sample',
          taskId: {id: 'task3', parents: ['task1']},
          status: StatusCode.Ok,
          message: 'task3 finished',
          dataKind: TaskFinishDataKind.TestFinish,
          data: {
            displayName: 'test1_2',
            status: TestStatus.Failed,
            dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
            data: {
              time: 0,
              className: 'sample',
              displayName: 'sample test',
            },
          },
        },
      },
    ]

    // Start each task.
    for (let i = 0; i < sampleEvents.length; i++) {
      testRunner.onBuildTaskStart(sampleEvents[i].start)
    }

    // Finish each task, in opposite order.
    for (let i = sampleEvents.length - 1; i >= 0; i--) {
      testRunner.onBuildTaskFinish(sampleEvents[i].finish)
    }

    assert.ok(languageToolStub.getLanguageTools.called)
    assert.equal(runSpy.passed.callCount, 1)
    assert.equal(runSpy.failed.callCount, 1)
  })

  test('log message', async () => {
    const sampleMessages: LogMessageParams[] = [
      {
        type: MessageType.Info,
        originId: 'sample',
        message: 'sample log message',
      },
      {
        type: MessageType.Info,
        originId: 'sample',
        message: 'sample log message2\\',
      },
      {
        type: MessageType.Info,
        originId: 'sample',
        message: 'sample log message3\\',
      },
    ]

    for (const params of sampleMessages) {
      testRunner.onBuildLogMessage(params)
    }

    // Call for each message plus one newline sequence.
    assert.equal(runSpy.appendOutput.callCount, 4)
    // Only one newline sequence is present among the calls.
    assert.equal(
      runSpy.appendOutput
        .getCalls()
        .filter(call => call.args[0].includes('\n\r')).length,
      1
    )
  })
})
