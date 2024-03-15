import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'

import * as bsp from '../bsp/bsp'
import {BuildServerManager} from '../rpc/server-manager'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'

@Injectable()
export class BazelBSPBuildClient
  implements bsp.BuildClient, OnModuleInit, vscode.Disposable
{
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager

  async onModuleInit() {
    this.ctx.subscriptions.push(this)

    const conn = await this.buildServer.getConnection()
    bsp.registerBuildClientHandlers(conn, this)
  }

  async dispose() {}

  onBuildShowMessage(params: bsp.ShowMessageParams): void {}
  onBuildLogMessage(params: bsp.LogMessageParams): void {}
  onBuildPublishDiagnostics(params: bsp.PublishDiagnosticsParams): void {}
  onBuildTargetDidChange(params: bsp.DidChangeBuildTarget): void {}
  onBuildTaskStart(params: bsp.TaskStartParams): void {}
  onBuildTaskProgress(params: bsp.TaskProgressParams): void {}
  onBuildTaskFinish(params: bsp.TaskFinishParams): void {}
  onRunPrintStdout(params: bsp.PrintParams): void {}
  onRunPrintStderr(params: bsp.PrintParams): void {}
}
