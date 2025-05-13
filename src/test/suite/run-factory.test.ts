import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {TestCaseStore} from '../../test-explorer/store'
import {TestResolver} from '../../test-explorer/resolver'
import {BuildServerManager} from '../../server/server-manager'
import {
  TEST_CONTROLLER_TOKEN,
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {TestRunner} from '../../test-runner/runner'
import {RunTrackerFactory} from '../../test-runner/run-factory'
import {TestCaseInfo} from '../../test-info/test-info'
import {populateTestCaseStore} from './test-utils'
import sinon from 'sinon'
import {ConnectionDetailsParser} from '../../server/connection-details'
import {TestItemFactory} from '../../test-info/test-item-factory'
import {CoverageTracker} from '../../coverage-utils/coverage-tracker'
import {LanguageToolManager} from '../../language-tools/manager'
import {SyncHintDecorationsManager} from '../../test-explorer/decorator'
import * as utils from '../../utils/utils'

suite('Test Runner Factory', () => {
  let ctx: vscode.ExtensionContext
  let runFactory: RunTrackerFactory
  let testCaseStore: TestCaseStore
  let buildClient: BazelBSPBuildClient

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    ctx = {
      subscriptions: [],
      asAbsolutePath: (relativePath: string) => `/sample/${relativePath}`,
    } as unknown as vscode.ExtensionContext
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
        TestItemFactory,
        CoverageTracker,
        LanguageToolManager,
        SyncHintDecorationsManager,
      ],
    })
      .useMocker(token => {
        if (token === TEST_CONTROLLER_TOKEN) {
          return vscode.tests.createTestController(
            'runFactoryTestController',
            ''
          )
        }
        throw new Error('No mock available for token.')
      })
      .compile()
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

  test('newRun sets IDE tag', async () => {
    const detectIdeClientStub = sandbox.stub(utils, 'detectIdeClient')
    detectIdeClientStub.returns('test-ide')

    try {
      const roots: vscode.TestItem[] = []
      testCaseStore.testController.items.forEach(item => {
        roots.push(item)
      })
      const sampleToken = new vscode.CancellationTokenSource().token
      const runTracker = runFactory.newRun(
        new vscode.TestRunRequest(Array.from(roots)),
        sampleToken
      )
      assert.ok(detectIdeClientStub.calledOnce)
      assert.equal(runTracker.getIdeTag(), '--define=ide_client=test-ide')
    } finally {
      detectIdeClientStub.restore()
    }
  })
})
