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

suite('Test Resolver', () => {
  let ctx: vscode.ExtensionContext
  let testCaseStore: TestCaseStore
  let testResolver: TestResolver

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
      ],
    }).compile()
    moduleRef.init()
    testResolver = moduleRef.get(TestResolver)
    testCaseStore = moduleRef.get(TestCaseStore)
  })

  afterEach(() => {
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
  })

  test('onModuleInit', async () => {
    await testResolver.onModuleInit()
    assert.equal(ctx.subscriptions.length, 1)
    assert.ok(testCaseStore.testController.resolveHandler)
  })
})
