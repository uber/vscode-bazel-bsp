import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'
import * as rpc from 'vscode-jsonrpc/node'
import * as cp from 'child_process'

import {
  EXTENSION_CONTEXT_TOKEN,
  PRIMARY_OUTPUT_CHANNEL_TOKEN,
} from '../custom-providers'
import {ConnectionDetailsParser} from './connection-details'
import {Utils} from '../utils/utils'
import {INSTALL_BSP_COMMAND} from './install'
import {BspConnectionDetails} from '../bsp/bsp'

export const CANCEL_ERROR_CODE = -32603
const SERVER_NAME = 'bazelbsp'

@Injectable()
export class BuildServerManager implements vscode.Disposable, OnModuleInit {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(PRIMARY_OUTPUT_CHANNEL_TOKEN)
  private readonly outputChannel: vscode.LogOutputChannel
  @Inject(ConnectionDetailsParser)
  private readonly connectionDetailsParser: ConnectionDetailsParser

  private connectionReject: (reason?: any) => void
  private connectionResolve: (value: rpc.MessageConnection) => void
  private connectionPromisePending: boolean
  private connection: Promise<rpc.MessageConnection>

  constructor() {
    this.resetConnectionPromise()
  }

  onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.serverLaunch()
  }

  async dispose() {
    const conn = await this.connection
    conn.dispose()
  }

  /**
   * Get the connection to the build server. Callers that need to send requests should await the connection.
   * @returns A promise that resolves to the connection to the build server.
   */
  getConnection(): Promise<rpc.MessageConnection> {
    return this.connection
  }

  async serverLaunch() {
    this.resetConnectionPromise()
    try {
      const rootDir = await Utils.getWorkspaceGitRoot()
      if (!rootDir) {
        this.outputChannel.appendLine(
          'Unable to determine workspace root. Please ensure you are in a valid git repository.'
        )
        return
      }
      const connDetails = await this.connectionDetailsWithInstallCheck(rootDir)
      if (!connDetails) {
        this.outputChannel.appendLine(
          'Unable to find connection details for Bazel BSP. Please ensure the server is installed.'
        )
        return
      }
      const cmd = connDetails.argv[0]
      const args = connDetails.argv.slice(1)
      let childProcess = cp.spawn(cmd, args, {cwd: rootDir})
      childProcess.stderr.on('data', data => {
        // Per BSP spec, issues with the server process are reported via stderr.
        this.outputChannel.appendLine(`[bsp server process] ${data.toString()}`)
      })

      let connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(childProcess.stdout),
        new rpc.StreamMessageWriter(childProcess.stdin)
      )
      connection.listen()
      this.connectionResolve(connection)
    } catch (e) {
      // TODO(IDE-946): Reinstall prompt if spawn fails.
      this.connectionReject(e)
    }
  }

  private async connectionDetailsWithInstallCheck(
    rootDir: string
  ): Promise<BspConnectionDetails | undefined> {
    // Return existing connection details if available.
    let connDetails =
      await this.connectionDetailsParser.getServerConnectionDetails(
        SERVER_NAME,
        rootDir
      )

    if (connDetails) {
      return connDetails
    }

    // If unable to acquire connection details, prompt the user to install.
    const installSuccess: boolean =
      await vscode.commands.executeCommand(INSTALL_BSP_COMMAND)
    if (installSuccess) {
      // Retry connection details parsing after successful installation.
      // If this still fails, output channel can be used to investigate further.
      return this.connectionDetailsParser.getServerConnectionDetails(
        SERVER_NAME,
        rootDir
      )
    }

    // Installation was declined or failed.
    return undefined
  }

  private resetConnectionPromise = () => {
    // The current connection promise is still pending.
    // The existing resolve/reject are still valid.
    if (this.connectionPromisePending) {
      return
    }

    // Create a new promise and store the resolve/reject functions.
    this.connection = new Promise<rpc.MessageConnection>((resolve, reject) => {
      this.connectionResolve = resolve
      this.connectionReject = reject
      this.connectionPromisePending = true
    })

    // Indicate that a new promise should be created next time.
    this.connection.then(
      () => {
        this.connectionPromisePending = false
      },
      () => {
        this.connectionPromisePending = false
      }
    )
  }
}
