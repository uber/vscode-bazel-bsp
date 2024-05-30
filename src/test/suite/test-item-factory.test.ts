import * as vscode from 'vscode'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'

import {
  outputChannelProvider,
  contextProviderFactory,
  TEST_CONTROLLER_TOKEN,
} from '../../custom-providers'
import {TestResolver} from '../../test-explorer/resolver'
import {TestCaseStore} from '../../test-explorer/store'
import {TestItemFactory} from '../../test-info/test-item-factory'
import * as assert from 'assert'
import {BuildTarget, SourceItem, SourceItemKind} from '../../bsp/bsp'
import {TestItemType} from '../../test-info/test-info'
import {DocumentTestItem} from '../../language-tools/manager'

suite('Test Item Factory', () => {
  let ctx: vscode.ExtensionContext
  let testCaseStore: TestCaseStore
  let testItemFactory: TestItemFactory

  const sampleTarget: BuildTarget = {
    id: {uri: 'test'},
    displayName: 'test',
    tags: [],
    languageIds: [],
    dependencies: [],
    capabilities: {},
    baseDirectory: 'file:///home/user/repo/root/dir',
  }

  beforeEach(async () => {
    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [contextProviderFactory(ctx), TestCaseStore, TestItemFactory],
    })
      .useMocker(token => {
        if (token === TEST_CONTROLLER_TOKEN) {
          return vscode.tests.createTestController('testItemTestController', '')
        }
        throw new Error('No mock available for token.')
      })
      .compile()
    testCaseStore = moduleRef.get(TestCaseStore)
    testItemFactory = moduleRef.get(TestItemFactory)
  })

  afterEach(() => {
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
    testCaseStore.testController.dispose()
  })

  test('create root item', async () => {
    const sampleURI = vscode.Uri.parse('file:///workspace')
    const item = testItemFactory.createRootTestItem(sampleURI)
    const itemData = testCaseStore.testCaseMetadata.get(item)
    assert.ok(itemData)
    assert.strictEqual(itemData?.type, TestItemType.Root)
    assert.strictEqual(item.uri, sampleURI)
  })

  test('create build target item', async () => {
    const sampleURI = vscode.Uri.parse('file:///workspace')

    const item = testItemFactory.createBuildTargetTestItem(
      sampleTarget,
      sampleURI
    )
    const itemData = testCaseStore.testCaseMetadata.get(item)
    assert.ok(itemData)
    assert.ok(item.canResolveChildren)
    assert.strictEqual(itemData?.type, TestItemType.BazelTarget)
    assert.strictEqual(item.uri, sampleURI)
  })

  test('create source file item', async () => {
    const sourceItem: SourceItem = {
      uri: 'file:///workspace/test/file.go',
      kind: SourceItemKind.File,
      generated: false,
    }

    const item = testItemFactory.createSourceFileTestItem(
      sampleTarget,
      sourceItem
    )
    const itemData = testCaseStore.testCaseMetadata.get(item)
    assert.ok(itemData)
    assert.strictEqual(itemData?.type, TestItemType.SourceFile)
    assert.strictEqual(
      item.uri?.fsPath,
      vscode.Uri.parse(sourceItem.uri).fsPath
    )
    assert.equal(
      item.id,
      `{sourcefile}:${sampleTarget.id.uri}:${sourceItem.uri}`
    )
  })

  test('create test case items', async () => {
    const items: DocumentTestItem[] = [
      {
        name: 'sample1',
        uri: vscode.Uri.parse('file:///workspace/test/file.go'),
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: 'sample1',
      },
      {
        name: 'sample2',
        uri: vscode.Uri.parse('file:///workspace/test/file.go'),
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: 'sample2',
      },
      {
        name: 'sample3',
        uri: vscode.Uri.parse('file:///workspace/test/file.go'),
        range: new vscode.Range(0, 0, 0, 0),
        testFilter: 'sample3',
      },
    ]

    for (const item of items) {
      const result = testItemFactory.createTestCaseTestItem(item, sampleTarget)
      assert.equal(result.id, `{testcase}:test:${item.uri.path}:${item.name}`)
      assert.deepStrictEqual(result.range, item.range)
      assert.equal(result.uri?.fsPath, item.uri.fsPath)
    }
  })

  test('create target directory items', async () => {
    const dirs = [
      'file:///home/user/repo/root/dir/src/1',
      'file:///home/user/repo/root/dir/src/2',
      'file:///home/user/repo/root/dir/src/3',
      'file:///home/user/repo/root/project/src/1',
      'file:///home/user/repo/root/project/src/2',
      'file:///home/user/repo/root/dir',
    ]

    const directories = new Map<string, vscode.TestItem>()
    for (const dir of dirs) {
      const results = testItemFactory.createPathSegmentTestItems(
        directories,
        dir
      )
      assert.equal(
        results.baseTestItem.id,
        `{targetdir}:${vscode.Uri.parse(dir).fsPath}`
      )
      assert.equal(
        results.baseTestItem.uri?.fsPath,
        `${vscode.Uri.parse(dir).fsPath}`
      )
      assert.equal(results.rootTestItem.id, '{targetdir}:/')
      assert.equal(results.rootTestItem.uri?.fsPath, '/')
    }
  })

  test('create source directory items', async () => {
    const dirs = [
      'file:///home/user/repo/root/dir/src/1',
      'file:///home/user/repo/root/dir/src/2',
      'file:///home/user/repo/root/dir/src/3',
      'file:///home/user/repo/root/project/src/1',
      'file:///home/user/repo/root/project/src/2',
      'file:///home/user/repo/root/dir',
    ]

    const directories = new Map<string, vscode.TestItem>()
    for (const dir of dirs) {
      const results = testItemFactory.createPathSegmentTestItems(
        directories,
        dir,
        sampleTarget
      )

      assert.equal(
        results.baseTestItem.id,
        `{sourcedir}:test:${vscode.Uri.parse(dir).fsPath}`
      )
      assert.equal(
        results.baseTestItem.uri?.fsPath,
        vscode.Uri.parse(dir).fsPath
      )
      assert.equal(results.rootTestItem.id, '{sourcedir}:test:/')
      assert.equal(results.rootTestItem.uri?.fsPath, '/')
    }
  })
})
