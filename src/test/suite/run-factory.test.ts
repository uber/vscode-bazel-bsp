import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {TestCaseStore} from '../../test-explorer/store'
import {TestResolver} from '../../test-explorer/resolver'
import {BuildServerManager} from '../../rpc/server-manager'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {TestRunner} from '../../test-runner/runner'
import {RunTrackerFactory} from '../../test-runner/run-factory'
import {TestCaseInfo} from '../../test-explorer/test-info'
import {populateTestCaseStore} from './test-utils'
import sinon from 'sinon'

suite('Test Runner Factory', () => {
  let ctx: vscode.ExtensionContext
  let runFactory: RunTrackerFactory
  let testCaseStore: TestCaseStore
  let buildClient: BazelBSPBuildClient

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        BazelBSPBuildClient,
        TestCaseStore,
        BuildServerManager,
        TestResolver,
        TestRunner,
        RunTrackerFactory,
      ],
    }).compile()
    moduleRef.init()
    testCaseStore = moduleRef.get(TestCaseStore)
    buildClient = moduleRef.get(BazelBSPBuildClient)
    runFactory = moduleRef.get(RunTrackerFactory)

    populateTestCaseStore(testCaseStore)
  })

  afterEach(() => {
    sandbox.reset()
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
  })

  test('newRun', async () => {
    const registerHandlersStub = sandbox.stub(
      buildClient,
      'registerOriginHandlers'
    )
    const disposeHandlersStub = sandbox.stub(
      buildClient,
      'disposeOriginHandlers'
    )

    const pendingTests: Set<vscode.TestItem> = new Set()
    const roots: vscode.TestItem[] = []

    const sampleToken = new vscode.CancellationTokenSource().token
    testCaseStore.testController.items.forEach(item => {
      // Recursively add each item and all if its children to the pending tests set.
      const addChildren = (item: vscode.TestItem) => {
        pendingTests.add(item)
        item.children.forEach(child => addChildren(child))
      }
      addChildren(item)
      roots.push(item)
    })
    const runTracker = runFactory.newRun(
      new vscode.TestRunRequest(Array.from(roots)),
      sampleToken
    )

    // Confirm that the returned TestRunTracker is set up and can execute each test case.
    assert.ok(runTracker.originName)
    await runTracker.executeRun(async item => {
      pendingTests.delete(item)
    })
    assert.equal(pendingTests.size, 0)
    assert.ok(registerHandlersStub.calledOnce)
    assert.equal(registerHandlersStub.firstCall.args[0], runTracker.originName)
    assert.equal(registerHandlersStub.firstCall.args[1], runTracker)
    assert.ok(disposeHandlersStub.calledOnce)
  })
})
