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
import {TestRunner} from '../../test-explorer/runner'

suite('Test Runner', () => {
  let ctx: vscode.ExtensionContext
  let testRunner: TestRunner

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
      ],
    }).compile()
    moduleRef.init()
    testRunner = moduleRef.get(TestRunner)
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
})
