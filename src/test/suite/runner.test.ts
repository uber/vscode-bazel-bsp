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
import {populateTestCaseStore} from './test-utils'
import {TestItem} from 'vscode'
import {RunTrackerFactory} from '../../test-runner/run-factory'

suite('Test Runner', () => {
  let ctx: vscode.ExtensionContext
  let testRunner: TestRunner
  let testCaseStore: TestCaseStore

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
    testRunner = moduleRef.get(TestRunner)
    testCaseStore = moduleRef.get(TestCaseStore)
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

    const requestedTestItems: TestItem[] = []
    testCaseStore.testController.items.forEach(item => {
      requestedTestItems.push(item)
    })
    runProfile.runHandler(
      {include: requestedTestItems, exclude: [], profile: runProfile},
      new vscode.CancellationTokenSource().token
    )
  })
})
