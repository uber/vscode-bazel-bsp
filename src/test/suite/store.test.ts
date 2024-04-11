import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {TestCaseStore} from '../../test-explorer/store'
import {TestResolver} from '../../test-explorer/resolver'
import {BuildServerManager} from '../../server/server-manager'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {TestRunner} from '../../test-runner/runner'
import {RunTrackerFactory} from '../../test-runner/run-factory'
import {ConnectionDetailsParser} from '../../server/connection-details'

suite('Test Controller', () => {
  let ctx: vscode.ExtensionContext
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
        ConnectionDetailsParser,
      ],
    }).compile()
    moduleRef.init()
    testCaseStore = moduleRef.get(TestCaseStore)
  })

  afterEach(() => {
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
  })

  test('onModuleInit', async () => {
    await testCaseStore.onModuleInit()
    assert.ok(ctx.subscriptions.includes(testCaseStore))
  })
})
