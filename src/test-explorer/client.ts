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
  private clientOutputChannel: vscode.LogOutputChannel =
    vscode.window.createOutputChannel('Bazel BSP (client)', {log: true})

  async onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.ctx.subscriptions.push(this.clientOutputChannel)

    const conn = await this.buildServer.getConnection()
    bsp.registerBuildClientHandlers(conn, this)
    this.initializationRequest()
  }

  async dispose() {}

  getInitializeResult(): Promise<bsp.InitializeBuildResult> {
    return this.initializeResult.promise
  }

  // Use "Developer -> Set log level..." to control the level of logging that will be displayed.
  // TODO(IDE-958): Other classes will be able to register a buffer to collect output from their own tasks.
  // Params includes origin id, which can be used to identify a destination for the output.

  onBuildShowMessage(params: bsp.ShowMessageParams): void {
    switch (params.type) {
      case bsp.MessageType.Error:
        vscode.window.showErrorMessage(params.message)
        break
      case bsp.MessageType.Warning:
        vscode.window.showWarningMessage(params.message)
        break
      case bsp.MessageType.Info:
        vscode.window.showInformationMessage(params.message)
        break
      case bsp.MessageType.Log:
        this.clientOutputChannel.info(params.message)
        break
    }
  }

  onBuildLogMessage(params: bsp.LogMessageParams): void {
    switch (params.type) {
      case bsp.MessageType.Error:
        this.clientOutputChannel.error(params.message)
        break
      case bsp.MessageType.Warning:
        this.clientOutputChannel.warn(params.message)
        break
      case bsp.MessageType.Info:
      case bsp.MessageType.Log:
      default:
        this.clientOutputChannel.info(params.message)
        break
    }
  }

  onBuildPublishDiagnostics(params: bsp.PublishDiagnosticsParams): void {
    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onBuildTargetDidChange(params: bsp.DidChangeBuildTarget): void {
    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onBuildTaskStart(params: bsp.TaskStartParams): void {
    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onBuildTaskProgress(params: bsp.TaskProgressParams): void {
    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onBuildTaskFinish(params: bsp.TaskFinishParams): void {
    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onRunPrintStdout(params: bsp.PrintParams): void {
    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onRunPrintStderr(params: bsp.PrintParams): void {
    this.clientOutputChannel.trace(JSON.stringify(params))
  }

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
