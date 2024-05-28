import * as vscode from 'vscode'

import {TestCaseInfo, TestItemType} from '../test-info/test-info'
import {LogMessageParams} from '../bsp/bsp'
import {TaskOriginHandlers} from '../test-explorer/client'
import {
  PublishOutputDataKind,
  PublishOutputParams,
  TestCoverageReport,
} from '../bsp/bsp-ext'
import {CoverageTracker} from '../coverage-utils/coverage-tracker'

export enum TestCaseStatus {
  Pending,
  Started,
  Passed,
  Failed,
  Skipped,
  Errored,
}

export class TestRunTracker implements TaskOriginHandlers {
  // All tests that are included in this run. See iterator definition below.
  private allTests: Map<TestItemType, vscode.TestItem[]>

  // Current status of each TestItem in the run, initially Pending for all TestItems.
  private status: Map<vscode.TestItem, TestCaseStatus>

  private request: vscode.TestRunRequest
  private testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>
  private run: vscode.TestRun
  private _originName: string
  private onDoneCallback: () => void
  private cancelToken: vscode.CancellationToken
  private coverageTracker: CoverageTracker
  private pending: Thenable<void>[] = []

  constructor(
    testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>,
    run: vscode.TestRun,
    request: vscode.TestRunRequest,
    originName: string,
    cancelToken: vscode.CancellationToken,
    coverageTracker: CoverageTracker
  ) {
    this.allTests = new Map<TestItemType, vscode.TestItem[]>()
    this.status = new Map<vscode.TestItem, TestCaseStatus>()
    this.testCaseMetadata = testCaseMetadata
    this.run = run
    this.request = request
    this._originName = originName
    this.cancelToken = cancelToken
    this.coverageTracker = coverageTracker

    this.prepareCurrentRun()
  }

  public get originName(): string {
    return this._originName
  }

  /**
   * Iterates through each item in the test run request, and its children.
   * Ordered by TestItemType, working its way down in rank until all items have been run. Includes only pending items.
   * During a run, it is expected that the callback will call updateStatus at least once to report test outcome.
   * The callback may optionally update a test's children as well.
   * If an item is no longer pending by the time it is reached in the iteration, it will be skipped.
   * If the run is canceled, the remaining items will be skipped.
   * @param callback Callback containing the test execution logic for a given test case.
   */
  public async executeRun(
    callback: (
      item: vscode.TestItem,
      cancelToken: vscode.CancellationToken
    ) => Promise<void>
  ) {
    // All items below the roots of the TestRunRequest will be shown as enqueued.
    for (const item of this) {
      this.run.enqueued(item)
    }

    // Run the callback for each test case.
    for (const item of this) {
      if (this.cancelToken.isCancellationRequested) {
        this.run.appendOutput(
          'Run canceled by user.  Remaining items will be skipped.\r\n'
        )
        break
      }

      const initialStatus = TestCaseStatus.Started
      this.updateStatus(item, initialStatus)
      await callback(item, this.cancelToken)

      if (this.status.get(item) === initialStatus) {
        // If an updated status has not been set by the callback, consider it skipped.
        this.updateStatus(item, TestCaseStatus.Skipped)
      }
    }

    await Promise.all(this.pending)
    this.run.end()
    if (this.onDoneCallback) this.onDoneCallback()
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
   * Appends a log message to this tracker's test run output.
   * @param params Log message to be appended.
   */
  public onBuildLogMessage(params: LogMessageParams) {
    if (params.message.endsWith('\\')) {
      // Combine messages that are continued on the following line.
      this.run.appendOutput(params.message.slice(0, -1))
    } else {
      this.run.appendOutput(params.message)
      this.run.appendOutput('\n\r')
    }
  }

  /**
   * Collects selected info that may be reported via progress events.
   * @param params Progress event containing data to be collected.
   */
  public onBuildPublishOutput(params: PublishOutputParams): void {
    if (params.dataKind === PublishOutputDataKind.CoverageReport) {
      const data = params.data as TestCoverageReport
      this.pending.push(
        this.coverageTracker.handleCoverageReport(this.run, data.lcovReportUri)
      )
    }
  }

  /**
   * Registers a callback that will be called after the last test item in the run has been processed.
   */
  public async onDone(callback: () => void) {
    this.onDoneCallback = callback
  }

  public getRunProfileKind(): vscode.TestRunProfileKind | undefined {
    return this.request.profile?.kind
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
      this.recursivelyCollectChildren(this.allTests, testItem)
    }
  }

  /**
   * Iterate recursively through all children of the given test item, and collect them in the destination map.
   * @param destination Map to be populated with the collected test items, grouped by TestItemType.
   * @param item root item at which to begin traversal. The root item will also be included in the map.
   */
  private recursivelyCollectChildren(
    destination: Map<TestItemType, vscode.TestItem[]>,
    item: vscode.TestItem
  ) {
    const collectChildren = (currentItem: vscode.TestItem) => {
      const data = this.testCaseMetadata.get(currentItem)
      this.status.set(currentItem, TestCaseStatus.Pending)

      if (!data) return

      // Recursively collect children.
      currentItem.children.forEach(child => collectChildren(child))

      // Add each test item to the appropriate map entry based on its TestItemType.
      const existingEntry = destination.get(data.type)
      if (!existingEntry) {
        destination.set(data.type, [currentItem])
      } else {
        existingEntry.push(currentItem)
      }
    }
    collectChildren(item)
  }

  /**
   * Iterates through each pending test case, ordered by TestItemType.
   * This defines the ordering in which nodes will be traversed and executed during a run.
   * */
  *[Symbol.iterator]() {
    const items = this.pendingTestItemIterator(this.allTests)
    for (const item of items) {
      yield item
    }
  }

  /**
   * Iterates through all pending test cases below the given test item, ordered by TestItemType.
   * This can be used for updates to the tree below a certain parent.
   * @param parent Parent test item whose children will be included in the iteration sequence.
   * @returns Iterable sequence of pending children below the given parent.
   */
  *pendingChildrenIterator(parent: vscode.TestItem) {
    // Recursively collect all children of this test case into a map grouped by TestItemType.
    const currentChildren = new Map<TestItemType, vscode.TestItem[]>()
    parent.children.forEach(child => {
      this.recursivelyCollectChildren(currentChildren, child)
    })

    // Use the existing pendingItems iteration sequence to pass through only the relevant children.
    const items = this.pendingTestItemIterator(currentChildren)
    for (const item of items) {
      yield item
    }
  }

  /**
   * Iterates through all pending test cases, ordered by TestItemType.
   * The pending status will be checked immediately prior to yielding.
   * @param allItems All test items to be visited in this iteration sequence, organized their TestItemType.
   */
  private *pendingTestItemIterator(
    allItems: Map<TestItemType, vscode.TestItem[]>
  ) {
    for (const key of Object.keys(TestItemType)) {
      const testItemType = TestItemType[key]
      const testItems = allItems.get(testItemType)
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
