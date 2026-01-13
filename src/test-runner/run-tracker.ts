import * as vscode from 'vscode'

import {TestCaseInfo, TestItemType} from '../test-info/test-info'
import {
  BuildTarget,
  LogMessageParams,
  TaskFinishDataKind,
  TaskFinishParams,
  TaskStartParams,
  TestFinish,
  TestStatus,
} from '../bsp/bsp'
import {TaskOriginHandlers} from '../test-explorer/client'
import {
  JUnitStyleTestCaseData,
  PublishOutputDataKind,
  PublishOutputParams,
  TestCoverageReport,
  TestFinishDataKind,
} from '../bsp/bsp-ext'
import {CoverageTracker} from '../coverage-utils/coverage-tracker'
import {LanguageToolManager} from '../language-tools/manager'
import {TaskEventTracker} from './task-events'
import {ANSI_CODES, Utils} from '../utils/utils'
import {getExtensionSetting, SettingName} from '../utils/settings'

export enum TestCaseStatus {
  Pending,
  Started,
  Passed,
  Failed,
  Skipped,
  Errored,
  // Defer to Test Explorer's automatic status determination based on outcome of an item's children.
  Inherit,
}

export interface RunTrackerParams {
  testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>
  run: vscode.TestRun
  request: vscode.TestRunRequest
  originName: string
  cancelToken: vscode.CancellationToken
  coverageTracker: CoverageTracker
  languageToolManager: LanguageToolManager
}

type DebugInfo = {
  debugFlags?: string[]
  launchConfig?: vscode.DebugConfiguration
  readyPattern?: RegExp
  remoteRoot?: string
  localRoot?: string
}

export class TestRunTracker implements TaskOriginHandlers {
  // All tests that are included in this run. See iterator definition below.
  private allTests: Map<TestItemType, TestCaseInfo[]>
  private testsByLookupKey: Map<string, TestCaseInfo>
  private buildTargets: Map<string, BuildTarget>

  // Current status of each TestItem in the run, initially Pending for all TestItems.
  private status: Map<vscode.TestItem, TestCaseStatus>

  private request: vscode.TestRunRequest
  private testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>
  private run: vscode.TestRun
  private _originName: string
  private onDoneCallback: () => void
  private cancelToken: vscode.CancellationToken
  private coverageTracker: CoverageTracker
  private languageToolManager: LanguageToolManager
  private pending: Thenable<void>[] = []
  private buildTaskTracker: TaskEventTracker = new TaskEventTracker()
  private debugInfo: DebugInfo | undefined
  private hasDebugSessionBeenInitiated = false
  private ideTag: string
  constructor(params: RunTrackerParams) {
    this.allTests = new Map<TestItemType, TestCaseInfo[]>()
    this.status = new Map<vscode.TestItem, TestCaseStatus>()
    this.testCaseMetadata = params.testCaseMetadata
    this.run = params.run
    this.request = params.request
    this._originName = params.originName
    this.cancelToken = params.cancelToken
    this.coverageTracker = params.coverageTracker
    this.languageToolManager = params.languageToolManager
    this.ideTag = 'unknown'

    this.prepareCurrentRun()
    this.prepareDebugInfo()
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
      this.run.enqueued(item.testItem)
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
      this.updateStatus(item.testItem, initialStatus)
      await callback(item.testItem, this.cancelToken)

      if (this.status.get(item.testItem) === initialStatus) {
        // If an updated status has not been set by the callback, consider it skipped.
        this.updateStatus(item.testItem, TestCaseStatus.Skipped)
      }
    }

