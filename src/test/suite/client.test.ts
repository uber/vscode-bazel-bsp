import * as assert from 'assert'
import * as vscode from 'vscode'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as sinon from 'sinon'
import {MessageConnection} from 'vscode-jsonrpc'
import * as bsp from '../../bsp/bsp'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {BuildServerManager} from '../../rpc/server-manager'
import {Utils} from '../../utils/utils'
import {createSampleMessageConnection} from './test-utils'

suite('Build Client', () => {
  let ctx: vscode.ExtensionContext
  let buildClient: BazelBSPBuildClient
  let buildServerStub: sinon.SinonStubbedInstance<BuildServerManager>
  let sampleConn: MessageConnection
  let clientOutputChannel: vscode.LogOutputChannel

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    // Set up a stubbed build server which returns a sample connection.
    // To control behavior of the connection, tests may stub methods on sampleConn as needed.
    buildServerStub = sandbox.createStubInstance(BuildServerManager)
    sampleConn = createSampleMessageConnection()
    buildServerStub.getConnection.returns(Promise.resolve(sampleConn))

    clientOutputChannel = vscode.window.createOutputChannel('sample', {
      log: true,
    })
    sandbox
      .stub(vscode.window, 'createOutputChannel')
      .returns(clientOutputChannel)

    // Return a fixed workspace root to avoid impact of local environment.
    sandbox
      .stub(Utils, 'getWorkspaceRoot')
      .returns(vscode.Uri.parse('file:///workspace'))

    // Set up the testing app which includes injected dependnecies and the stubbed BuildServerManager
    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        BazelBSPBuildClient,
      ],
    })
      .useMocker(token => {
        if (token === BuildServerManager) {
          return buildServerStub
        }
        throw new Error('No mock available for token.')
      })
      .compile()

    buildClient = moduleRef.get(BazelBSPBuildClient)
  })

  afterEach(() => {
    sandbox.restore()
  })

  test('Initialization success', async () => {
    const sampleInitResult: bsp.InitializeBuildResult = {
      displayName: 'sample',
      version: '0.0.0',
      bspVersion: '0.0.1',
      capabilities: {},
    }

    // Set up behavior of the sample connection.
    const initRequestStub = sandbox
      .stub(sampleConn, 'sendRequest')
      .resolves(sampleInitResult)
    const initNotificationStub = sandbox
      .stub(sampleConn, 'sendNotification')
      .resolves()
    const onNotificationStub = sandbox.stub(sampleConn, 'onNotification')

    // Execute and wait for getInitializationResult to resolve.
    await buildClient.onModuleInit()
    const actualInitResult = await buildClient.getInitializeResult()

    assert.equal(actualInitResult, sampleInitResult)
    assert.equal(ctx.subscriptions.length, 2)

    // Ensure that the client registers handlers for notifications/requests.
    assert.ok(onNotificationStub.callCount > 0)

    // Check for valid initialization call with key fields populated.
    let initRequest = initRequestStub.getCall(0)
    assert.equal(initRequest.args[0], bsp.BuildInitialize.type)
    assert.ok(initRequest.args[1].capabilities)
    assert.ok(initRequest.args[1].rootUri)
    assert.ok(initRequest.args[1].version)

    // Check that initialization result has been sent to the server.
    assert.equal(initNotificationStub.callCount, 1)
    assert.equal(
      initNotificationStub.getCall(0).args[0],
      bsp.OnBuildInitialized.type
    )
  })

  test('Initialization failure', async () => {
    // Simulate rejection of initialization request.
    sandbox.stub(sampleConn, 'sendRequest').rejects(new Error('Failed to send'))

    // Execute, and wait for getInitializationResult to reject.
    await buildClient.onModuleInit()
    try {
      const initPromise = await buildClient.getInitializeResult()
      assert.fail('Expected initializationResult promise to be rejected.')
    } catch (e) {
      // Expect initialization result to be rejected and contain a valid error.
      assert.ok(e instanceof Error)
    }
  })

  test('onBuildLogMessage', async () => {
    const sampleParams: bsp.LogMessageParams[] = [
      {
        type: bsp.MessageType.Error,
        message: 'foo',
        task: {id: 'Sample task 1'},
        originId: '000',
      },
      {
        type: bsp.MessageType.Warning,
        message: 'bar',
        task: {id: 'Sample task 1'},
        originId: 'aaa',
      },
      {
        type: bsp.MessageType.Log,
        message: 'abc',
        task: {id: 'Sample task 2'},
        originId: '222',
      },
      {
        type: bsp.MessageType.Info,
        message: 'def',
        task: {id: 'Sample task 3'},
        originId: 'bbb',
      },
      {
        type: bsp.MessageType.Error,
        message: 'ghi',
        task: {id: 'Sample task 4'},
        originId: '444',
      },
      {
        type: bsp.MessageType.Warning,
        message: 'jkl',
        task: {id: 'Sample task 2'},
        originId: '666',
      },
    ]

    const errorStub = sandbox.stub(clientOutputChannel, 'error')
    const warnStub = sandbox.stub(clientOutputChannel, 'warn')
    const infoStub = sandbox.stub(clientOutputChannel, 'info')

    for (const params of sampleParams) {
      buildClient.onBuildLogMessage(params)
    }

    // Check that each method has been called for the correct set of messages.
    const errorParams = sampleParams.filter(
      params => params.type === bsp.MessageType.Error
    )
    assert.equal(errorStub.callCount, errorParams.length)
    errorParams.forEach(params => {
      errorStub.calledWith(params.message)
    })

    const warnParams = sampleParams.filter(
      params => params.type === bsp.MessageType.Error
    )
    assert.equal(warnStub.callCount, warnParams.length)
    warnParams.forEach(params => {
      warnStub.calledWith(params.message)
    })

    const infoParams = sampleParams.filter(
      params =>
        params.type === bsp.MessageType.Info ||
        params.type === bsp.MessageType.Log
    )
    assert.equal(infoStub.callCount, infoParams.length)
    infoParams.forEach(params => {
      infoStub.calledWith(params.message)
    })
  })

  test('onBuildShowMessage', async () => {
    const sampleParams: bsp.ShowMessageParams[] = [
      {
        type: bsp.MessageType.Error,
        message: 'foo',
        task: {id: 'Sample task 1'},
        originId: '000',
      },
      {
        type: bsp.MessageType.Warning,
        message: 'bar',
        task: {id: 'Sample task 1'},
        originId: 'aaa',
      },
      {
        type: bsp.MessageType.Log,
        message: 'abc',
        task: {id: 'Sample task 2'},
        originId: '222',
      },
      {
        type: bsp.MessageType.Info,
        message: 'def',
        task: {id: 'Sample task 3'},
        originId: 'bbb',
      },
      {
        type: bsp.MessageType.Error,
        message: 'ghi',
        task: {id: 'Sample task 4'},
        originId: '444',
      },
      {
        type: bsp.MessageType.Warning,
        message: 'jkl',
        task: {id: 'Sample task 2'},
        originId: '666',
      },
    ]

    const errorStub = sandbox.stub(vscode.window, 'showErrorMessage')
    const warnStub = sandbox.stub(vscode.window, 'showWarningMessage')
    const infoStub = sandbox.stub(vscode.window, 'showInformationMessage')
    const logStub = sandbox.stub(clientOutputChannel, 'info')

    for (const params of sampleParams) {
      buildClient.onBuildShowMessage(params)
    }

    // Check that each method has been called for the correct set of messages.
    const errorParams = sampleParams.filter(
      params => params.type === bsp.MessageType.Error
    )
    assert.equal(errorStub.callCount, errorParams.length)
    errorParams.forEach(params => {
      errorStub.calledWith(params.message)
    })

    const warnParams = sampleParams.filter(
      params => params.type === bsp.MessageType.Error
    )
    assert.equal(warnStub.callCount, warnParams.length)
    warnParams.forEach(params => {
      warnStub.calledWith(params.message)
    })

    const infoParams = sampleParams.filter(
      params => params.type === bsp.MessageType.Info
    )
    assert.equal(infoStub.callCount, infoParams.length)
    infoParams.forEach(params => {
      infoStub.calledWith(params.message)
    })

    const logParams = sampleParams.filter(
      params => params.type === bsp.MessageType.Log
    )
    assert.equal(logStub.callCount, logParams.length)
    logParams.forEach(params => {
      logStub.calledWith(params.message)
    })
  })
})
