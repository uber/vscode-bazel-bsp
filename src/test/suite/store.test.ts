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
import {ConnectionDetailsParser} from '../../server/connection-details'
import {TestItemFactory} from '../../test-info/test-item-factory'
import {CoverageTracker} from '../../coverage-utils/coverage-tracker'
import {LanguageToolManager} from '../../language-tools/manager'
import sinon from 'sinon'
import {BuildTargetIdentifier} from 'src/bsp/bsp'
import {SyncHintDecorationsManager} from '../../test-explorer/decorator'
import * as bsp from '../../bsp/bsp'

suite('Test Controller', () => {
  let ctx: vscode.ExtensionContext
  let testCaseStore: TestCaseStore
  let sandbox: sinon.SinonSandbox

  let workspaceStateUpdateStub: sinon.SinonStub
  let workspaceStateGetStub: sinon.SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    workspaceStateUpdateStub = sandbox.stub()
    workspaceStateGetStub = sandbox.stub()

    ctx = {
      subscriptions: [],
      asAbsolutePath: (relativePath: string) => `/sample/${relativePath}`,
      workspaceState: {
        update: workspaceStateUpdateStub,
        get: workspaceStateGetStub,
      },
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
            'testStoreTestController',
            ''
          )
        }
        throw new Error('No mock available for token.')
      })
      .compile()
    moduleRef.init()
    testCaseStore = moduleRef.get(TestCaseStore)
  })

  afterEach(() => {
    sandbox.restore()
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
  })

  test('onModuleInit', async () => {
    await testCaseStore.onModuleInit()
    assert.ok(ctx.subscriptions.includes(testCaseStore))
  })

  test('update watcher', async () => {
    await testCaseStore.onModuleInit()

    // Create watcher
    const watcher1 = vscode.workspace.createFileSystemWatcher('/sample/path')
    const watcher1Dispose = sandbox.spy(watcher1, 'dispose')
    testCaseStore.updateTestItemWatcher('test-id', watcher1)
    assert.strictEqual(testCaseStore.testItemWatchers.size, 1)
    assert.strictEqual(testCaseStore.testItemWatchers.get('test-id'), watcher1)

    // Replace watcher
    const watcher2 = vscode.workspace.createFileSystemWatcher('/sample/path')
    const watcher2Dispose = sandbox.spy(watcher2, 'dispose')
    testCaseStore.updateTestItemWatcher('test-id', watcher2)
    assert.strictEqual(testCaseStore.testItemWatchers.size, 1)
    assert.strictEqual(testCaseStore.testItemWatchers.get('test-id'), watcher2)
    assert.ok(watcher1Dispose.called)

    // Separate item
    const watcher3 = vscode.workspace.createFileSystemWatcher('/sample/path')
    const watcher3Dispose = sandbox.spy(watcher3, 'dispose')
    testCaseStore.updateTestItemWatcher('test-id2', watcher3)
    assert.strictEqual(testCaseStore.testItemWatchers.size, 2)
    assert.strictEqual(testCaseStore.testItemWatchers.get('test-id2'), watcher3)
    assert.ok(watcher2Dispose.notCalled)
    assert.ok(watcher3Dispose.notCalled)

    // Clear watcher
    testCaseStore.updateTestItemWatcher('test-id')
    assert.strictEqual(testCaseStore.testItemWatchers.size, 1)
    assert.ok(watcher2Dispose.called)

    testCaseStore.updateTestItemWatcher('test-id2')
    assert.strictEqual(testCaseStore.testItemWatchers.size, 0)
    assert.ok(watcher3Dispose.called)
  })

  test('clear watchers', async () => {
    await testCaseStore.onModuleInit()

    const disposeSpies: sinon.SinonSpy[] = []

    // Set up a tree of test cases with watchers on them.
    const root = testCaseStore.testController.createTestItem('root', '')
    for (let i = 0; i < 3; i++) {
      const parent = testCaseStore.testController.createTestItem(
        `parent${i}`,
        ''
      )
      root.children.add(parent)
      for (let j = 0; j < 3; j++) {
        const child = testCaseStore.testController.createTestItem(
          `child${j}`,
          ''
        )
        parent.children.add(child)
        const newWatcher =
          vscode.workspace.createFileSystemWatcher('/sample/path')
        testCaseStore.updateTestItemWatcher(child.id, newWatcher)
        disposeSpies.push(sandbox.spy(newWatcher, 'dispose'))
      }
    }

    // Ensure that all are disposed when cleared from the root.
    testCaseStore.clearTestItemWatchers(root)
    assert.strictEqual(disposeSpies.length, 9)
    for (const spy of disposeSpies) {
      assert.ok(spy.called)
    }
  })

  test('store target identifiers', async () => {
    await testCaseStore.onModuleInit()

    const item = testCaseStore.testController.createTestItem('test', '')
    const targetIdentifier: BuildTargetIdentifier = {
      uri: 'file:///path/to/test',
    }
    testCaseStore.setTargetIdentifier(targetIdentifier, item)
    assert.strictEqual(
      testCaseStore.getTargetIdentifier(targetIdentifier),
      item
    )

    testCaseStore.clearTargetIdentifiers()
    assert.strictEqual(
      testCaseStore.getTargetIdentifier(targetIdentifier),
      undefined
    )
  })

  test('cache build targets result', async () => {
    await testCaseStore.onModuleInit()

    const mockResult: bsp.WorkspaceBuildTargetsResult = {
      targets: [
        {
          id: {uri: 'file:///path/to/target1'},
          displayName: 'target1',
          baseDirectory: '/path/to',
          tags: [],
          capabilities: {canCompile: true, canTest: true, canRun: true},
          languageIds: [],
          dependencies: [],
        },
      ],
    }

    testCaseStore.cacheBuildTargetsResult(mockResult)
    assert.ok(
      workspaceStateUpdateStub.calledWith(
        'testExplorerBuildTargetsResult',
        mockResult
      )
    )
  })

  test('cache sources result', async () => {
    await testCaseStore.onModuleInit()

    const mockParams: bsp.SourcesParams = {
      targets: [{uri: 'file:///path/to/target1'}],
    }
    const mockResult: bsp.SourcesResult = {
      items: [
        {
          target: {uri: 'file:///path/to/target1'},
          sources: [
            {
              uri: 'file:///path/to/source1.java',
              kind: bsp.SourceItemKind.File,
              generated: false,
            },
          ],
        },
      ],
    }

    const existingContents: Record<string, bsp.SourcesResult> = {
      '{"targets":[{"uri":"file:///path/to/existingTarget"}]}': {
        items: [
          {
            target: {uri: 'file:///path/to/existingTarget'},
            sources: [
              {
                uri: 'file:///path/to/existingSource',
                kind: bsp.SourceItemKind.File,
                generated: false,
              },
            ],
          },
        ],
      },
    }

    workspaceStateGetStub.returns(existingContents)

    testCaseStore.cacheSourcesResult(mockParams, mockResult)

    const expectedResult = {
      ...existingContents,
      '{"targets":[{"uri":"file:///path/to/target1"}]}': mockResult,
    }
    assert.ok(
      workspaceStateUpdateStub.calledWith(
        'testExplorerSourcesResult',
        expectedResult
      )
    )
  })

  test('get cached sources result', async () => {
    await testCaseStore.onModuleInit()

    const mockParams: bsp.SourcesParams = {
      targets: [{uri: 'file:///path/to/target1'}],
    }
    const mockResult: bsp.SourcesResult = {
      items: [
        {
          target: {uri: 'file:///path/to/target1'},
          sources: [
            {
              uri: 'file:///path/to/source1.java',
              kind: bsp.SourceItemKind.File,
              generated: false,
            },
          ],
        },
      ],
    }

    const existingContents: Record<string, bsp.SourcesResult> = {
      '{"targets":[{"uri":"file:///path/to/existingTarget"}]}': {
        items: [
          {
            target: {uri: 'file:///path/to/existingTarget'},
            sources: [
              {
                uri: 'file:///path/to/existingSource',
                kind: bsp.SourceItemKind.File,
                generated: false,
              },
            ],
          },
        ],
      },
      '{"targets":[{"uri":"file:///path/to/target1"}]}': mockResult,
    }

    workspaceStateGetStub.returns(existingContents)

    const result = testCaseStore.getCachedSourcesResult(mockParams)
    assert.deepStrictEqual(result, mockResult)
  })

  test('clear cache', async () => {
    await testCaseStore.onModuleInit()

    testCaseStore.clearCache()
    assert.ok(
      workspaceStateUpdateStub.calledWith(
        'testExplorerBuildTargetsResult',
        undefined
      )
    )
    assert.ok(
      workspaceStateUpdateStub.calledWith(
        'testExplorerSourcesResult',
        undefined
      )
    )
  })
})
