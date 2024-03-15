import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'

import {TestCaseStore} from './store'
import {BazelBSPBuildClient} from './client'
import {BuildServerManager} from '../rpc/server-manager'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'

@Injectable()
export class TestRunner implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly testCaseStore: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager

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
  ) {}
}
