import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import {BuildTarget, TestParams, TestResult, StatusCode} from '../bsp/bsp'
import {TestParamsDataKind, BazelTestParamsData} from '../bsp/bsp-ext'
import {TestCaseStatus, TestRunTracker} from '../test-runner/run-tracker'
import {DocumentTestItem} from '../language-tools/manager'
import {Utils} from '../utils/utils'

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

    // Additional Bazel params is not supported in BSP coverage for now
    const ideTag = currentRun.getIdeTag()
    if (ideTag && !bazelParams.coverage) {
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

    // Update remaining children that are more specific than this item's type.
    // Other targets are left in a pending state so they can run on their own.
    for (const child of currentRun.pendingChildrenIterator(
      this.testItem,
      TestItemType.BazelTarget
    )) {
      if (result.statusCode === StatusCode.Error) {
        // A target-level failure does not prove every discovered child test failed.
        // Mark unknown children skipped so VS Code does not visually inherit the parent failure.
        currentRun.updateStatus(child.testItem, TestCaseStatus.Skipped)
      } else {
        // On success, let Test Explorer determine status based on children's outcomes.
        currentRun.updateStatus(child.testItem, TestCaseStatus.Inherit)
      }
    }
  }

  /**
   * Sets the display name to the target's label.
   * @param relativeToItem will be ignored in this implementation
   */
  setDisplayName(relativeToItem?: TestCaseInfo | undefined) {
    if (this.target.languageIds?.includes('typescript')) {
      this.testItem.label = this.target.displayName ?? this.target.id.uri
    } else {
      this.testItem.label =
        this.target.id.uri.split(':').pop() ?? this.target.id.uri
      this.testItem.description = this.target.displayName
    }
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

  prepareTestRunParams(currentRun: TestRunTracker): TestParams | undefined {
    if (isTypeScriptTarget(this.target)) {
      return
    }

    return super.prepareTestRunParams(currentRun)
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

    const fileArgument = this.getTestFileArgument()
    if (fileArgument) {
      params?.arguments?.push(fileArgument)
    }

    if (
      params?.dataKind === TestParamsDataKind.BazelTest &&
      this.type === TestItemType.TestCase &&
      this.details?.testFilter
    ) {
      const bazelParams = params.data as BazelTestParamsData
      bazelParams.testFilter = this.details.testFilter
    }

    return params
  }

  processTestRunResult(currentRun: TestRunTracker, result: TestResult): void {
    updateStatus(this.testItem, currentRun, result)

    const children = Array.from(
      currentRun.pendingChildrenIterator(this.testItem, TestItemType.SourceFile)
    )
    const childStatuses = parseJestChildStatuses(result, children)

    for (const child of children) {
      const status = childStatuses.get(getStatusKey(child))
      if (status) {
        currentRun.updateStatus(child.testItem, status)
      } else if (result.statusCode === StatusCode.Ok) {
        currentRun.updateStatus(child.testItem, TestCaseStatus.Passed)
      } else if (childStatuses.size === 0) {
        currentRun.updateStatus(child.testItem, TestCaseStatus.Failed)
      } else {
        currentRun.updateStatus(child.testItem, TestCaseStatus.Inherit)
      }
    }
  }

  private getTestFileArgument(): string | undefined {
    const uri = this.details?.uri ?? this.testItem.uri
    if (!uri || !isTypeScriptTarget(this.target)) {
      return undefined
    }

    const workspaceRoot = Utils.getWorkspaceRoot()
    if (!workspaceRoot) {
      return undefined
    }

    return path.relative(workspaceRoot.fsPath, uri.fsPath)
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

function isTypeScriptTarget(target: BuildTarget): boolean {
  return (
    target.languageIds?.includes('typescript') ||
    target.languageIds?.includes('typescriptreact')
  )
}

function parseJestChildStatuses(
  result: TestResult,
  children: TestCaseInfo[]
): Map<string, TestCaseStatus> {
  const statuses = new Map<string, TestCaseStatus>()
  const labelCounts = new Map<string, number>()
  const suiteStack: {indent: number; name: string}[] = []

  for (const child of children) {
    labelCounts.set(
      child.testItem.label,
      (labelCounts.get(child.testItem.label) ?? 0) + 1
    )
  }

  for (const line of getResultOutputLines(result)) {
    const cleanLine = Utils.removeAnsiEscapeCodes(line).replace(/\r$/, '')
    const statusMatch = cleanLine.match(
      /^(\s*)([✓✔√✕✖×])\s+(.+?)(?:\s+\(\d+(?:\.\d+)?\s*(?:m?s|μs|ns)\))?$/
    )

    if (statusMatch) {
      const statusIndent = statusMatch[1].length
      const status = /^[✓✔√]$/.test(statusMatch[2])
        ? TestCaseStatus.Passed
        : TestCaseStatus.Failed
      const testName = statusMatch[3].trim()
      const activeSuites = suiteStack
        .filter(suite => suite.indent < statusIndent)
        .map(suite => suite.name)
      const lookupKey = [...activeSuites, testName].join(' ')
      const matchingChild =
        children.find(child => getStatusKey(child) === lookupKey) ??
        (labelCounts.get(testName) === 1
          ? children.find(child => child.testItem.label === testName)
          : undefined)

      if (matchingChild) {
        statuses.set(getStatusKey(matchingChild), status)
      }
      continue
    }

    const suiteMatch = cleanLine.match(
      /^(\s{2,})(?!(?:Test Suites|Tests|Snapshots|Time|Ran all test suites|Force exiting Jest):)(\S.*)$/
    )
    if (suiteMatch) {
      const suiteIndent = suiteMatch[1].length
      while (
        suiteStack.length > 0 &&
        suiteIndent <= suiteStack[suiteStack.length - 1].indent
      ) {
        suiteStack.pop()
      }
      suiteStack.push({
        indent: suiteIndent,
        name: suiteMatch[2].trim(),
      })
    } else if (cleanLine.trim().length > 0 && !cleanLine.startsWith(' ')) {
      suiteStack.length = 0
    }
  }

  return statuses
}

function getStatusKey(child: TestCaseInfo): string {
  if (child instanceof SourceFileTestCaseInfo) {
    return child.getDocumentTestItem()?.lookupKey ?? child.testItem.label
  }

  return child.testItem.label
}

function getResultOutputLines(result: TestResult): string[] {
  const stdout = result.data?.stdoutCollector?.lines ?? []
  const stderr = result.data?.stderrCollector?.lines ?? []
  const outputLines = [...stdout, ...stderr]
  const testLogLines = outputLines.flatMap(readTestLogLines)
  return [...outputLines, ...testLogLines]
}

function readTestLogLines(line: string): string[] {
  const match = line.match(/\/\S+\/test\.log\b/)
  if (!match) {
    return []
  }

  try {
    return fs.readFileSync(match[0], 'utf8').split('\n')
  } catch {
    return []
  }
}
