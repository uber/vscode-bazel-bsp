import * as vscode from 'vscode'
import lcovParser, {SectionSummary} from '@friedemannsommer/lcov-parser'
import {createReadStream} from 'node:fs'
import {Utils} from '../utils/utils'
import path from 'path'
import {Injectable} from '@nestjs/common'

import {TestRun} from 'vscode'

type fileToLineMapping = Map<string, (number | undefined)[]>

@Injectable()
export class CoverageTracker {
  // Cumulative line hit count data for a given run, including results from all LCOV files in that run.
  private resultsByRun = new WeakMap<TestRun, fileToLineMapping>()

  // Optional coverage roots to scope coverage results for a run.
  private coverageRootsByRun = new WeakMap<TestRun, string[]>()

  // Processed coverage data for a given file, in required format for VS Code coverage API.
  private coverageStore = new WeakMap<
    vscode.FileCoverage,
    vscode.FileCoverageDetail[]
  >()

  // Process reports in the order received, one by one due to shared data access.
  private queue: Promise<void> = Promise.resolve()

  /**
   * Receive and queue an incoming coverage report for processing.
   * @param run The test run for which coverage is being processed.
   * @param lcovReportPath The path to the lcov report file to be processed.
   * @returns Promise that resolves when the given coverage report has been processed.
   */
  public async handleCoverageReport(
    run: TestRun,
    lcovReportPath: string
  ): Promise<void> {
    this.queue = this.queue
      .then(() => this.processCoverage(run, lcovReportPath))
      .catch(err => {
        run.appendOutput(`Error processing coverage: ${err}`)
      })
    await this.queue
  }

  /**
   * Restrict coverage results to files within the provided roots for this run.
   * @param run The test run for which coverage will be scoped.
   * @param roots Absolute paths to directories to include.
   */
  public setCoverageRoots(run: TestRun, roots: string[]): void {
    const normalizedRoots = roots
      .map(root => path.resolve(root))
      .filter(root => root.length > 0)
    if (normalizedRoots.length === 0) {
      return
    }
    this.coverageRootsByRun.set(run, normalizedRoots)
  }

  /**
   * Implements required loadDetailedCoverage function from VS Code's coverage API.
   * Per VS Code coverage API, the FileCoverage object serves as a key to return full FileCoverageDetail for that file.
   * @param testRun The test run for which coverage is being loaded.
   * @param fileCoverage The file coverage for which detailed coverage is being loaded.
   * @param token Cancellation token.
   * @returns FileCoverageDetail[] representing the detailed coverage data that corresponds to the given FileCoverage summary object.
   */
  public async loadDetailedCoverage(
    testRun: vscode.TestRun,
    fileCoverage: vscode.FileCoverage,
    token: vscode.CancellationToken
  ): Promise<vscode.FileCoverageDetail[]> {
    const details = this.coverageStore.get(fileCoverage)
    if (!details) {
      return []
    }
    return details
  }

  /**
   * Process the given coverage report.
   * This updates cumulative line totals and then reports results by adding them to the run.
   * @param run Run for which coverage reports will be processed.
   */
  private async processCoverage(run: TestRun, lcovReportPath: string) {
    let lineDetail: fileToLineMapping = this.resultsByRun.get(run) ?? new Map()
    this.resultsByRun.set(run, lineDetail)
    const workspaceRoot = (await Utils.getWorkspaceGitRoot()) ?? ''

    const reportPath = vscode.Uri.parse(lcovReportPath).fsPath
    const reportText = createReadStream(reportPath)
    const parsedReport = await lcovParser({from: reportText})
    for (const fileData of parsedReport) {
      const filePath = path.isAbsolute(fileData.path)
        ? fileData.path
        : path.join(workspaceRoot, fileData.path)
      if (!this.shouldIncludeCoverage(run, filePath)) {
        continue
      }

      // hitsPerLine data is cumulative across all lcov reports in a run.
      let hitsPerLine = lineDetail.get(fileData.path) ?? []
      lineDetail.set(fileData.path, hitsPerLine)

      const fileStatementCoverage = this.getStatementCoverage(
        fileData,
        hitsPerLine
      )
      const fileCoverage = vscode.FileCoverage.fromDetails(
        vscode.Uri.file(filePath),
        fileStatementCoverage
      )

      // Add or replace prior coverage data for this file.
      this.coverageStore.set(fileCoverage, fileStatementCoverage)
      run.addCoverage(fileCoverage)
    }
  }

  private shouldIncludeCoverage(run: TestRun, filePath: string): boolean {
    const roots = this.coverageRootsByRun.get(run)
    if (!roots || roots.length === 0) {
      return true
    }

    const normalizedPath = path.resolve(filePath)
    return roots.some(root => {
      if (normalizedPath === root) {
        return true
      }
      return normalizedPath.startsWith(root + path.sep)
    })
  }

  /**
   * Maps line coverage data for a given source file into VS Code's required StatementCoverage format.
   * Updates lineData array with latest cumulative line totals.
   * @param fileData SectionData representing the parsed coverage data for an individual source file.
   * @param lineData Array containing hit counts per line in the given source file, used to keep a cumulative total.
   * @returns Array of StatementCoverage objects representing the coverage data for the given source file.
   */
  private getStatementCoverage(
    fileData: SectionSummary,
    lineData: (number | undefined)[]
  ): vscode.StatementCoverage[] {
    const result: vscode.StatementCoverage[] = []
    for (const line of fileData.lines.details) {
      // Store the hit count or increment exist value.
      const lineNum = line.line - 1 // VS Code uses 0 index.
      lineData[lineNum] = (lineData[lineNum] ?? 0) + line.hit

      // Range represents up to 500 characters of a single line.
      const range = new vscode.Range(
        new vscode.Position(lineNum, 0),
        new vscode.Position(lineNum, 500)
      )
      result.push(
        new vscode.StatementCoverage(lineData[lineNum] ?? false, range)
      )
    }
    return result
  }
}
