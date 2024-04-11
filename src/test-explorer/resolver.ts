import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'

import {TestCaseStore} from './store'
import {BazelBSPBuildClient} from './client'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {BuildServerManager, CANCEL_ERROR_CODE} from '../server/server-manager'
import * as bsp from '../bsp/bsp'
import {TestCaseInfo, TestItemType} from './test-info'

@Injectable()
export class TestResolver implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly store: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager

  onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.store.testController.resolveHandler = this.resolveHandler.bind(this)
    this.store.testController.refreshHandler = this.refreshHandler.bind(this)
  }

  dispose() {}

  private async resolveHandler(
    parentTest: vscode.TestItem | undefined,
    cancellationToken?: vscode.CancellationToken
  ) {
    if (parentTest === undefined) {
      this.resolveRoot()
      return
    }

    // Wait for initialization before attempting requests to the server.
    updateDescription(
      parentTest,
      'Loading: waiting for build server initialization'
    )
    await this.buildClient.getInitializeResult()
    updateDescription(parentTest)
    const parentMetadata = this.store.testCaseMetadata.get(parentTest)

    switch (parentMetadata?.type) {
      case TestItemType.Root:
        await this.resolveTargets(parentTest, cancellationToken)
        break
    }
  }

  /**
   * Refresh test items in the tree by kicking off the resolve handler at each root.
   * @param token Cancellation token tied to the refresh button on the VS Code UI.
   */
  private async refreshHandler(token: vscode.CancellationToken) {
    const promises: Promise<void>[] = []
    this.store.testController.items.forEach(async item => {
      promises.push(this.resolveHandler(item, token))
    })
    await Promise.all(promises)
  }

  /**
   * Sets up a single root to hold all other test cases provided by this extension.
   */
  private resolveRoot() {
    if (this.store.testController.items.get('root')) {
      // Single root already exists.
      return
    }

    const newTest = this.store.testController.createTestItem(
      'root',
      'Bazel Test Targets'
    )
    newTest.canResolveChildren = true
    this.store.testCaseMetadata.set(
      newTest,
      new TestCaseInfo(newTest, TestItemType.Root)
    )
    this.store.testController.items.add(newTest)
  }

  /**
   * Gets available workspace targets from the build server, based on user's .bazelproject
   * If a target can be tested, it is added to the tree. Test items that no longer exist will be cleaned up.
   * @param parentTest TestItem to which newly found test items will be added (typically the root).
   */
  private async resolveTargets(
    parentTest: vscode.TestItem,
    cancellationToken?: vscode.CancellationToken
  ) {
    // Request available targets from the build server.
    updateDescription(
      parentTest,
      'Loading: waiting for build server connection'
    )
    const conn = await this.buildServer.getConnection()

    updateDescription(parentTest, 'Loading: fetching available targets')
    let result: bsp.WorkspaceBuildTargetsResult
    try {
      result = await conn.sendRequest(
        bsp.WorkspaceBuildTargets.type,
        cancellationToken
      )
    } catch (e) {
      if (e.code === CANCEL_ERROR_CODE) {
        updateDescription(
          parentTest,
          'Refresh Canceled: Contents may be outdated.'
        )
        return
      }
      updateDescription(parentTest, 'Error: unable to fetch targets')
      throw e
    }

    updateDescription(parentTest, 'Loading: processing target results')

    // TODO(IDE-960): Add optional nesting by Bazel package. Current view provides a flat view of all targets.

    // Process the returned targets, create new test items, and store their metadata.
    const updatedTestCases: vscode.TestItem[] = []
    result.targets.forEach(target => {
      if (!target.capabilities.canTest) return

      // UI will group runs that have the same ID.
      const newTest = this.store.testController.createTestItem(
        target.id.uri,
        target.displayName ?? target.id.uri,
        target.baseDirectory
          ? vscode.Uri.parse(target.baseDirectory)
          : undefined
      )
      this.store.testCaseMetadata.set(
        newTest,
        new TestCaseInfo(
          newTest,
          TestItemType.BazelTarget,
          target.languageIds,
          target.id
        )
      )
      updatedTestCases.push(newTest)
    })

    // Clean up metadata from the prior versions of the test cases.
    parentTest.children.forEach(item => {
      this.store.testCaseMetadata.delete(item)
    })

    // Replace all children with the newly returned test cases.
    parentTest.children.replace(updatedTestCases)
    updateDescription(parentTest)
  }
}

/**
 * Update or clear a test case description on the UI. Can be use to report activity and progress.
 * @param testItem Test item to be updated.
 * @param description New description. If omitted, will clear existing description.
 */
function updateDescription(testItem: vscode.TestItem, description?: string) {
  if (description) testItem.description = description
  else testItem.description = ''
}
