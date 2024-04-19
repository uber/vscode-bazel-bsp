import * as vscode from 'vscode'
import {Inject} from '@nestjs/common'
import {TestItem} from 'vscode'

import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {TestCaseStore} from '../test-explorer/store'
import {BuildTargetTestCaseInfo, TestCaseInfo, TestItemType} from './test-info'
import {BuildTarget} from '../bsp/bsp'

/**
 * Class which includes various methods to create test items.
 * These each return a newly created test item, backed by a TestCaseInfo object added to the TestCaseStore.
 * The caller is responsible for adding the newly returned test item to the appropriate parent.
 */
export class TestItemFactory {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly store: TestCaseStore

  /**
   * Create a root test item for the test explorer.
   * @param uri URI of the test item.
   */
  createRootTestItem(uri?: vscode.Uri): TestItem {
    const newTest = this.store.testController.createTestItem(
      'root',
      'Bazel Test Targets',
      uri
    )
    newTest.canResolveChildren = true
    this.store.testCaseMetadata.set(
      newTest,
      new TestCaseInfo(newTest, undefined, TestItemType.Root)
    )
    this.store.testController.items.replace([newTest])
    return newTest
  }

  /**
   * Creates a test item for a build target.
   * @param target BuildTarget corresponding to this test.
   * @param uri URI of the test item.
   * @returns The newly created test item.
   */
  createBuildTargetTestItem(target: BuildTarget, uri?: vscode.Uri): TestItem {
    const newTest = this.store.testController.createTestItem(
      target.id.uri,
      target.displayName ?? target.id.uri,
      uri
    )
    this.store.testCaseMetadata.set(
      newTest,
      new BuildTargetTestCaseInfo(newTest, target)
    )
    return newTest
  }
}
