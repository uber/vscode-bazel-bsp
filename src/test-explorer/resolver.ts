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

    // Process the returned targets, create new test items, and store their metadata.
    const directories = new Map<string, vscode.TestItem>()
    const buildFileName = getExtensionSetting(SettingName.BUILD_FILE_NAME)
    parentTest.children.replace([])
    result.targets.forEach(target => {
      if (!target.capabilities.canTest) return

      let relevantParent = parentTest
      if (target.baseDirectory) {
        const pathSegmentTestItems =
          this.testItemFactory.createPathSegmentTestItems(
            directories,
            target.baseDirectory
          )
        parentTest.children.add(pathSegmentTestItems.rootTestItem)
        relevantParent = pathSegmentTestItems.baseTestItem
      }

      const buildFileUri =
        target.baseDirectory && buildFileName
          ? vscode.Uri.parse(path.join(target.baseDirectory, buildFileName))
          : undefined
      // UI will group runs that have the same ID.
      const newTest = this.testItemFactory.createBuildTargetTestItem(
        target,
        buildFileUri
      )
      relevantParent.children.add(newTest)
    })

    // Replace all children with the newly returned test cases.
    this.condenseTestItems(parentTest)
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

    const directories = new Map<string, vscode.TestItem>()
    parentTest.children.replace([])
    result.items.forEach(target => {
      target.sources.forEach(source => {
        // Parent to which the source file's test item will be added.
        // If the source file is in a subdirectory, the parent will be updated based on the path.
        let relevantParent = parentTest

        // If the current source is not in the target's base directory, create path segments.
        if (
          path.resolve(path.dirname(source.uri)) !==
          path.resolve(parentTarget.baseDirectory ?? '')
        ) {
          const pathSegmentTestItems =
            this.testItemFactory.createPathSegmentTestItems(
              directories,
              path.dirname(source.uri),
              parentTarget
            )
          parentTest.children.add(pathSegmentTestItems.rootTestItem)
          relevantParent = pathSegmentTestItems.baseTestItem
        }

        const newTest = this.testItemFactory.createSourceFileTestItem(
          parentTarget,
          source
        )
        relevantParent.children.add(newTest)
      })
    })
    this.condenseTestItems(parentTest)
  }

  /**
   * Condense test items by removing unnecessary nesting.
   * All children below the parentTest containing only 1 child will be recursively condensed.
   * Applies only until the type of the parentTest is different from the type of the child.
   * @param parentTest Test below which to condense test items.
   */
  private condenseTestItems(parentTest: vscode.TestItem) {
    // Advance through any single-child test items of the same type.
    const getNextItem = (currentItem: vscode.TestItem): vscode.TestItem => {
      let shouldContinue = true
      while (currentItem.children.size === 1 && shouldContinue) {
        // TestItemCollection supports only forEach iteration.
        currentItem.children.forEach(childItem => {
          if (
            this.store.testCaseMetadata.get(currentItem)?.type !==
            this.store.testCaseMetadata.get(childItem)?.type
          ) {
            shouldContinue = false
            return
          }
          currentItem = childItem
        })
      }
      return currentItem
    }

    // Recursively filter the current item and its children, and update their label relative to the parent.
    const condense = (item: vscode.TestItem): vscode.TestItem => {
      let currentParent = getNextItem(item)

      currentParent.children.forEach(child => {
        const filteredChild = condense(child)
        this.store.testCaseMetadata
          .get(filteredChild)
          ?.setDisplayName(this.store.testCaseMetadata.get(currentParent))
        if (filteredChild !== child) {
          currentParent.children.delete(child.id)
          currentParent.children.add(filteredChild)
        }
      })
      return currentParent
    }
    return condense(parentTest)
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
