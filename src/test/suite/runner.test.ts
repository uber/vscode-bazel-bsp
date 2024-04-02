import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import sinon from 'sinon'
import {MessageConnection} from 'vscode-jsonrpc'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {TestCaseStore} from '../../test-explorer/store'
import {TestResolver} from '../../test-explorer/resolver'
import {BuildServerManager} from '../../rpc/server-manager'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {CANCEL_ERROR_CODE, TestRunner} from '../../test-runner/runner'
import {
  createSampleMessageConnection,
  populateTestCaseStore,
} from './test-utils'
import {TestItem} from 'vscode'
import {RunTrackerFactory} from '../../test-runner/run-factory'
import * as bsp from '../../bsp/bsp'

suite('Test Runner', () => {
  let ctx: vscode.ExtensionContext
  let testRunner: TestRunner
  let testCaseStore: TestCaseStore
  let buildServerStub: sinon.SinonStubbedInstance<BuildServerManager>
  let buildClientStub: sinon.SinonStubbedInstance<BazelBSPBuildClient>
  let sampleConn: MessageConnection

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    buildServerStub = sandbox.createStubInstance(BuildServerManager)
    sampleConn = createSampleMessageConnection()
    buildServerStub.getConnection.returns(Promise.resolve(sampleConn))

    buildClientStub = sandbox.createStubInstance(BazelBSPBuildClient)

    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        TestCaseStore,
        TestResolver,
        TestRunner,
        RunTrackerFactory,
      ],
    })
      .useMocker(token => {
        if (token === BuildServerManager) {
          return buildServerStub
        } else if (token === BazelBSPBuildClient) {
          return buildClientStub
        }
        throw new Error('No mock available for token.')
      })
      .compile()
    moduleRef.init()
    testRunner = moduleRef.get(TestRunner)
    testCaseStore = moduleRef.get(TestCaseStore)

    populateTestCaseStore(testCaseStore)
  })

  afterEach(() => {
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
  })

  test('onModuleInit', async () => {
    await testRunner.onModuleInit()
    assert.ok(testRunner.runProfiles.get(vscode.TestRunProfileKind.Run))
    assert.equal(ctx.subscriptions.length, 2)
  })

  test('Test Run', async () => {
    await testRunner.onModuleInit()
    const runProfile = testRunner.runProfiles.get(vscode.TestRunProfileKind.Run)
    assert.ok(runProfile)

    const sampleResult: bsp.TestResult = {
      statusCode: bsp.StatusCode.Ok,
    }
    const connStub = sinon
      .stub(sampleConn, 'sendRequest')
      .returns(Promise.resolve(sampleResult))

    const requestedTestItems: TestItem[] = []
    testCaseStore.testController.items.forEach(item => {
      requestedTestItems.push(item)
    })
    await runProfile.runHandler(
      {include: requestedTestItems, exclude: [], profile: runProfile},
      new vscode.CancellationTokenSource().token
    )
    assert.equal(connStub.callCount, 2)
  })

  test('Test Run with Cancel', async () => {
    await testRunner.onModuleInit()
    const runProfile = testRunner.runProfiles.get(vscode.TestRunProfileKind.Run)
    assert.ok(runProfile)

    const tokenSource = new vscode.CancellationTokenSource()
    let firstRequest = true
    const connStub = sinon.stub(sampleConn, 'sendRequest').callsFake(() => {
      tokenSource.cancel()
      assert.ok(firstRequest)
      firstRequest = false
      return Promise.reject({code: CANCEL_ERROR_CODE})
    })

    const requestedTestItems: TestItem[] = []
    testCaseStore.testController.items.forEach(item => {
      requestedTestItems.push(item)
    })
    await runProfile.runHandler(
      {include: requestedTestItems, exclude: [], profile: runProfile},
      tokenSource.token
    )
    assert.equal(connStub.callCount, 1)
  })
})
