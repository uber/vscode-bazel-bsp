import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as sinon from 'sinon'
import * as path from 'path'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {TestCaseStore} from '../../test-explorer/store'
import {TestResolver} from '../../test-explorer/resolver'
import {
  BuildServerManager,
  CANCEL_ERROR_CODE,
} from '../../server/server-manager'
import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {createSampleMessageConnection} from './test-utils'
import {MessageConnection} from 'vscode-jsonrpc'
import {Utils} from '../../utils/utils'
import * as bsp from '../../bsp/bsp'
import {
  BuildTargetTestCaseInfo,
  TestCaseInfo,
  TestItemType,
} from '../../test-info/test-info'
import * as settings from '../../utils/settings'
import {TestItemFactory} from '../../test-info/test-item-factory'

suite('Test Resolver', () => {
  let ctx: vscode.ExtensionContext
  let testCaseStore: TestCaseStore
  let testResolver: TestResolver
  let buildServerStub: sinon.SinonStubbedInstance<BuildServerManager>
  let buildClientStub: sinon.SinonStubbedInstance<BazelBSPBuildClient>
  let sampleConn: MessageConnection

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    // Set up a stubbed build server which returns a sample connection.
    // To control behavior of the connection, tests may stub methods on sampleConn as needed.
    buildServerStub = sandbox.createStubInstance(BuildServerManager)
    sampleConn = createSampleMessageConnection()
    buildServerStub.getConnection.returns(Promise.resolve(sampleConn))

    buildClientStub = sandbox.createStubInstance(BazelBSPBuildClient)

    // Return a fixed workspace root to avoid impact of local environment.
    sandbox
      .stub(Utils, 'getWorkspaceRoot')
      .returns(vscode.Uri.parse('file:///workspace'))

    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        TestCaseStore,
        TestResolver,
        TestItemFactory,
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

    testResolver = moduleRef.get(TestResolver)
    testCaseStore = moduleRef.get(TestCaseStore)
  })

  afterEach(() => {
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
    testCaseStore.testController.dispose()
    sandbox.restore()
  })

  test('onModuleInit', async () => {
    testResolver.onModuleInit()
    assert.equal(ctx.subscriptions.length, 1)
    assert.ok(testCaseStore.testController.resolveHandler)
  })

  suite('resolveHandler', () => {
    const sampleBuildTargetsResult: bsp.WorkspaceBuildTargetsResult = {
      targets: [
        {
          displayName: 'foo',
          id: {uri: 'a'},
          capabilities: {canTest: true},
          tags: [],
          languageIds: ['java'],
          dependencies: [],
          baseDirectory: '/repo/root/base/directory/a',
        },
        {
          displayName: 'bar',
          id: {uri: 'b'},
          capabilities: {canTest: false},
          tags: [],
          languageIds: ['python'],
          dependencies: [],
          baseDirectory: '/repo/root/base/directory/b',
        },
        {
          displayName: 'abc',
          id: {uri: 'c'},
          capabilities: {},
          tags: [],
          languageIds: ['java'],
          dependencies: [],
          baseDirectory: '/repo/root/base/directory/c',
        },
        {
          displayName: 'def',
          id: {uri: 'd'},
          capabilities: {canTest: true},
          tags: [],
          languageIds: ['java'],
          dependencies: [],
          baseDirectory: '/repo/root/base/directory/d',
        },
        {
          displayName: 'ghi',
          id: {uri: 'e'},
          capabilities: {canTest: true},
          tags: [],
          languageIds: ['java'],
          dependencies: [],
        },
      ],
    }

    const sampleSourceItemsResult = (
      target: bsp.BuildTarget
    ): bsp.SourcesResult => {
      return {
        items: [
          {
            target: target.id,
            sources: [
              {
                uri: path.join(target.baseDirectory ?? '', 'MyFile1.language'),
                kind: bsp.SourceItemKind.File,
                generated: false,
              },
              {
                uri: path.join(target.baseDirectory ?? '', 'MyFile2.language'),
                kind: bsp.SourceItemKind.File,
                generated: false,
              },
              {
                uri: path.join(
                  target.baseDirectory ?? '',
                  '/src/dir/1/',
                  'MyFile4.language'
                ),
                kind: bsp.SourceItemKind.File,
                generated: false,
              },
              {
                uri: path.join(
                  target.baseDirectory ?? '',
                  '/src/dir/2/',
                  'MyFile5.language'
                ),
                kind: bsp.SourceItemKind.File,
                generated: false,
              },
              {
                uri: path.join(
                  target.baseDirectory ?? '',
                  '/src/dir/2/',
                  'MyFile6.language'
                ),
                kind: bsp.SourceItemKind.File,
                generated: false,
              },
            ],
          },
        ],
      }
    }

    beforeEach(() => {
      testCaseStore.onModuleInit()
      testResolver.onModuleInit()

      buildClientStub.getInitializeResult.resolves({
        displayName: 'sample',
        version: '1.0.0',
        bspVersion: '1.0.0',
        capabilities: {},
      })

      sandbox.stub(Utils, 'getWorkspaceGitRoot').resolves('/repo/root')
      sandbox
        .stub(settings, 'getExtensionSetting')
        .withArgs(settings.SettingName.BAZEL_PROJECT_FILE_PATH)
        .onFirstCall()
        .returns('./projectview.bazelproject')
        .onSecondCall()
        .returns('./projectview2.bazelproject')
    })

    test('root', async () => {
      assert.ok(testCaseStore.testController.items.get('root') === undefined)

      // Run with undefined test case creates a new root in the test controller and metadata.
      assert.ok(testCaseStore.testController.resolveHandler)
      await testCaseStore.testController.resolveHandler(undefined)
      const root = testCaseStore.testController.items.get('root')
      assert.ok(root)
      assert.ok(root.canResolveChildren)
      assert.equal(root.children.size, 0)
      assert.ok(root.uri?.path.endsWith('projectview.bazelproject'))

      const metadata = testCaseStore.testCaseMetadata.get(root)
      assert.ok(metadata)
      assert.equal(metadata.type, TestItemType.Root)

      // A second run respects modified URI.
      await testCaseStore.testController.resolveHandler(undefined)
      const root2 = testCaseStore.testController.items.get('root')
      assert.ok(root2)
      assert.strictEqual(root2.label, root.label)
      assert.strictEqual(root2.id, root.id)
      assert.ok(root2.uri?.path.endsWith('projectview2.bazelproject'))
    })

    test('targets below root', async () => {
      const sendRequestStub = sandbox
        .stub(sampleConn, 'sendRequest')
        .returns(Promise.resolve(sampleBuildTargetsResult))

      const root = testCaseStore.testController.createTestItem(
        'root',
        'Bazel Test Targets'
      )
      testCaseStore.testController.items.add(root)
      testCaseStore.testCaseMetadata.set(
        root,
        new TestCaseInfo(root, undefined, TestItemType.Root)
      )
      assert.ok(testCaseStore.testController.resolveHandler)

      await testCaseStore.testController.resolveHandler(root)

      // Validate items below the root
      assert.equal(root.children.size, 2)
      validateIDValues(
        ['e', '{targetdir}:/repo/root/base/directory'],
        root.children
      )

      // Validate directory nesting
      const targetDirTestItem = root.children.get(
        '{targetdir}:/repo/root/base/directory'
      )
      assert.ok(targetDirTestItem)
      assert.equal(targetDirTestItem.children.size, 2)
      validateIDValues(
        [
          '{targetdir}:/repo/root/base/directory/a',
          '{targetdir}:/repo/root/base/directory/d',
        ],
        targetDirTestItem.children
      )

      // Validate targets placed under directories
      const sampleTarget = targetDirTestItem.children
        .get('{targetdir}:/repo/root/base/directory/d')
        ?.children.get('d')
      assert.ok(sampleTarget)
      assert.ok(sampleTarget.canResolveChildren)
      assert.equal(sampleTarget.children.size, 0)

      // Proper filtering based on target capabilities.
      const shouldBeExcluded = sampleBuildTargetsResult.targets.filter(
        target =>
          target.capabilities.canTest === false ||
          target.capabilities.canTest === undefined
      )

      for (const excluded of shouldBeExcluded) {
        const recursiveCheck = (item: vscode.TestItem) => {
          item.children.forEach(child => {
            recursiveCheck(child)
            assert.equal(item.children.get(excluded.id.uri), undefined)
          })
        }
        recursiveCheck(root)
      }
    })

    test('error getting targets', async () => {
      const root = testCaseStore.testController.createTestItem(
        'root',
        'Bazel Test Targets'
      )
      testCaseStore.testController.items.add(root)
      testCaseStore.testCaseMetadata.set(
        root,
        new TestCaseInfo(root, undefined, TestItemType.Root)
      )
      assert.ok(testCaseStore.testController.resolveHandler)

      // Simulate an error in requesting targets.
      const sendRequestStub = sandbox
        .stub(sampleConn, 'sendRequest')
        .returns(Promise.reject(new Error('sample error')))
      try {
        await testCaseStore.testController.resolveHandler(root)
        assert.fail('Expected error')
      } catch (e) {
        assert.ok(e instanceof Error)
      }
    })

    test('source files within a target', async () => {
      const buildTarget = sampleBuildTargetsResult.targets[0]
      const sendRequestStub = sandbox
        .stub(sampleConn, 'sendRequest')
        .returns(Promise.resolve(sampleSourceItemsResult(buildTarget)))

      const targetTestItem = testCaseStore.testController.createTestItem(
        'sample',
        'Sample target test item'
      )
      testCaseStore.testController.items.add(targetTestItem)
      testCaseStore.testCaseMetadata.set(
        targetTestItem,
        new BuildTargetTestCaseInfo(targetTestItem, buildTarget)
      )
      assert.ok(testCaseStore.testController.resolveHandler)

      await testCaseStore.testController.resolveHandler(targetTestItem)
      assert.equal(targetTestItem.children.size, 3)
      targetTestItem.children.forEach(child => {
        assert.ok(testCaseStore.testCaseMetadata.get(child))
      })

      const sampleSrcDir1 = targetTestItem.children
        .get('{sourcedir}:a:/repo/root/base/directory/a/src/dir')
        ?.children.get('{sourcedir}:a:/repo/root/base/directory/a/src/dir/1')
      assert.ok(sampleSrcDir1)
      assert.equal(sampleSrcDir1.children.size, 1)
      validateIDValues(
        ['/repo/root/base/directory/a/src/dir/1/MyFile4.language'],
        sampleSrcDir1?.children
      )

      const sampleSrcDir2 = targetTestItem.children
        .get('{sourcedir}:a:/repo/root/base/directory/a/src/dir')
        ?.children.get('{sourcedir}:a:/repo/root/base/directory/a/src/dir/2')
      assert.ok(sampleSrcDir2)
      assert.equal(sampleSrcDir2.children.size, 2)
      validateIDValues(
        ['/repo/root/base/directory/a/src/dir/2/MyFile5.language'],
        sampleSrcDir2.children
      )
    })

    test('refresh success', async () => {
      const sendRequestStub = sandbox
        .stub(sampleConn, 'sendRequest')
        .resolves(sampleBuildTargetsResult)

      const root = testCaseStore.testController.createTestItem(
        'root',
        'Bazel Test Targets'
      )
      testCaseStore.testController.items.add(root)
      testCaseStore.testCaseMetadata.set(
        root,
        new TestCaseInfo(root, undefined, TestItemType.Root)
      )

      const tokenSource = new vscode.CancellationTokenSource()
      assert.ok(testCaseStore.testController.refreshHandler)
      await testCaseStore.testController.refreshHandler(tokenSource.token)
      assert.equal(root.children.size, 2)
      root.children.forEach(child => {
        assert.ok(testCaseStore.testCaseMetadata.get(child))
      })
    })

    test('cancelled refresh', async () => {
      const sendRequestStub = sandbox
        .stub(sampleConn, 'sendRequest')
        .rejects({code: CANCEL_ERROR_CODE})

      const root = testCaseStore.testController.createTestItem(
        'root',
        'Bazel Test Targets'
      )
      testCaseStore.testController.items.add(root)
      testCaseStore.testCaseMetadata.set(
        root,
        new TestCaseInfo(root, undefined, TestItemType.Root)
      )

      const tokenSource = new vscode.CancellationTokenSource()
      tokenSource.cancel()
      assert.ok(testCaseStore.testController.refreshHandler)
      await testCaseStore.testController.refreshHandler(tokenSource.token)
      assert.equal(root.children.size, 0)
      assert.ok(root.description?.startsWith('Refresh Canceled:'))
    })
  })
})

function validateIDValues(
  expectedIDValues: string[],
  testItems: vscode.TestItemCollection
) {
  const idValues = new Set(expectedIDValues)
  testItems.forEach(child => {
    idValues.delete(child.id)
  })
  assert.equal(idValues.size, 0)
}
