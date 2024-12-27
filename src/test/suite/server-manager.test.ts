import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import cp from 'child_process'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as rpc from 'vscode-jsonrpc'

import {
  PRIMARY_OUTPUT_CHANNEL_TOKEN,
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {BuildServerManager} from '../../server/server-manager'
import {createSampleMessageConnection} from './test-utils'
import {ConnectionDetailsParser} from '../../server/connection-details'
import {Utils} from '../../utils/utils'
import {BspConnectionDetails} from '../../bsp/bsp'
import * as settings from '../../utils/settings'

suite('Build Server', () => {
  let ctx: vscode.ExtensionContext
  let buildServer: BuildServerManager
  let spawnStub: sinon.SinonStub
  let sampleConn: rpc.MessageConnection
  let appendLineStub: sinon.SinonStub
  let outputChannel: vscode.LogOutputChannel
  let appendLinePromise: Thenable<void>

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    let process = cp.spawn('echo hello; echo world >&2', {
      shell: true,
    })
    spawnStub = sandbox.stub(cp, 'spawn').returns(process)
    outputChannel = vscode.window.createOutputChannel('sample', {log: true})
    appendLinePromise = new Promise(resolve => {
      appendLineStub = sandbox
        .stub(outputChannel, 'appendLine')
        .callsFake(() => resolve())
    })

    sampleConn = createSampleMessageConnection()
    sandbox.stub(rpc, 'createMessageConnection').returns(sampleConn)
    sandbox.stub(Utils, 'getWorkspaceGitRoot').resolves('/sample/path')

    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [contextProviderFactory(ctx), BuildServerManager],
    })
      .useMocker(token => {
        if (token === PRIMARY_OUTPUT_CHANNEL_TOKEN) {
          return outputChannel
        } else if (token === ConnectionDetailsParser) {
          return {
            getServerConnectionDetails: async (
              bspServerName: string,
              repoRoot: string
            ): Promise<BspConnectionDetails> => {
              return {
                name: bspServerName,
                argv: ['/bin/sample', 'arg1', 'arg2'],
                version: '1.0.0',
                bspVersion: '1.0.0',
                languages: [],
              }
            },
          }
        }
        throw new Error('No mock available for token.')
      })
      .compile()

    buildServer = moduleRef.get(BuildServerManager)
  })

  afterEach(() => {
    sandbox.restore()
    ctx.subscriptions.forEach(item => item.dispose())
  })

  test('OnModuleInit', async () => {
    sandbox.stub(settings, 'getExtensionSetting').returns('1.0.0')

    buildServer.onModuleInit()
    assert.equal(ctx.subscriptions.length, 1)
    const conn = await buildServer.getConnection()
    assert.ok(spawnStub.calledOnce)
    assert.ok(conn)
  })

  test('ServerLaunch', async () => {
    sandbox.stub(settings, 'getExtensionSetting').returns('1.0.0')

    const listenStub = sinon.stub(sampleConn, 'listen')

    buildServer.serverLaunch()
    const conn = await buildServer.getConnection()

    await appendLinePromise
    assert.ok(appendLineStub.calledOnce)
    assert.ok(spawnStub.calledOnce)
    assert.ok(listenStub.calledOnce)
    assert.ok(conn)
  })

  test('ServerLaunch, version upgrade', async () => {
    sandbox.stub(settings, 'getExtensionSetting').returns('1.0.1')
    const commandStub = sandbox
      .stub(vscode.commands, 'executeCommand')
      .resolves(true)

    const listenStub = sinon.stub(sampleConn, 'listen')

    buildServer.serverLaunch()
    const conn = await buildServer.getConnection()

    await appendLinePromise
    assert.ok(commandStub.calledOnceWith('bazelbsp.install'))
    assert.ok(appendLineStub.calledOnce)
    assert.ok(spawnStub.calledOnce)
    assert.ok(listenStub.calledOnce)
    assert.ok(conn)
  })

  test('Dispose', async () => {
    sandbox.stub(settings, 'getExtensionSetting').returns('1.0.0')

    buildServer.serverLaunch()
    const conn = await buildServer.getConnection()

    // Ensure that we have called dispose on the connection.
    let isDisposed = false
    conn.onDispose(() => {
      isDisposed = true
    })
    await buildServer.dispose()
    assert.ok(isDisposed)
  })
})
