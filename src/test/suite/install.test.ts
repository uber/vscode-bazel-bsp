import * as assert from 'assert'
import * as vscode from 'vscode'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as sinon from 'sinon'
import {MessageConnection} from 'vscode-jsonrpc'
import * as bsp from '../../bsp/bsp'
import * as axios from 'axios'
import fs from 'fs/promises'
import cp from 'child_process'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {BuildServerManager} from '../../server/server-manager'
import {Utils} from '../../utils/utils'
import {createSampleMessageConnection} from './test-utils'
import {BazelBSPInstaller} from '../../server/install'

suite('BSP Installer', () => {
  let ctx: vscode.ExtensionContext
  let bazelBSPInstaller: BazelBSPInstaller
  let buildServerStub: sinon.SinonStubbedInstance<BuildServerManager>
  let sampleConn: MessageConnection
  let clientOutputChannel: vscode.LogOutputChannel
  let spawnStub: sinon.SinonStub

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    let process = cp.spawn('echo')
    spawnStub = sandbox.stub(cp, 'spawn').returns(process)

    // Return a fixed workspace root to avoid impact of local environment.
    sandbox.stub(Utils, 'getWorkspaceGitRoot').resolves('/repo/root')

    // Set up the testing app which includes injected dependnecies and the stubbed BuildServerManager
    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        BazelBSPInstaller,
      ],
    }).compile()
    bazelBSPInstaller = moduleRef.get(BazelBSPInstaller)
  })

  afterEach(() => {
    sandbox.restore()
  })

  test('spawn install process', async () => {
    // User selection to install BSP
    sandbox
      .stub(vscode.window, 'showErrorMessage')
      .resolves({title: 'Install BSP'})

    // Simulated data returned by coursier download request.
    const sampleData = 'sample data'
    sandbox.stub(axios.default, 'get').resolves({data: sampleData} as any)

    const writeFileSpy = sandbox.spy(fs, 'writeFile')
    const installResult = await bazelBSPInstaller.install()

    // Confirm that the coursier data was written to a file.
    const coursierPath = writeFileSpy.getCalls()[0].args[0]
    const writtenData = writeFileSpy.getCalls()[0].args[1]
    assert.equal(writtenData, sampleData)
    assert.equal(spawnStub.callCount, 1)

    // Just confirm that coursier path was part of the spawn call, to leave flexibility for other changes to the command.
    assert.ok(spawnStub.getCalls()[0].args[0].includes(coursierPath))
    assert.ok(installResult)
  })

  test('failed coursier download', async () => {
    sandbox
      .stub(vscode.window, 'showErrorMessage')
      .resolves({title: 'Install BSP'})

    sandbox.stub(axios.default, 'get').rejects(new Error('sample error'))

    const writeFileSpy = sandbox.spy(fs, 'writeFile')
    const installResult = await bazelBSPInstaller.install()

    // Confirm that installation was gracefully interrupted.
    assert.ok(writeFileSpy.notCalled)
    assert.ok(spawnStub.notCalled)
    assert.ok(!installResult)
  })

  test('user decline', async () => {
    sandbox.stub(vscode.window, 'showErrorMessage').resolves({title: 'other'})
    sandbox.stub(axios.default, 'get').resolves({data: 'sample data'} as any)
    const actualInitResult = await bazelBSPInstaller.install()
    assert.ok(!actualInitResult)
  })
})
