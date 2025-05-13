import * as vscode from 'vscode'
import * as path from 'path'
import {BuildTarget, TestParams, TestResult, StatusCode} from '../bsp/bsp'
import {TestParamsDataKind, BazelTestParamsData} from '../bsp/bsp-ext'
import {TestCaseStatus, TestRunTracker} from '../test-runner/run-tracker'
import {DocumentTestItem, LanguageToolManager} from '../language-tools/manager'
import {getExtensionSetting, SettingName} from '../utils/settings'

export enum TestItemType {
  Root,
  BazelTarget,
  TargetDirectory,
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
  public readonly testItem: vscode.TestItem

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

  /**
   * Refreshes the name displayed for the test item.
   * Base implementation leaves the label unchanged.
   * @param relativeToItem (optional) Item against which a relative path will be calculated, for subclasses that support it.
   */
  setDisplayName(relativeToItem?: TestCaseInfo | undefined) {}
}

/**
 * Test case information to represent a directory containing sources within a target.
 */
export class TargetDirTestCaseInfo extends TestCaseInfo {
  private readonly dir: string
  constructor(test: vscode.TestItem, dir: string) {
    super(test, undefined, TestItemType.TargetDirectory)
    this.dir = dir
  }

  /**
   * Calculate relative path to another target directory and set it as display name.
   * @param relativeToItem Item based on which the relative path will be calculated.
   */
  setDisplayName(relativeToItem?: TestCaseInfo | undefined) {
    if (relativeToItem?.type === TestItemType.TargetDirectory) {
      // If the relative item is another TargetDirTestCaseInfo, calculate relative path.
      this.testItem.label = path.relative(
        (relativeToItem as TargetDirTestCaseInfo).dir,
        this.dir
      )
    } else {
      // If it is another type of test item, use the full path.
      this.testItem.label = this.dir
    }
  }
}

/**
 * Test case information for a full BSP build target.  Includes logic to prepare and process test runs.
 * Currently, BSP can execute full targets, so this serves as the main unit of execution.
 */
export class BuildTargetTestCaseInfo extends TestCaseInfo {
  public readonly type: TestItemType
  public readonly target: BuildTarget

  constructor(test: vscode.TestItem, target: BuildTarget) {
    super(test, target)
    this.type = TestItemType.BazelTarget
    // This class and any that extend it are guaranteed to include a target.
    this.target = target
  }

  prepareTestRunParams(currentRun: TestRunTracker): TestParams | undefined {
    if (this.target === undefined) return

    const bazelParams: BazelTestParamsData = {
      coverage:
        currentRun.getRunProfileKind() === vscode.TestRunProfileKind.Coverage,
    }

    // Includes additional debug-specific flags when necessary.
    if (currentRun.getRunProfileKind() === vscode.TestRunProfileKind.Debug) {
      const configuredFlags = currentRun.getDebugBazelFlags()
      if (configuredFlags && configuredFlags.length > 0) {
        // Bazel BSP accepts whitespace separated list of flags.
        bazelParams.additionalBazelParams = configuredFlags.join(' ')
      }
    }

    // Add the IDE tag (--define flag) to additionalBazelParams
    const ideTag = currentRun.getIdeTag()
    if (ideTag && ideTag.trim().length > 0) {
      if (bazelParams.additionalBazelParams) {
        bazelParams.additionalBazelParams += ` ${ideTag}`
      } else {
        bazelParams.additionalBazelParams = ideTag
      }
    }

    const params = {
      targets: [this.target.id],
      originId: currentRun.originName,
      arguments: [],
      environmentVariables: {},
      workingDirectory: '',
      dataKind: TestParamsDataKind.BazelTest,
      data: bazelParams,
    }

    return params
  }

  /**
   * Update the test item's status based on the result of the test run.
   * This implementation updates the status of the target itself, and then updates all pending children that are not targets of their own.
   * @param currentRun TestRunTracker for the current test run.
   * @param result TestResult returned by this run's request to the build server.
   */
  processTestRunResult(currentRun: TestRunTracker, result: TestResult): void {
    // The executed test item inherits the overall run status.
    updateStatus(this.testItem, currentRun, result)

    // Remaining items, except those at a level that should execute independently, are marked to inherit the results from their children.
    for (const child of currentRun.pendingChildrenIterator(
      this.testItem,
      TestItemType.BazelTarget
    )) {
      // Only update children that are more specific than this item's type.
      // This will leave other targets in a pending state so they can run on their own.
      currentRun.updateStatus(child.testItem, TestCaseStatus.Inherit)
    }
  }

