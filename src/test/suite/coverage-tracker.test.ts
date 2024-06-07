import * as vscode from 'vscode'
import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import sinon from 'sinon'
import * as path from 'path'

import {Utils} from '../../utils/utils'
import {CoverageTracker} from '../../coverage-utils/coverage-tracker'

const fixtureDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'test',
  'testdata'
)

suite('Coverage Tracker', () => {
  let coverageTracker: CoverageTracker
  let testController: vscode.TestController
  let runProfile: vscode.TestRunProfile
  let workspaceGitRootStub: sinon.SinonStub
  let run: vscode.TestRun
  let addCoverageStub: sinon.SinonStub<
    [fileCoverage: vscode.FileCoverage],
    void
  >

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    testController = vscode.tests.createTestController(
      'sampleController',
      'Sample Controller'
    )
    runProfile = testController.createRunProfile(
      'coverage',
      vscode.TestRunProfileKind.Coverage,
      () => {}
    )
    run = testController.createTestRun({
      include: [],
      exclude: [],
      profile: runProfile,
      preserveFocus: false,
    })
    addCoverageStub = sandbox.stub(run, 'addCoverage')

    coverageTracker = new CoverageTracker()
    workspaceGitRootStub = sandbox.stub(Utils, 'getWorkspaceGitRoot')
    workspaceGitRootStub.returns(Promise.resolve('/sample/root'))
  })

  afterEach(() => {
    sandbox.restore()
    testController.dispose()
  })

  test('single coverage report', async () => {
    await coverageTracker.handleCoverageReport(
      run,
      path.join(fixtureDir, 'lcov', 'sample.lcov')
    )

    // Coverage added for each file in the sample report.
    assert.strictEqual(addCoverageStub.callCount, 26)

    // Validate each of the calls to add coverage.
    for (const currentArgs of addCoverageStub.args) {
      const fileCoverage = currentArgs[0]
      assert.ok(fileCoverage.uri.fsPath.startsWith('/sample/root'))
      assert.strictEqual(fileCoverage.branchCoverage, undefined)
      assert.strictEqual(fileCoverage.declarationCoverage, undefined)
      assert.ok(fileCoverage.statementCoverage)
      const detailedCoverage = await coverageTracker.loadDetailedCoverage(
        run,
        fileCoverage,
        new vscode.CancellationTokenSource().token
      )
      assert.ok(detailedCoverage)
      assert.strictEqual(
        fileCoverage.statementCoverage.total,
        detailedCoverage.length
      )
    }
  })

  test('multiple reports in same run', async () => {
    await coverageTracker.handleCoverageReport(
      run,
      path.join(fixtureDir, 'lcov', 'sample.lcov')
    )

    const firstResults: vscode.FileCoverage[] = []
    for (const currentArgs of addCoverageStub.args) {
      firstResults.push(currentArgs[0])
    }

    const repeatedFiles = [
      '/sample/root/my/example/project/src/main/java/com/sample/project/model/common/Status.java',
      '/sample/root/my/example/project/src/main/java/com/sample/project/model/common/ResourceType.java',
    ]
    await coverageTracker.handleCoverageReport(
      run,
      path.join(fixtureDir, 'lcov', 'sample2.lcov')
    )
    // Coverage added for each file in the first report, plus 2 additional files in the second report.
    assert.strictEqual(addCoverageStub.callCount, 28)

    // Validate each of the calls to add coverage.
    for (const currentArgs of addCoverageStub.args) {
      const updatedFileCoverage = currentArgs[0]
      assert.ok(updatedFileCoverage.uri.fsPath.startsWith('/sample/root'))
      const isRepeatFile = repeatedFiles.includes(
        updatedFileCoverage.uri.fsPath
      )

      assert.ok(updatedFileCoverage.statementCoverage)
      assert.strictEqual(updatedFileCoverage.branchCoverage, undefined)
      assert.strictEqual(updatedFileCoverage.declarationCoverage, undefined)
      const detailedCoverage = await coverageTracker.loadDetailedCoverage(
        run,
        updatedFileCoverage,
        new vscode.CancellationTokenSource().token
      )
      assert.ok(detailedCoverage)
      assert.strictEqual(
        updatedFileCoverage.statementCoverage.total,
        detailedCoverage.length
      )

      if (isRepeatFile) {
        const originalFileCoverage = firstResults.filter(
          result => updatedFileCoverage.uri.fsPath === result.uri.fsPath
        )[0]
        // Preserve line total and covered count
        assert.strictEqual(
          originalFileCoverage.statementCoverage.total,
          updatedFileCoverage.statementCoverage.total
        )
        assert.strictEqual(
          originalFileCoverage.statementCoverage.covered,
          updatedFileCoverage.statementCoverage.covered
        )

        // Preserve overall number of lines
        const originalDetailedCoverage =
          await coverageTracker.loadDetailedCoverage(
            run,
            originalFileCoverage,
            new vscode.CancellationTokenSource().token
          )
        assert.strictEqual(
          originalDetailedCoverage.length,
          detailedCoverage.length
        )
      }
    }
  })

  test('invalid report path', async () => {
    const appendOutputStub = sandbox.stub(run, 'appendOutput')
    // Fail and display output.
    try {
      await coverageTracker.handleCoverageReport(
        run,
        path.join(fixtureDir, 'lcov', 'nonexistent.lcov')
      )
    } catch {
      assert.fail('handleCoverage support must not throw errors')
    }
    assert.strictEqual(addCoverageStub.callCount, 0)
    assert.ok(appendOutputStub.callCount > 0)

    // Subsequent requests not blocked by prior failures in the queue.
    try {
      await coverageTracker.handleCoverageReport(
        run,
        path.join(fixtureDir, 'lcov', 'sample.lcov')
      )
    } catch {
      assert.fail('handleCoverage support must not throw errors')
    }
    assert.strictEqual(addCoverageStub.callCount, 26)
  })
})
