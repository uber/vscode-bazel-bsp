import * as vscode from 'vscode'
import {
  BuildTargetIdentifier,
  TestParams,
  TestResult,
  StatusCode,
} from '../bsp/bsp'
import {TestCaseStatus, TestRunTracker} from '../test-runner/run-tracker'

export enum TestItemType {
  Root,
  BazelTarget,
  SourceDirectory,
  SourceFile,
  TestSuite,
  TestCase,
}

export class TestCaseInfo {
  public readonly type: TestItemType
  public readonly languageIds: string[]
  public readonly target: BuildTargetIdentifier | undefined

  private testItem: vscode.TestItem

  constructor(
    test: vscode.TestItem,
    type: TestItemType,
    languageIds?: string[],
    target?: BuildTargetIdentifier
  ) {
    this.testItem = test
    this.type = type
    this.languageIds = languageIds ?? []
    this.target = target
  }

  prepareTestRunParams(currentRun: TestRunTracker): TestParams | undefined {
    switch (this.type) {
      case TestItemType.BazelTarget:
        if (this.target === undefined) return
        return {
          targets: [this.target],
          originId: currentRun.originName,
          arguments: [],
          environmentVariables: {},
          workingDirectory: '',
        }
      default:
        // Once proposal to increase task notification detail is accepted and implemented on the server,
        // multiple targets can be batched here into a single set of test run params.
        // https://github.com/build-server-protocol/build-server-protocol/discussions/652
        // Currently, runs above the target level will initiate a serial run of each target in that part of the tree.
        return
    }
  }

  processTestRunResult(currentRun: TestRunTracker, result: TestResult): void {
    switch (result.statusCode) {
      case StatusCode.Ok:
        currentRun.updateStatus(this.testItem, TestCaseStatus.Passed)
        break
      case StatusCode.Error:
        currentRun.updateStatus(
          this.testItem,
          TestCaseStatus.Failed,
          // TODO(IDE-979): Test message processing and overlay.
          new vscode.TestMessage(JSON.stringify(result.data))
        )
        break
      case StatusCode.Cancelled:
        currentRun.updateStatus(this.testItem, TestCaseStatus.Skipped)
        break
    }
  }
}
