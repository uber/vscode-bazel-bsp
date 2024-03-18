import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'
import * as rpc from 'vscode-jsonrpc/node'
import * as cp from 'child_process'

import {
  EXTENSION_CONTEXT_TOKEN,
  PRIMARY_OUTPUT_CHANNEL_TOKEN,
} from '../custom-providers'

// TODO(IDE-946): Update this to use the correct launch command and directory.
const LAUNCH_COMMAND =
  '/home/user/fievel/experimental/users/mnoah1/launch_bsp.sh'
const LAUNCH_DIR = '/home/user/fievel'

@Injectable()
export class BuildServerManager implements vscode.Disposable, OnModuleInit {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(PRIMARY_OUTPUT_CHANNEL_TOKEN)
  private readonly outputChannel: vscode.OutputChannel

  private connectionReject: (value: rpc.MessageConnection) => void
  private connectionResolve: (reason?: any) => void
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

  // TODO(IDE-946): Update this to use the correct launch command and directory, and handle execeptions.
  serverLaunch() {
    this.resetConnectionPromise()
    try {
      let childProcess = cp.spawn(LAUNCH_COMMAND, {cwd: LAUNCH_DIR})
      let connection = rpc.createMessageConnection(
        new rpc.StreamMessageReader(childProcess.stdout),
        new rpc.StreamMessageWriter(childProcess.stdin)
      )
      connection.listen()
      this.connectionResolve(connection)
    } catch (e) {
      this.connectionReject(e)
    }
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
