import * as assert from 'assert'
import * as vscode from 'vscode'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as sinon from 'sinon'
import cp from 'child_process'
import {MessageConnection} from 'vscode-jsonrpc'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {BuildServerManager} from '../../rpc/server-manager'

suite('Build Client', () => {
  let ctx: vscode.ExtensionContext
  let buildClient: BazelBSPBuildClient
  let buildServer: BuildServerManager
  let spawnStub: sinon.SinonStub

  beforeEach(async () => {
    let process = cp.spawn('echo', ['hello'])
    spawnStub = sinon.stub(cp, 'spawn').returns(process)

    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        BuildServerManager,
        BazelBSPBuildClient,
      ],
    }).compile()

    buildClient = moduleRef.get(BazelBSPBuildClient)
    buildServer = moduleRef.get(BuildServerManager)
    buildServer.serverLaunch()
  })

  afterEach(() => {
    sinon.restore()
  })

  test('onModuleInit', async () => {
    await buildClient.onModuleInit()
    assert.equal(ctx.subscriptions.length, 1)
  })
})
