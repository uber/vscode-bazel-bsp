import * as vscode from 'vscode'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'

import {
  outputChannelProvider,
  contextProviderFactory,
} from '../../custom-providers'
import {TestResolver} from '../../test-explorer/resolver'
import {TestCaseStore} from '../../test-explorer/store'
import {TestItemFactory} from '../../test-info/test-item-factory'
import * as assert from 'assert'
import {BuildTarget, SourceItem, SourceItemKind} from '../../bsp/bsp'
import {TestItemType} from '../../test-info/test-info'

suite('Test Resolver', () => {
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
  }

  beforeEach(async () => {
    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [contextProviderFactory(ctx), TestCaseStore, TestItemFactory],
    }).compile()
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
  })
})
