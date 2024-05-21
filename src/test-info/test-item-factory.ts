import * as vscode from 'vscode'
import {Inject} from '@nestjs/common'
import {TestItem} from 'vscode'
import path from 'path'

import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {TestCaseStore} from '../test-explorer/store'
import {
  BuildTargetTestCaseInfo,
  SourceDirTestCaseInfo,
  SourceFileTestCaseInfo,
  TargetDirTestCaseInfo,
  TestCaseInfo,
  TestItemTestCaseInfo,
  TestItemType,
} from './test-info'
import {BuildTarget, SourceItem} from '../bsp/bsp'
import {DocumentTestItem} from '../language-tools/manager'

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
    const testCaseInfo = new BuildTargetTestCaseInfo(newTest, target)
    this.store.testCaseMetadata.set(newTest, testCaseInfo)

    newTest.canResolveChildren = true
    testCaseInfo.setDisplayName()
    return newTest
  }

  /**
   * Creates a test item for a source file.
   * @param target BuildTarget corresponding to this test.
   * @param sourceItem SourceItem corresponding to this test.
   * @returns The newly created test item.
   */
  createSourceFileTestItem(
    target: BuildTarget,
    sourceItem: SourceItem
  ): TestItem {
    const label = target?.baseDirectory
      ? path.relative(target.baseDirectory, sourceItem.uri)
      : sourceItem.uri
    const newTest = this.store.testController.createTestItem(
      sourceItem.uri,
      label,
      vscode.Uri.parse(sourceItem.uri)
    )
    this.store.testCaseMetadata.set(
      newTest,
      new SourceFileTestCaseInfo(newTest, target)
    )

    return newTest
  }

  /**
   * Creates test items representing segments of a path.
   * @param directories Mapping of directories to test items, specific to a given refresh.
   * @param dir Directory path (relative or absolute) which will be broken up into separate test items.
   * @param target (optional) Target that applies to these path segments.
   * @returns Root and base test items for the path segments.
   */
  createPathSegmentTestItems(
    directories: Map<string, vscode.TestItem>,
    dir: string,
    target?: BuildTarget
  ): {
    rootTestItem: vscode.TestItem
    baseTestItem: vscode.TestItem
  } {
    // Lowest child among the segments.
    let baseItem: undefined | vscode.TestItem
    // Prior visited item in the iteration.
    let priorItem: undefined | vscode.TestItem
    // Current item in the iteration.
    let currentItem: undefined | vscode.TestItem

    let currentPath = vscode.Uri.parse(dir).fsPath
    let shouldContinue = true
    do {
      // Get or create test item for this directory.
      currentItem = directories.get(currentPath)
      if (currentItem === undefined) {
        if (target) {
          // When a target is provided, create this as a source directory, so it is runnable on its own.
          currentItem = this.createSourceDirTestItem(
            target,
            currentPath,
            vscode.Uri.parse(currentPath)
          )
        } else {
          // When no target is provided, create it as a target directory, allowing targets beneath it to run.
          currentItem = this.createTargetDirTestItem(
            currentPath,
            vscode.Uri.parse(currentPath)
          )
        }
        directories.set(currentPath, currentItem)
      }

      if (priorItem) currentItem.children.add(priorItem)
      if (!baseItem) baseItem = currentItem

      // Move up the directory path
      priorItem = currentItem
      if (currentPath === path.dirname(currentPath)) {
        shouldContinue = false
      } else {
        currentPath = path.dirname(currentPath)
      }
    } while (shouldContinue)

    return {
      rootTestItem: currentItem,
      baseTestItem: baseItem,
    }
  }

  /**
   * Create a new item representing an individual test case within a source file.
   * @param details DocumentTestItem containing test case details to create the item.
   * @param target Target with which this test item should be associated.
   * @returns New TestItem with corresponding metadata representing an individual test case.
   */
  createTestCaseTestItem(
    details: DocumentTestItem,
    target: BuildTarget
  ): TestItem {
    const id = `{testcase}:${target.id.uri}:${details.uri.path}${
      details.parent ? `:${details.parent.name}` : ''
    }:${details.name}`
    const newTest = this.store.testController.createTestItem(
      id,
      details.name,
      details.uri
    )
    newTest.range = details.range
    this.store.testCaseMetadata.set(
      newTest,
      new TestItemTestCaseInfo(newTest, target, details)
    )
    return newTest
  }

  /**
   * Creates a test item for a build target's directory.
   * @param dir path to this directory.
   * @param uri URI of the test item.
   * @returns The newly created test item.
   */
  private createTargetDirTestItem(dir: string, uri: vscode.Uri): TestItem {
    const id = `{targetdir}:${uri.path}`
    const newTest = this.store.testController.createTestItem(id, dir, uri)
    this.store.testCaseMetadata.set(
      newTest,
      new TargetDirTestCaseInfo(newTest, dir)
    )
    return newTest
  }

  /**
   * Creates a test item for a source directory within a build target.
   * @param dir path to this directory
   * @param target BuildTarget corresponding to this test.
   * @param uri URI of the test item.
   * @returns The newly created test item.
   */
  private createSourceDirTestItem(
    target: BuildTarget,
    dir: string,
    uri: vscode.Uri
  ): TestItem {
    const id = `{sourcedir}:${target.id.uri}:${uri.path}`
    const relPath = path.relative(
      vscode.Uri.parse(target.baseDirectory ?? '').fsPath,
      dir
    )
    const newTest = this.store.testController.createTestItem(id, relPath, uri)
    this.store.testCaseMetadata.set(
      newTest,
      new SourceDirTestCaseInfo(newTest, target, relPath)
    )
    return newTest
  }
}
