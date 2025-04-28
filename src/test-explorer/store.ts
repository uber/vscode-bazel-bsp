import * as vscode from 'vscode'
import * as bsp from '../bsp/bsp'
import {Inject, OnModuleInit} from '@nestjs/common'

import {
  EXTENSION_CONTEXT_TOKEN,
  TEST_CONTROLLER_TOKEN,
} from '../custom-providers'
import {TestCaseInfo} from '../test-info/test-info'
import {BuildTargetIdentifier} from 'src/bsp/bsp'

const CONTEXT_KEY_TARGETS_RESULT = 'testExplorerBuildTargetsResult'
const CONTEXT_KEY_SOURCES_RESULT = 'testExplorerSourcesResult'

export class TestCaseStore implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TEST_CONTROLLER_TOKEN) readonly testController: vscode.TestController

  testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>

  // Watcher to update a test item's children.  Key corresponds to the test item ID.
  testItemWatchers: Map<string, vscode.FileSystemWatcher>
  knownFiles: Set<string>
  targetIdentifiers: Map<string, vscode.TestItem>

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

  cacheBuildTargetsResult(result: bsp.WorkspaceBuildTargetsResult) {
    this.ctx.workspaceState.update(CONTEXT_KEY_TARGETS_RESULT, result)
  }

  getCachedBuildTargetsResult(): bsp.WorkspaceBuildTargetsResult | undefined {
    return this.ctx.workspaceState.get<bsp.WorkspaceBuildTargetsResult>(
      CONTEXT_KEY_TARGETS_RESULT
    )
  }

  cacheSourcesResult(params: bsp.SourcesParams, result: bsp.SourcesResult) {
    const key = JSON.stringify(params)
    const allResults =
      this.ctx.workspaceState.get<Record<string, bsp.SourcesResult>>(
        CONTEXT_KEY_SOURCES_RESULT
      ) || {}

    // Add or update the result for this params key
    allResults[key] = result
    this.ctx.workspaceState.update(CONTEXT_KEY_SOURCES_RESULT, allResults)
  }

  getCachedSourcesResult(
    params: bsp.SourcesParams
  ): bsp.SourcesResult | undefined {
    const key = JSON.stringify(params)
    const allResults = this.ctx.workspaceState.get<
      Record<string, bsp.SourcesResult>
    >(CONTEXT_KEY_SOURCES_RESULT)
    return allResults?.[key]
  }

  clearCache() {
    this.ctx.workspaceState.update(CONTEXT_KEY_TARGETS_RESULT, undefined)
    this.ctx.workspaceState.update(CONTEXT_KEY_SOURCES_RESULT, undefined)
  }
}
