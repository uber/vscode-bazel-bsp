import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import cp from 'child_process'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as rpc from 'vscode-jsonrpc'

import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {BuildServerManager} from '../../rpc/server-manager'
import {createSampleMessageConnection} from './test-utils'

suite('Build Server', () => {
  let ctx: vscode.ExtensionContext
  let buildServer: BuildServerManager
  let spawnStub: sinon.SinonStub
  let sampleConn: rpc.MessageConnection

  beforeEach(async () => {
    let process = cp.spawn('echo', ['hello'])
    spawnStub = sinon.stub(cp, 'spawn').returns(process)

    sampleConn = createSampleMessageConnection()
    sinon.stub(rpc, 'createMessageConnection').returns(sampleConn)

    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        BuildServerManager,
      ],
    }).compile()

    buildServer = moduleRef.get(BuildServerManager)
  })

  afterEach(() => {
    sinon.restore()
  })

  test('OnModuleInit', async () => {
    buildServer.onModuleInit()
    assert.equal(ctx.subscriptions.length, 1)
    const conn = await buildServer.getConnection()
    assert.ok(spawnStub.calledOnce)
    assert.ok(conn)
  })

  test('ServerLaunch', async () => {
    const listenStub = sinon.stub(sampleConn, 'listen')

    buildServer.serverLaunch()
    const conn = await buildServer.getConnection()

    assert.ok(spawnStub.calledOnce)
    assert.ok(listenStub.calledOnce)
    assert.ok(conn)
  })

  test('Dispose', async () => {
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
