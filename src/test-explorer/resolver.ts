import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'

import {TestCaseStore} from './store'
import {BazelBSPBuildClient} from './client'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'

@Injectable()
export class TestResolver implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly store: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient

  onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.store.testController.resolveHandler = this.resolveHandler.bind(this)
  }

  dispose() {}

  private async resolveHandler(parentTest: vscode.TestItem | undefined) {}
}
