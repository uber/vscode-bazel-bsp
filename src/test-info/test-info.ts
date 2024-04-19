import * as vscode from 'vscode'
import {BuildTarget, TestParams, TestResult, StatusCode} from '../bsp/bsp'
import {TestCaseStatus, TestRunTracker} from '../test-runner/run-tracker'

export enum TestItemType {
  Root,
  BazelTarget,
  SourceDirectory,
  SourceFile,
  TestSuite,
  TestCase,
}

/**
 * Base class for test case information, to be extended by specific test case types.
 * The base class can be used to provide generic test items that defer the actual BSP execution to their children.
 * Use one of the extended classes for test cases that can be run directly.
 */
export class TestCaseInfo {
  public readonly type: TestItemType
  public readonly target: BuildTarget | undefined

  protected testItem: vscode.TestItem

  constructor(
    test: vscode.TestItem,
    target?: BuildTarget,
    type: TestItemType = TestItemType.Root
  ) {
    this.testItem = test
    this.type = type
    this.target = target
  }

  /**
   * Prepare the test run parameters for this test case.
   * @param currentRun TestRunTracker for the current test run.
   * @returns TestParams to use in the Bazel BSP request, or undefined if the test case is not independently runnable.
   */
  prepareTestRunParams(currentRun: TestRunTracker): TestParams | undefined {
    return
  }

  /**
   * Process the test result and update the current run based on test outcome.
   * @param currentRun TestRunTracker for the current test run.
   * @param result TestResult returned by this run's request to the build server.
   */
  processTestRunResult(currentRun: TestRunTracker, result: TestResult): void {
    throw Error(
      'called processTestRunResult on a test case that cannot be directly run'
    )
  }
}

/**
 * Test case information for a full BSP build target.  Includes logic to prepare and process test runs.
 * Currently, BSP can execute full targets, so this serves as the main unit of execution.
 */
export class BuildTargetTestCaseInfo extends TestCaseInfo {
  public readonly type: TestItemType

  constructor(test: vscode.TestItem, target: BuildTarget) {
    super(test, target)
    this.type = TestItemType.BazelTarget
  }

  prepareTestRunParams(currentRun: TestRunTracker): TestParams | undefined {
    if (this.target === undefined) return
    return {
      targets: [this.target.id],
      originId: currentRun.originName,
      arguments: [],
      environmentVariables: {},
      workingDirectory: '',
    }
  }

  processTestRunResult(currentRun: TestRunTracker, result: TestResult): void {
    const updateStatus = (item: vscode.TestItem) => {
      switch (result.statusCode) {
        case StatusCode.Ok:
          currentRun.updateStatus(item, TestCaseStatus.Passed)
          break
        case StatusCode.Error:
          currentRun.updateStatus(
            item,
            TestCaseStatus.Failed,
            // TODO(IDE-979): Test message processing and overlay.
            new vscode.TestMessage(JSON.stringify(result.data))
          )
          break
        case StatusCode.Cancelled:
          currentRun.updateStatus(item, TestCaseStatus.Skipped)
          break
      }
    }

    updateStatus(this.testItem)

    // All children that are still pending by this point inherit the overall run status.
    // When task notifications are implemented for individual test cases, we can re-evaluate what makes the most sense here.
    for (const child of currentRun.pendingChildrenIterator(this.testItem)) {
      updateStatus(child)
    }
  }
}
