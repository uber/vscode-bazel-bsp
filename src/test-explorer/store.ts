import * as vscode from 'vscode'
import {Inject, OnModuleInit} from '@nestjs/common'

import {
  EXTENSION_CONTEXT_TOKEN,
  TEST_CONTROLLER_TOKEN,
} from '../custom-providers'
import {TestCaseInfo} from '../test-info/test-info'
import {BuildTargetIdentifier} from 'src/bsp/bsp'

export class TestCaseStore implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TEST_CONTROLLER_TOKEN) readonly testController: vscode.TestController

  testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>

  // Watcher to update a test item's children.  Key corresponds to the test item ID.
  testItemWatchers: Map<string, vscode.FileSystemWatcher>
  knownFiles: Set<string>
  private targetIdentifiers: Map<string, vscode.TestItem>

  constructor() {
    this.testCaseMetadata = new WeakMap<vscode.TestItem, TestCaseInfo>()
    this.testItemWatchers = new Map()
    this.targetIdentifiers = new Map<string, vscode.TestItem>()
    this.knownFiles = new Set<string>()
  }

  onModuleInit() {
    this.ctx.subscriptions.push(this)
  }

  dispose() {
    this.testController.dispose()
    for (const watcher of this.testItemWatchers.values()) {
      watcher.dispose()
    }
  }

  /**
   * Stores a single watcher for the given TestItem.id value, disposing of any existing watcher if present.
   * @param id TestItem ID for which to store the watcher.
   * @param watcher FileSystemWatcher which has already been created, or undefined to clear the watcher.
   */
  updateTestItemWatcher(id: string, watcher?: vscode.FileSystemWatcher) {
    const oldWatcher = this.testItemWatchers.get(id)
    if (oldWatcher) {
      oldWatcher.dispose()
    }
    if (watcher) this.testItemWatchers.set(id, watcher)
    else this.testItemWatchers.delete(id)
  }

  /**
   * Clear all existing watchers for the given TestItem and its children.
   * @param parentTest Parent test below which all watchers will be cleared, inclusive of the parent.
   */
  clearTestItemWatchers(parentTest: vscode.TestItem) {
    const clear = (test: vscode.TestItem) => {
      test.children.forEach(item => {
        this.updateTestItemWatcher(item.id)
        clear(item)
      })
    }
    clear(parentTest)
  }

  setTargetIdentifier(
    targetIdentifier: BuildTargetIdentifier,
    item: vscode.TestItem
  ) {
    const key = JSON.stringify(targetIdentifier)
    this.targetIdentifiers.set(key, item)
  }

  getTargetIdentifier(
    targetIdentifier: BuildTargetIdentifier
  ): vscode.TestItem | undefined {
    const key = JSON.stringify(targetIdentifier)
    return this.targetIdentifiers.get(key)
  }

  clearTargetIdentifiers() {
    this.targetIdentifiers.clear()
  }
}
