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

export const CANCEL_ERROR_CODE = -32603

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
    cancelToken: vscode.CancellationToken
  ) {
    const conn = await this.buildServer.getConnection()
    const requestTracker = this.runFactory.newRun(request, cancelToken)

    await requestTracker.executeRun(async (item, cancelToken) => {
      await this.runTestCase(item, requestTracker, conn, cancelToken)
    })
  }

  private async runTestCase(
    item: vscode.TestItem,
    runTracker: TestRunTracker,
    conn: MessageConnection,
    cancelToken: vscode.CancellationToken
  ) {
    const testInfo = this.testCaseStore.testCaseMetadata.get(item)
    if (!testInfo) return
    const params = testInfo.prepareTestRunParams(runTracker)
    if (params === undefined) {
      return
    }

    let result: bsp.TestResult | undefined
    try {
      result = await conn.sendRequest(
        bsp.BuildTargetTest.type,
        params,
        cancelToken
      )
    } catch (e) {
      if (e.code === CANCEL_ERROR_CODE) {
        runTracker.updateStatus(
          item,
          TestCaseStatus.Errored,
          new vscode.TestMessage(
            `Testing canceled by user during run of ${item.label}.`
          )
        )
        return
      } else {
        throw e
      }
    }

    if (result) testInfo.processTestRunResult(runTracker, result)
  }
}