  /**
   * Sets the display name to the target's label.
   * @param relativeToItem will be ignored in this implementation
   */
  setDisplayName(relativeToItem?: TestCaseInfo | undefined) {
    this.testItem.label =
      this.target.id.uri.split(':').pop() ?? this.target.id.uri
    this.testItem.description = this.target.displayName
  }
}

/**
 * Test case information for a source directory within a build target.
 */
export class SourceDirTestCaseInfo extends BuildTargetTestCaseInfo {
  public readonly type: TestItemType
  private readonly dir: string
  constructor(test: vscode.TestItem, target: BuildTarget, dir: string) {
    super(test, target)
    this.dir = dir
    this.type = TestItemType.SourceDirectory
  }

  /**
   * Sets a source directory's name to be relative to any parent source directory.
   * @param relativeToItem Item against which the label will be calculated.
   */
  setDisplayName(relativeToItem?: TestCaseInfo | undefined) {
    if (relativeToItem?.type === TestItemType.SourceDirectory) {
      this.testItem.label = path.relative(
        (relativeToItem as SourceDirTestCaseInfo).dir,
        this.dir
      )
    } else {
      this.testItem.label = this.dir
    }
  }
}

/**
 * Test case information for a source file within a target.
 * Current behavior is identical to BuildTargetTestCaseInfo, but in the future this can add filtering by file.
 */
export class SourceFileTestCaseInfo extends BuildTargetTestCaseInfo {
  public readonly type: TestItemType
  protected details: DocumentTestItem | undefined

  constructor(test: vscode.TestItem, target: BuildTarget) {
    super(test, target)
    this.type = TestItemType.SourceFile
  }

  prepareTestRunParams(currentRun: TestRunTracker): TestParams | undefined {
    if (this.target === undefined) return

    const params = super.prepareTestRunParams(currentRun)
    if (
      params?.dataKind === TestParamsDataKind.BazelTest &&
      this.details?.testFilter
    ) {
      const bazelParams = params.data as BazelTestParamsData
      bazelParams.testFilter = this.details.testFilter
    }

    return params
  }

  /**
   * Sets a source file's label to its file name.
   * @param relativeToItem will be ignored in this implementation
   */
  setDisplayName(relativeToItem?: TestCaseInfo | undefined) {
    if (this.details) {
      this.testItem.label = this.details.name
    } else {
      this.testItem.label = path.basename(this.testItem.uri?.path ?? '')
    }
  }

  /**
   * Update the document's test item details.
   * @param details DocumentTestItem representing a test item for the full document.
   */
  setDocumentTestItem(details: DocumentTestItem) {
    this.details = details
    this.testItem.range = details.range
    this.setDisplayName()
  }

  getDocumentTestItem(): DocumentTestItem | undefined {
    return this.details
  }
}

/**
 * Test case information for a single test case within a file.
 * Includes the applicable test filter to run only this test case.
 */
export class TestItemTestCaseInfo extends SourceFileTestCaseInfo {
  public readonly type: TestItemType
  protected details: DocumentTestItem

  constructor(
    test: vscode.TestItem,
    target: BuildTarget,
    details: DocumentTestItem
  ) {
    super(test, target)
    this.type = TestItemType.TestCase
    this.details = details
  }

  /**
   * Sets a test case's label to its name.
   * @param relativeToItem will be ignored in this implementation
   */
  setDisplayName(relativeToItem?: TestCaseInfo | undefined) {
    this.testItem.label = this.details.name
  }
}

function updateStatus(
  item: vscode.TestItem,
  currentRun: TestRunTracker,
  result: TestResult
) {
  if (result.statusCode === StatusCode.Error) {
    const stdOut = result.data?.stdoutCollector?.lines
    const testMessage = stdOut
      ? new vscode.TestMessage(stdOut.join('\n'))
      : undefined
    currentRun.updateStatus(item, TestCaseStatus.Failed, testMessage)
  } else if (result.statusCode === StatusCode.Ok) {
    currentRun.updateStatus(item, TestCaseStatus.Passed)
  } else {
    currentRun.updateStatus(item, TestCaseStatus.Skipped)
  }
}
