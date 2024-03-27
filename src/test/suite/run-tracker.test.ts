import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {TestCaseStore} from '../../test-explorer/store'
import {TestResolver} from '../../test-explorer/resolver'
import {BuildServerManager} from '../../rpc/server-manager'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {TestRunner} from '../../test-runner/runner'
import {TestRunTracker} from '../../test-runner/run-tracker'
import {
  TestCaseInfo,
  TestCaseStatus,
  TestItemType,
} from '../../test-explorer/types'
import sinon from 'sinon'

const testStructure = [
  {
    id: 'target1',
    label: 'Target 1',
    children: [
      {id: 'test1_1', label: 'Test 1.1', type: TestItemType.TestCase},
      {id: 'test1_2', label: 'Test 1.2', type: TestItemType.TestCase},
    ],
    type: TestItemType.BazelTarget,
  },
  {
    id: 'target2',
    label: 'Target 2',
    children: [
      {
        id: 'suite2_1',
        label: 'Suite 2.1',
        children: [
          {
            id: 'test2_1_1',
            label: 'Test 2.1.1',
            type: TestItemType.TestCase,
          },
          {
            id: 'test2_1_2',
            label: 'Test 2.1.2',
            type: TestItemType.TestCase,
          },
        ],
        type: TestItemType.TestSuite,
      },
      {id: 'test2_2', label: 'Test 2.2', type: TestItemType.TestCase},
    ],
    type: TestItemType.BazelTarget,
  },
]

suite('Test Run Tracker', () => {
  let testRunner: TestRunTracker
  let testController: vscode.TestController
  let createdTestItems: vscode.TestItem[]
  let metadata: WeakMap<vscode.TestItem, TestCaseInfo>
  let runSpy: sinon.SinonSpiedInstance<vscode.TestRun>

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
        metadata.set(testItem, {type: item.type})

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
    createTestItems(undefined, testStructure)
    const request = new vscode.TestRunRequest(
      // Parent items only.
      createdTestItems.filter(item => item.parent === undefined)
    )

    const run = testController.createTestRun(request)
    runSpy = sandbox.spy(run)
    testRunner = new TestRunTracker(metadata, run, request, 'sample')
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
        const passAllChildren = item =>
          item.children.forEach(child => {
            testRunner.updateStatus(child, TestCaseStatus.Passed)
            if (child.children.size > 0) {
              passAllChildren(child)
            }
          })
        passAllChildren(item)
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
    const emptyTestRunner = new TestRunTracker(metadata, run, request, 'sample')

    await emptyTestRunner.executeRun(async item => {
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

  test('skip test item', async () => {
    const testItem = createdTestItems[0]
    await testRunner.updateStatus(testItem, TestCaseStatus.Skipped)

    assert.equal(runSpy.skipped.callCount, 1)
    assert.equal(runSpy.skipped.getCall(0).args[0], testItem)
  })
})
