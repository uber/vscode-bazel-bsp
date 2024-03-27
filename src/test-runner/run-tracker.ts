import * as vscode from 'vscode'

import {TestCaseStore} from '../test-explorer/store'
import {
  TestItemType,
  TestCaseStatus,
  TestCaseInfo,
} from '../test-explorer/types'

export class TestRunTracker {
  // All tests that are included in this run. See iterator definition below.
  private allTests: Map<TestItemType, vscode.TestItem[]>

  // Current status of each TestItem in the run, initially Pending for all TestItems.
  private status: Map<vscode.TestItem, TestCaseStatus>

  private request: vscode.TestRunRequest
  private testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>
  private originName: string
  private run: vscode.TestRun

  constructor(
    testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>,
    run: vscode.TestRun,
    request: vscode.TestRunRequest,
    originName: string
  ) {
    this.allTests = new Map<TestItemType, vscode.TestItem[]>()
    this.status = new Map<vscode.TestItem, TestCaseStatus>()
    this.testCaseMetadata = testCaseMetadata
    this.run = run
    this.request = request
    this.originName = originName

    this.prepareCurrentRun()
  }

  /**
   * Iterates through each item in the test run request, and its children.
   * Ordered by TestItemType, working its way down in rank until all items have been run. Includes only pending items.
   * During a run, it is expected that the callback will call updateStatus at least once to report test outcome.
   * The callback may optionally update a test's children as well.
   * If an item is no longer pending by the time it is reached in the iteration, it will be skipped.
   * @param callback Callback containing the test execution logic for a given test case.
   */
  public async executeRun(callback: (item: vscode.TestItem) => Promise<void>) {
    // All items below the roots of the TestRunRequest will be shown as enqueued.
    for (const item of this) {
      this.run.enqueued(item)
    }

    // Run the callback for each test case.
    for (const item of this) {
      const initialStatus = TestCaseStatus.Started
      this.updateStatus(item, initialStatus)
      await callback(item)

      if (this.status.get(item) === initialStatus) {
        // If an updated status has not been set by the callback, consider it skipped.
        this.updateStatus(item, TestCaseStatus.Skipped)
      }
    }
    this.run.end()
  }

  /**
   * Updates an item's status, both within this test run tracker and in the test explorer UI.
   * @param item TestItem for which the status will be updated.
   * @param status New status value.
   * @param message (optional) Message to be shown to report an outcome. Only applicable for Failed and Errored states.
   */
  public updateStatus(
    item: vscode.TestItem,
    status: TestCaseStatus,
    message?: vscode.TestMessage
  ) {
    this.status.set(item, status)
    switch (status) {
      case TestCaseStatus.Started:
        this.run.started(item)
        break
      case TestCaseStatus.Failed:
        this.run.failed(item, message ?? new vscode.TestMessage(''))
        break
      case TestCaseStatus.Errored:
        this.run.errored(item, message ?? new vscode.TestMessage(''))
        break
      case TestCaseStatus.Passed:
        this.run.passed(item)
        break
      case TestCaseStatus.Skipped:
      default:
        this.run.skipped(item)
        break
    }
  }

  /**
   * Collects and stores the parents and all children to be included in this test run.
   * Populates maps to group the test items by their TestItemType and current status.
   */
  private prepareCurrentRun() {
    if (this.request.include === undefined) {
      return
    }

    for (const testItem of this.request.include) {
      const collectChildren = (currentItem: vscode.TestItem) => {
        const data = this.testCaseMetadata.get(currentItem)
        this.status.set(currentItem, TestCaseStatus.Pending)

        if (!data) return

        // Recursively collect children.
        currentItem.children.forEach(child => collectChildren(child))

        // Add each test item to the appropriate map entry based on its TestItemType.
        const existingEntry = this.allTests.get(data.type)
        if (!existingEntry) {
          this.allTests.set(data.type, [currentItem])
        } else {
          existingEntry.push(currentItem)
        }
      }
      collectChildren(testItem)
    }
  }

  /**
   * Iterates through each pending test case, ordered by TestItemType.
   * */
  *[Symbol.iterator]() {
    for (const key of Object.keys(TestItemType)) {
      const testItemType = TestItemType[key]
      const testItems = this.allTests.get(testItemType)
      if (testItems) {
        for (const item of testItems) {
          if (this.status.get(item) === TestCaseStatus.Pending) {
            yield item
          }
        }
      }
    }
  }
}
