import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'

import * as bsp from '../bsp/bsp'
import {BuildServerManager} from '../rpc/server-manager'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {Deferred, Utils} from '../utils/utils'
const pkg = require('../../package.json')

const SUPPORTED_LANGUAGES = ['java', 'scala', 'kotlin', 'python']

@Injectable()
export class BazelBSPBuildClient
  implements bsp.BuildClient, OnModuleInit, vscode.Disposable
{
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager

  private initializeResult: Deferred<bsp.InitializeBuildResult> = new Deferred()

  async onModuleInit() {
    this.ctx.subscriptions.push(this)

    const conn = await this.buildServer.getConnection()
    bsp.registerBuildClientHandlers(conn, this)
    this.initializationRequest()
  }

  async dispose() {}

  getInitializeResult(): Promise<bsp.InitializeBuildResult> {
    return this.initializeResult.promise
  }

  onBuildShowMessage(params: bsp.ShowMessageParams): void {}
  onBuildLogMessage(params: bsp.LogMessageParams): void {}
  onBuildPublishDiagnostics(params: bsp.PublishDiagnosticsParams): void {}
  onBuildTargetDidChange(params: bsp.DidChangeBuildTarget): void {}
  onBuildTaskStart(params: bsp.TaskStartParams): void {}
  onBuildTaskProgress(params: bsp.TaskProgressParams): void {}
  onBuildTaskFinish(params: bsp.TaskFinishParams): void {}
  onRunPrintStdout(params: bsp.PrintParams): void {}
  onRunPrintStderr(params: bsp.PrintParams): void {}

  private async initializationRequest() {
    // Wait for build server connection readiness.
    const conn = await this.buildServer.getConnection()

    // Send initialize request to the server.
    try {
      const rootUri = Utils.getWorkspaceRoot()
      const initResult = await conn.sendRequest(bsp.BuildInitialize.type, {
        displayName: 'VS Code Bazel BSP',
        version: pkg.version,
        bspVersion: bsp.Bsp4Ts.ProtocolVersion,
        rootUri: rootUri?.toString() ?? '',
        capabilities: {
          languageIds: SUPPORTED_LANGUAGES,
        },
      })

      // Notify the build server that client initialization is complete.
      await conn.sendNotification(bsp.OnBuildInitialized.type)
      this.initializeResult.resolve(initResult)
    } catch (e) {
      this.initializeResult.reject(e)
    }
  }
}
