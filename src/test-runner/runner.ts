import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'

import {TestCaseStore} from '../test-explorer/store'
import {BazelBSPBuildClient} from '../test-explorer/client'
import {BuildServerManager} from '../rpc/server-manager'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import * as bsp from '../bsp/bsp'
import {TestCaseStatus} from './run-tracker'
import {MessageConnection} from 'vscode-jsonrpc'
import {TestRunTracker} from './run-tracker'
import {RunTrackerFactory} from './run-factory'

@Injectable()
export class TestRunner implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly testCaseStore: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager
  @Inject(RunTrackerFactory) private readonly runFactory: RunTrackerFactory

  runProfiles: Map<vscode.TestRunProfileKind, vscode.TestRunProfile>

  onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.setupRunProfiles()
  }

  dispose() {}

  private setupRunProfiles() {
    this.runProfiles = new Map()

    const mainRunProfile = this.testCaseStore.testController.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      this.runHandler.bind(this)
    )
    this.ctx.subscriptions.push(mainRunProfile)
    this.runProfiles.set(vscode.TestRunProfileKind.Run, mainRunProfile)
  }

  private async runHandler(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken
  ) {
    // TODO(IDE-978): Support cancellation token.
    const conn = await this.buildServer.getConnection()
    const requestTracker = this.runFactory.newRun(request)

    await requestTracker.executeRun(async item => {
      await this.runTestCase(item, requestTracker, conn)
    })
  }

  private async runTestCase(
    item: vscode.TestItem,
    runTracker: TestRunTracker,
    conn: MessageConnection
  ) {
    const testInfo = this.testCaseStore.testCaseMetadata.get(item)
    if (!testInfo) return
    const params = testInfo.prepareTestRunParams(runTracker)
    if (params === undefined) {
      return
    }

    let result = await conn.sendRequest(bsp.BuildTargetTest.type, params)
    testInfo.processTestRunResult(runTracker, result)
  }
}