    await Promise.all(this.pending)
    this.run.end()
    if (this.onDoneCallback) this.onDoneCallback()
  }

  /**
   * Updates an item's status, both within this test run tracker and in the test explorer UI.
   * This may be called more than once for the same test item, in which case only the highest status (per TestCaseStatus enum) will be retained.
   * @param item TestItem for which the status will be updated.
   * @param status New status value.
   * @param message (optional) Message to be shown to report an outcome. Only applicable for Failed and Errored states.
   */
  public updateStatus(
    item: vscode.TestItem,
    status: TestCaseStatus,
    message?: vscode.TestMessage
  ) {
    const currentStatus = this.status.get(item)
    if (currentStatus && status < currentStatus) {
      // Only update if the new status is ranked higher than the existing one.
      // This allows multiple updates to be made to a test item, while only showing the highest status in the UI.
      return
    }

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
      case TestCaseStatus.Inherit:
        break
      case TestCaseStatus.Skipped:
      default:
        this.run.skipped(item)
        break
    }
  }

  public onBuildTaskStart(params: TaskStartParams) {
    this.buildTaskTracker.addTaskStart(params)
  }

  public onBuildTaskFinish(params: TaskFinishParams) {
    this.buildTaskTracker.addTaskFinish(params)

    if (params.dataKind !== TaskFinishDataKind.TestFinish) {
      return
    }

    const testFinishData = params.data as TestFinish
    if (testFinishData.dataKind === TestFinishDataKind.JUnitStyleTestCaseData) {
      // Workaround for missing target ID and parent task bug in bazel-bsp server (https://youtrack.jetbrains.com/issue/BAZEL-1585).
      // For now, test runs that contain the same test case in multiple targets of the run will all use the same result.
      let hasMatch = false
      for (const target of this.buildTargets.values()) {
        const key = this.languageToolManager
          .getLanguageTools(target)
          .mapTestFinishDataToLookupKey(testFinishData)

        if (!key) {
          continue
        }

        // Find the matching item and post the updated status.
        const item = this.testsByLookupKey.get(key)
        if (item) {
          this.updateStatusFromTestFinishData(item, testFinishData)
          hasMatch = true
        }
      }

      if (!hasMatch) {
        this.run.appendOutput(
          `Updating ${testFinishData.displayName}: Unable to match this test result to an item in this run.\n`
        )
      }
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

    // During debug runs, watch each message for indication of debug readiness.
    // If the message matches the configured pattern, start the debug session.
    if (
      this.debugInfo?.launchConfig &&
      this.debugInfo.readyPattern?.test(params.message) &&
      !this.hasDebugSessionBeenInitiated
    ) {
      this.hasDebugSessionBeenInitiated = true
      this.run.appendOutput(
        `Starting remote debug session [Launch config: '${this.debugInfo.launchConfig.name}']\r\n`
      )

      const debugConfig = {...this.debugInfo.launchConfig}
      if (this.debugInfo.localRoot && this.debugInfo.remoteRoot) {
        debugConfig.localRoot = this.debugInfo.localRoot
        debugConfig.remoteRoot = this.debugInfo.remoteRoot
        this.run.appendOutput(
          `Debug paths:\r\n  localRoot: ${debugConfig.localRoot}\r\n  remoteRoot: ${debugConfig.remoteRoot}\r\n`
        )
      }

      vscode.debug.startDebugging(
        vscode.workspace.workspaceFolders?.[0],
        debugConfig
      )
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

  public getDebugBazelFlags(): string[] | undefined {
    return this.debugInfo?.debugFlags
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
      this.recursivelyCollectChildren(
        this.allTests,
        testItem,
        undefined,
        TestCaseStatus.Pending
      )
    }

    // Make items readily available for lookup.
    this.testsByLookupKey = new Map<string, TestCaseInfo>()
    this.buildTargets = new Map<string, BuildTarget>()
    for (const item of this) {
      const lookupKey = this.languageToolManager
        .getLanguageTools(item.target)
        .mapTestCaseInfoToLookupKey(item)
      if (lookupKey) this.testsByLookupKey.set(lookupKey, item)
      if (item.target) this.buildTargets.set(item.target.id.uri, item.target)
    }
  }

  /**
   * During debug runs, this collects and stores the necessary settings that will be applied through this run.
   * In the event that a setting is not found, information will be printed with the test output, but the run will still attempt to proceed.
   */
  private prepareDebugInfo() {
    if (this.getRunProfileKind() !== vscode.TestRunProfileKind.Debug) {
      return
    }

    // Determine configured launch configuration name.
    const configName = getExtensionSetting(SettingName.LAUNCH_CONFIG_NAME)
    if (!configName) {
      this.run.appendOutput(
        'No launch configuration name is configured. Debugger will not connect automatically for this run.\r\n'
      )
      this.run.appendOutput(
        'Check the `bazelbsp.debug.profileName` VS Code setting to ensure it corresponds to a valid launch configuration.\r\n'
      )
      return
    }

    // Store the selected launch configuration.
    const launchConfigurations = vscode.workspace.getConfiguration('launch')
    const configurations =
      launchConfigurations.get<any[]>('configurations') || []
    const selectedConfig = configurations.find(
      config => config.name !== undefined && config.name === configName
    )
    if (!selectedConfig) {
      this.run.appendOutput(
        `Unable to find debug profile ${configName}. Debugger will not connect automatically for this run.\r\n`
      )
      this.run.appendOutput(
        'Check the `bazelbsp.debug.profileName` VS Code setting to ensure it corresponds to a valid launch configuration.\r\n'
      )
    }

    // Ensure that matcher pattern is set for the output.
    const readyPattern = getExtensionSetting(SettingName.DEBUG_READY_PATTERN)
    if (!readyPattern) {
      this.run.appendOutput(
        'No matcher pattern is set. Debugger will not connect automatically for this run.\r\n'
      )
      this.run.appendOutput(
        'Check the `bazelbsp.debug.readyPattern` VS Code setting to ensure that a pattern is set.\r\n'
      )
    }

    // Ensure that matcher pattern is set for the output.
    let debugFlags = getExtensionSetting(SettingName.DEBUG_BAZEL_FLAGS)
    if (!debugFlags) {
      this.run.appendOutput(
        'No additional debug-specific Bazel flags have been found for this run.\r\n'
      )
      this.run.appendOutput(
        'Check the `bazelbsp.debug.bazelFlags` VS Code setting to ensure that necessary flags are set.\r\n'
      )
    }

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    let remoteRoot: string | undefined
    let targetUri: string | undefined
    let target: BuildTarget | undefined

    for (const testCaseInfo of this) {
      if (testCaseInfo.target) {
        target = testCaseInfo.target
        targetUri = testCaseInfo.target.id.uri
        break
      }
    }

    if (workspaceRoot && targetUri && target) {
      remoteRoot = this.languageToolManager
        .getLanguageTools(target)
        .getDebugRemoteRoot(workspaceRoot, targetUri)
    }

    this.debugInfo = {
      debugFlags: debugFlags,
      launchConfig: selectedConfig,
      readyPattern: readyPattern ? new RegExp(readyPattern) : undefined,
      localRoot: workspaceRoot,
      remoteRoot: remoteRoot,
    }
  }

  /**
   * Iterate recursively through all children of the given test item, and collect them in the destination map.
   * @param destination Map to be populated with the collected test items, grouped by TestItemType.
   * @param item root item at which to begin traversal. The root item will also be included in the map.
   * @param filterLevel (optional) TestItemType which will be used as the cutoff for filtering. Items at or above this level will be excluded.
   * @param newStatus (optional) Status to be set for each item as it is collected.
   */
  private recursivelyCollectChildren(
    destination: Map<TestItemType, TestCaseInfo[]>,
    item: vscode.TestItem,
    filterLevel?: TestItemType,
    newStatus?: TestCaseStatus
  ) {
    const collectChildren = (currentItem: vscode.TestItem) => {
      const data = this.testCaseMetadata.get(currentItem)
      if (newStatus !== undefined) this.status.set(currentItem, newStatus)

      if (!data) return
      if (filterLevel !== undefined && data.type <= filterLevel) return

      // Add each test item to the appropriate map entry based on its TestItemType.
      const existingEntry = destination.get(data.type)
      if (!existingEntry) {
        destination.set(data.type, [data])
      } else {
        existingEntry.push(data)
      }

      // Recursively collect children.
      currentItem.children.forEach(child => collectChildren(child))
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
   * @param filterLevel (optional) TestItemType which will be used as the cutoff for filtering. Items at or above this level will be excluded.
   * @returns Iterable sequence of pending children below the given parent.
   */
  *pendingChildrenIterator(
    parent: vscode.TestItem,
    filterLevel?: TestItemType
  ) {
    // Recursively collect all children of this test case into a map grouped by TestItemType.
    const currentChildren = new Map<TestItemType, TestCaseInfo[]>()
    parent.children.forEach(child => {
      this.recursivelyCollectChildren(currentChildren, child, filterLevel)
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
    allItems: Map<TestItemType, TestCaseInfo[]>
  ) {
    for (const key of Object.keys(TestItemType)) {
      const testItemType = TestItemType[key]
      const testItems = allItems.get(testItemType)
      if (testItems) {
        for (const item of testItems) {
          if (this.status.get(item.testItem) === TestCaseStatus.Pending) {
            yield item
          }
        }
      }
    }
  }

  private updateStatusFromTestFinishData(
    item: TestCaseInfo,
    testFinishData: TestFinish
  ) {
    switch (testFinishData.status) {
      case TestStatus.Skipped:
      case TestStatus.Ignored:
        this.updateStatus(item.testItem, TestCaseStatus.Skipped)
        break
      case TestStatus.Passed:
        this.updateStatus(item.testItem, TestCaseStatus.Passed)
        break
      case TestStatus.Cancelled:
        this.updateStatus(
          item.testItem,
          TestCaseStatus.Errored,
          new vscode.TestMessage('Cancelled')
        )
        break
      case TestStatus.Failed:
        this.updateStatus(
          item.testItem,
          TestCaseStatus.Failed,
          formatTestResultMessage(testFinishData)
        )
    }
  }

  /**
   * Set the IDE tag to be used for this test run
   * @param ideClient IDE client identifier (e.g., 'vscode', 'cursor')
   */
  public setIdeTag(ideClient: string): void {
    // use test_env to set the IDE_CLIENT environment variable
    this.ideTag = `--test_env=IDE_CLIENT=${ideClient}`
  }

  /**
   * Get the IDE tag for this test run
   * @returns The IDE client identifier
   */
  public getIdeTag(): string {
    return this.ideTag
  }
}

function formatTestResultMessage(
  result: TestFinish
): vscode.TestMessage | undefined {
  let message =
    // Ignore 'null' string as well.
    // TODO(IDE-1133): Ensure server does not convert null values to string.
    result.message !== undefined && result.message !== 'null'
      ? `${ANSI_CODES.CYAN}${ANSI_CODES.BOLD}${result.message}${ANSI_CODES.RESET}\n\n`
      : ''

  if (result.dataKind === TestFinishDataKind.JUnitStyleTestCaseData) {
    const testCaseData = result.data as JUnitStyleTestCaseData
    if (result.displayName) {
      message += `${ANSI_CODES.RED}[TEST CASE]${ANSI_CODES.RESET} ${result.displayName}\n\n`
    }
    if (testCaseData.errorType && testCaseData.errorType !== 'null') {
      message += `${ANSI_CODES.RED}[ERROR TYPE]${ANSI_CODES.RESET} ${testCaseData.errorType}\n\n`
    }
    if (testCaseData.errorMessage && testCaseData.errorMessage !== 'null') {
      message += `${ANSI_CODES.RED}[ERROR]${ANSI_CODES.RESET} ${testCaseData.errorMessage}\n\n`
    }
    if (testCaseData.errorContent && testCaseData.errorContent !== 'null') {
      message += `${ANSI_CODES.RED}[FULL ERROR]${ANSI_CODES.RESET}\n\n${testCaseData.errorContent}\n\n`
    }
  }

  return new vscode.TestMessage(message)
}
