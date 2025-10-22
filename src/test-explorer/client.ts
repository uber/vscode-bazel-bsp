import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'

import * as bsp from '../bsp/bsp'
import * as bspExt from '../bsp/bsp-ext'
import {BuildServerManager} from '../server/server-manager'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {Deferred, Utils} from '../utils/utils'
const pkg = require('../../package.json')

const SUPPORTED_LANGUAGES = ['java', 'scala', 'kotlin', 'python', 'typescript']

/**
 * To intercept notifications from a specific originId, define custom handlers using this interface.
 * Use registerOriginHandlers and disposeOriginHandlers to manage their lifecycle.
 */
export type TaskOriginHandlers = {
  onBuildLogMessage?: (params: bsp.LogMessageParams) => void
  onBuildTaskStart?: (params: bsp.TaskStartParams) => void
  onBuildTaskProgress?: (params: bsp.TaskProgressParams) => void
  onBuildTaskFinish?: (params: bsp.TaskFinishParams) => void
  onBuildPublishOutput?: (params: bspExt.PublishOutputParams) => void
}

@Injectable()
export class BazelBSPBuildClient
  implements
    bsp.BuildClient,
    bspExt.ExtendedBuildClient,
    OnModuleInit,
    vscode.Disposable
{
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager

  private initializeResult: Deferred<bsp.InitializeBuildResult> = new Deferred()
  private clientOutputChannel: vscode.LogOutputChannel =
    vscode.window.createOutputChannel('Bazel BSP (client)', {log: true})
  private originHandlers: Map<string, TaskOriginHandlers> = new Map()

  async onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.ctx.subscriptions.push(this.clientOutputChannel)

    this.ctx.subscriptions.push(
      vscode.commands.registerCommand('bazelbsp.showServerOutput', () => {
        this.clientOutputChannel.show()
      })
    )

    const conn = await this.buildServer.getConnection()
    bsp.registerBuildClientHandlers(conn, this)
    bspExt.registerExtendedBuildClientHandlers(conn, this)
    this.initializationRequest()
  }

  async dispose() {}

  getInitializeResult(): Promise<bsp.InitializeBuildResult> {
    return this.initializeResult.promise
  }

  /**
   * Register a TaskOriginHandlers implementation to be used for all notifications that match the originId.
   * Notifications will be redirected to the corresponding method of the registered handler.
   * If a method is unset, default behavior defined in the build client will be used.
   * @param originId value for which the registered handlers will be used.
   * @param handlers implementation that will be used instead of the default behavior.
   */
  registerOriginHandlers(originId: string, handlers: TaskOriginHandlers): void {
    this.originHandlers.set(originId, handlers)
  }

  /**
   * Clean up handlers for a given originId.
   * @param originId value for which the registered handlers will be removed.
   */
  disposeOriginHandlers(originId: string): void {
    this.originHandlers.delete(originId)
  }

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
    if (params.originId) {
      // Intercept if a custom handler is registered for this origidId and method.
      const handler = this.originHandlers.get(params.originId)
      if (handler && handler.onBuildLogMessage) {
        handler.onBuildLogMessage(params)
        return
      }
    }

    // Use "Developer -> Set log level..." to control the level of logging that will be displayed.
    const message = Utils.removeAnsiEscapeCodes(params.message)
    switch (params.type) {
      case bsp.MessageType.Error:
        this.clientOutputChannel.error(message)
        break
      case bsp.MessageType.Warning:
        this.clientOutputChannel.warn(message)
        break
      case bsp.MessageType.Info:
      case bsp.MessageType.Log:
      default:
        this.clientOutputChannel.info(message)
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
    if (params.originId) {
      // Intercept if a custom handler is registered for this origidId and method.
      const handler = this.originHandlers.get(params.originId)
      if (handler && handler.onBuildTaskStart) {
        handler.onBuildTaskStart(params)
        return
      }
    }

    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onBuildTaskProgress(params: bsp.TaskProgressParams): void {
    if (params.originId) {
      // Intercept if a custom handler is registered for this origidId and method.
      const handler = this.originHandlers.get(params.originId)
      if (handler && handler.onBuildTaskProgress) {
        handler.onBuildTaskProgress(params)
        return
      }
    }

    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onBuildTaskFinish(params: bsp.TaskFinishParams): void {
    if (params.originId) {
      // Intercept if a custom handler is registered for this origidId and method.
      const handler = this.originHandlers.get(params.originId)
      if (handler && handler.onBuildTaskFinish) {
        handler.onBuildTaskFinish(params)
        return
      }
    }

    this.clientOutputChannel.trace(JSON.stringify(params))
  }

  onBuildPublishOutput(params: bspExt.PublishOutputParams): void {
    if (params.originId) {
      // Intercept if a custom handler is registered for this origidId and method.
      const handler = this.originHandlers.get(params.originId)
      if (handler && handler.onBuildPublishOutput) {
        handler.onBuildPublishOutput(params)
        return
      }
    }

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
      const initData: bspExt.InitializeBuildData = {
        featureFlags: {
          isPythonSupportEnabled: true,
        },
      }
      const initResult = await conn.sendRequest(bsp.BuildInitialize.type, {
        displayName: 'VS Code Bazel BSP',
        version: pkg.version,
        bspVersion: bsp.Bsp4Ts.ProtocolVersion,
        rootUri: rootUri?.toString() ?? '',
        capabilities: {
          languageIds: SUPPORTED_LANGUAGES,
        },
        data: initData,
      })

      // Notify the build server that client initialization is complete.
      await conn.sendNotification(bsp.OnBuildInitialized.type)
      this.initializeResult.resolve(initResult)
    } catch (e) {
      this.initializeResult.reject(e)
    }
  }
}
