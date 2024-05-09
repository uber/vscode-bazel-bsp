import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'
import path from 'path'

import {TestCaseStore} from './store'
import {BazelBSPBuildClient} from './client'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {BuildServerManager, CANCEL_ERROR_CODE} from '../server/server-manager'
import * as bsp from '../bsp/bsp'
import {TestCaseInfo, TestItemType} from '../test-info/test-info'
import {getExtensionSetting, SettingName} from '../utils/settings'
import {Utils} from '../utils/utils'
import {TestItemFactory} from '../test-info/test-item-factory'

@Injectable()
export class TestResolver implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly store: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager
  @Inject(TestItemFactory) private readonly testItemFactory: TestItemFactory

  onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.store.testController.resolveHandler = this.resolveHandler.bind(this)
    this.store.testController.refreshHandler = this.refreshHandler.bind(this)
  }

  dispose() {}

  private async resolveHandler(
    parentTest: vscode.TestItem | undefined,
    testExplorerCancel?: vscode.CancellationToken
  ) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Syncing Bazel Test Targets',
        cancellable: true,
      },
      async (
        progress: vscode.Progress<{
          message?: string | undefined
          increment?: number | undefined
        }>,
        notificationCancel: vscode.CancellationToken
      ) => {
        progress.report({
          increment: -1,
          message:
            'Click [here](command:bazelbsp.showServerOutput) to check progress.',
        })
        const combinedToken = combineCancelTokens(
          testExplorerCancel,
          notificationCancel
        )
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
            await this.resolveTargets(parentTest, combinedToken)
            break
          case TestItemType.BazelTarget:
            await this.resolveSourceFiles(parentTest, combinedToken)
            break
        }
      }
    )
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
   * Selecting the root's file icon will navigate to the current project view file.
   */
  private async resolveRoot() {
    let projectViewUri: vscode.Uri | undefined = undefined
    const projectViewRelPath = getExtensionSetting(
      SettingName.BAZEL_PROJECT_FILE_PATH
    )

    const repoRoot = await Utils.getWorkspaceGitRoot()
    if (projectViewRelPath && repoRoot) {
      const projectViewAbsPath = path.resolve(repoRoot, projectViewRelPath)
      projectViewUri = vscode.Uri.parse(projectViewAbsPath)
    }
    this.testItemFactory.createRootTestItem(projectViewUri)
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
    const buildFileName = getExtensionSetting(SettingName.BUILD_FILE_NAME)
    result.targets.forEach(target => {
      if (!target.capabilities.canTest) return

      const buildFileUri =
        target.baseDirectory && buildFileName
          ? vscode.Uri.parse(path.join(target.baseDirectory, buildFileName))
          : undefined
      // UI will group runs that have the same ID.
      const newTest = this.testItemFactory.createBuildTargetTestItem(
        target,
        buildFileUri
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

  /**
   * Request source items for a target and populate within the tree.
   * @param parentTest TestItem to which newly found test items will be added.
   * @param cancellationToken Cancellation token to stop the request.
   */
  private async resolveSourceFiles(
    parentTest: vscode.TestItem,
    cancellationToken?: vscode.CancellationToken
  ) {
    const conn = await this.buildServer.getConnection()

    const parentMetadata: TestCaseInfo | undefined =
      this.store.testCaseMetadata.get(parentTest)
    if (!parentMetadata?.target) return

    const parentTarget = parentMetadata.target
    const params: bsp.SourcesParams = {
      targets: [parentTarget.id],
    }
    const result = await conn.sendRequest(
      bsp.BuildTargetSources.type,
      params,
      cancellationToken
    )

    const updatedTestCases: vscode.TestItem[] = []
    result.items.forEach(target => {
      target.sources.forEach(source => {
        const newTest = this.testItemFactory.createSourceFileTestItem(
          parentTarget,
          source
        )
        updatedTestCases.push(newTest)
      })
    })
    parentTest.children.replace(updatedTestCases)
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

function combineCancelTokens(
  token1: vscode.CancellationToken | undefined,
  token2: vscode.CancellationToken | undefined
): vscode.CancellationToken {
  const combinedSource = new vscode.CancellationTokenSource()
  token1?.onCancellationRequested(() => combinedSource.cancel())
  token2?.onCancellationRequested(() => combinedSource.cancel())
  return combinedSource.token
}
