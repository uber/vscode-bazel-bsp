import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'
import path from 'path'

import {TestCaseStore} from './store'
import {BazelBSPBuildClient} from './client'
import {
  EXTENSION_CONTEXT_TOKEN,
  PRIMARY_OUTPUT_CHANNEL_TOKEN,
} from '../custom-providers'
import {BuildServerManager, CANCEL_ERROR_CODE} from '../server/server-manager'
import * as bsp from '../bsp/bsp'
import {
  SourceFileTestCaseInfo,
  TestCaseInfo,
  TestItemType,
} from '../test-info/test-info'
import {getExtensionSetting, SettingName} from '../utils/settings'
import {Utils} from '../utils/utils'
import {TestItemFactory} from '../test-info/test-item-factory'
import {
  DocumentTestItem,
  LanguageToolManager,
  TestFileContents,
} from '../language-tools/manager'
import {SyncHintDecorationsManager} from './decorator'

@Injectable()
export class TestResolver implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly store: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient
  @Inject(BuildServerManager) private readonly buildServer: BuildServerManager
  @Inject(TestItemFactory) private readonly testItemFactory: TestItemFactory
  @Inject(LanguageToolManager)
  private readonly languageToolManager: LanguageToolManager
  @Inject(PRIMARY_OUTPUT_CHANNEL_TOKEN)
  private readonly outputChannel: vscode.OutputChannel
  @Inject(SyncHintDecorationsManager)
  private readonly syncHint: SyncHintDecorationsManager
  private repoRoot: string | null
  private openDocumentWatcherEnabled = false

  onModuleInit() {
    this.ctx.subscriptions.push(this)
    this.restorePriorTests()
      .catch(e => {
        this.outputChannel.appendLine(`Error restoring prior tests: ${e}`)
      })
      .finally(() => {
        this.registerHandlers()
      })
  }

  registerHandlers() {
    this.store.testController.resolveHandler = this.resolveHandler.bind(this)
    this.store.testController.refreshHandler = this.refreshHandler.bind(this)
  }

  private async restorePriorTests() {
    await this.resolveRoot()
    const cachedBuildTargetsResult = this.store.getCachedBuildTargetsResult()

    // Restore the root test item and build targets.
    let addedTargets = false
    if (cachedBuildTargetsResult) {
      this.outputChannel.appendLine('Restoring prior test cases')
      const root = this.store.testController.items.get('root')
      if (root) {
        try {
          this.outputChannel.appendLine('Restoring Source Files for Root')
          await this.processWorkspaceBuildTargetsResult(
            root,
            cachedBuildTargetsResult
          )
          root.canResolveChildren = false
          addedTargets = true
        } catch (e) {
          this.outputChannel.appendLine(
            `Error restoring source files for root: ${e}`
          )
        }
      }
    }

    // Restore cached source files for targets that have them.
    const promises: Promise<void>[] = []
    for (const [key, testItem] of this.store.targetIdentifiers.entries()) {
      let cachedSourceFiles: bsp.SourcesResult | undefined
      try {
        const target: bsp.BuildTargetIdentifier = JSON.parse(key)
        const sourceParams: bsp.SourcesParams = {
          targets: [target],
        }
        cachedSourceFiles = this.store.getCachedSourcesResult(sourceParams)
      } catch (e) {
        this.outputChannel.appendLine(
          `Invalid key '${key}' when restoring source files: ${e}`
        )
      }

      if (cachedSourceFiles) {
        this.outputChannel.appendLine(
          `Restoring source files for target: ${key}`
        )
        try {
          testItem.canResolveChildren = false
          const promise = this.processTargetSourcesResult(
            testItem,
            cachedSourceFiles
          )
          promises.push(promise)
        } catch (e) {
          this.outputChannel.appendLine(
            `Error restoring source files for target: ${key}`
          )
        }
      }
    }
    await Promise.all(promises)

    // Kick off discovery of test cases in other open files that may not have been discovered yet.
    if (addedTargets) await this.resolveOpenSourceFiles()
  }

  dispose() {}

  private async resolveHandler(
    parentTest: vscode.TestItem | undefined,
    testExplorerCancel?: vscode.CancellationToken
  ) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refreshing Test Cases',
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
          try {
            await this.buildServer.getConnection()
          } catch (e) {
            this.outputChannel.appendLine(
              'Test explorer disabled due to lack of available build server.'
            )
          }

          return
        }

        // Wait for initialization before attempting requests to the server.
        updateDescription(
          parentTest,
          'Loading: waiting for build server initialization'
        )
        await this.buildClient.getInitializeResult()
        this.store.clearTestItemWatchers(parentTest)

        updateDescription(parentTest)
        const parentMetadata = this.store.testCaseMetadata.get(parentTest)

        switch (parentMetadata?.type) {
          case TestItemType.Root:
            progress.report({
              message:
                'Fetching test targets from build server ([progress](command:bazelbsp.showServerOutput))',
            })
            await this.resolveTargets(parentTest, combinedToken)
            await this.resolveOpenSourceFiles()
            break
          case TestItemType.BazelTarget:
            progress.report({
              message: `Fetching source files in ${parentMetadata.target?.displayName}`,
            })
            await this.resolveSourceFiles(parentTest, combinedToken)
            break
          case TestItemType.SourceFile:
            progress.report({
              message: `Finding test cases in ${parentMetadata.testItem.label}`,
            })
            await this.resolveDocumentTestCases(parentTest, combinedToken)
        }
      }
    )
  }

  /**
   * Refresh test items in the tree by kicking off the resolve handler at each root.
   * @param token Cancellation token tied to the refresh button on the VS Code UI.
   */
  private async refreshHandler(token: vscode.CancellationToken) {
    this.store.clearCache()
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

    this.repoRoot = await Utils.getWorkspaceGitRoot()
    if (projectViewRelPath && this.repoRoot) {
      const projectViewAbsPath = path.resolve(this.repoRoot, projectViewRelPath)
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
    parentTest.error = undefined
    const conn = await this.buildServer.getConnection()

    updateDescription(parentTest, 'Loading: fetching available targets')
    let result: bsp.WorkspaceBuildTargetsResult
    try {
      result = await conn.sendRequest(
        bsp.WorkspaceBuildTargets.type,
        cancellationToken
      )
      this.store.cacheBuildTargetsResult(result)
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
    await this.processWorkspaceBuildTargetsResult(parentTest, result)
  }

  private async processWorkspaceBuildTargetsResult(
    parentTest: vscode.TestItem,
    result: bsp.WorkspaceBuildTargetsResult
  ) {
    updateDescription(parentTest, 'Loading: processing target results')

    // Save virtual TypeScript targets before clearing
    const virtualTargets: vscode.TestItem[] = []
    parentTest.children.forEach(child => {
      const metadata = this.store.testCaseMetadata.get(child)
      if (metadata?.target?.languageIds?.includes('typescript')) {
        virtualTargets.push(child)
      }
    })

    // Process the returned targets, create new test items, and store their metadata.
    const directories = new Map<string, vscode.TestItem>()
    const buildFileName = getExtensionSetting(SettingName.BUILD_FILE_NAME)
    parentTest.children.replace([])
    this.store.clearTargetIdentifiers()
    this.store.knownFiles.clear()

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
      this.store.setTargetIdentifier(target.id, newTest)
    })

    // Restore virtual TypeScript targets
    virtualTargets.forEach(target => {
      parentTest.children.add(target)
      const metadata = this.store.testCaseMetadata.get(target)
      if (metadata?.target?.id) {
        this.store.setTargetIdentifier(metadata.target.id, target)
      }
    })

    // If no test items were added, show the getting started message as a test message overlaid on the .bazelproject file.
    // This provides an opportunity for the user to make adjustments and re-sync.
    if (parentTest.children.size === 0) {
      // Dummy test run that overlays the getting started message on the .bazelproject file.
      const run = this.store.testController.createTestRun(
        new vscode.TestRunRequest()
      )
      run.errored(parentTest, new vscode.TestMessage(gettingStartedMessage))
      run.end()

      // Link in the test explorer tree to set up the project.
      const encodedFileUri = encodeURIComponent(JSON.stringify(parentTest.uri))
      const syncFailMessage = new vscode.MarkdownString(
        `No test targets found. [Setup your project](command:vscode.open?${encodedFileUri})`
      )
      syncFailMessage.isTrusted = true
      parentTest.error = syncFailMessage
    }

    // Replace all children with the newly returned test cases.
    this.condenseTestItems(parentTest)
    updateDescription(parentTest)
  }

  /**
   * Kick off resolution of test items for files that are currently open, and watch for newly opened files.
   * This allows test cases to appear without the user having to expand the target's test explorer node.
   */
  private async resolveOpenSourceFiles() {
    const autoExpandTarget = getExtensionSetting(SettingName.AUTO_EXPAND_TARGET)
    // When disabled, tests are discovered as the test explorer tree is expanded.
    if (!autoExpandTarget) return

    for (const doc of vscode.workspace.textDocuments) {
      // Discovery within currently open documents.
      await this.expandTargetsForDocument(doc)
    }

    if (this.openDocumentWatcherEnabled) return
    this.openDocumentWatcherEnabled = true
    this.ctx.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(async doc => {
        // Discovery within newly opened documents.
        await this.expandTargetsForDocument(doc)
      })
    )
  }

  /**
   * Finds the corresponding target for a given document, if a file's target is not yet known.
   * The target's test cases will then be resolved and available in test explorer.
   * @param doc for which to find the target.
   */
  private async expandTargetsForDocument(doc: vscode.TextDocument) {
    if (doc.uri.scheme !== 'file') return

    // Avoid checking files that are already known, or not test files.
    if (this.store.knownFiles.has(doc.uri.toString())) return
    const tools = this.languageToolManager.getLanguageToolsForFile(doc)
    const docInfo = await tools.getDocumentTestCases(
      doc.uri,
      this.repoRoot ?? ''
    )
    if (!docInfo.isTestFile) return

    this.store.knownFiles.add(doc.uri.toString())
    const conn = await this.buildServer.getConnection()
    const params: bsp.InverseSourcesParams = {
      textDocument: {
        uri: doc.uri.toString(),
      },
    }
    let result: bsp.InverseSourcesResult | undefined
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Getting target for ${path.basename(doc.uri.fsPath)}.`,
        cancellable: true,
      },
      async (progress, token) => {
        try {
          result = await conn.sendRequest(
            bsp.BuildTargetInverseSources.type,
            params,
            token
          )
        } catch (e) {
          result = undefined
        }
      }
    )

    if (!result) {
      this.outputChannel.appendLine(
        `Unable to determine target for ${doc.fileName}.`
      )
      return
    }

    for (const target of result.targets) {
      // Put this file under the first matching target, in the rare event that a test is part of multiple targets.
      const targetItem = this.store.getTargetIdentifier(target)
      if (targetItem) {
        await this.resolveHandler(targetItem)
        return
      }
    }

    if (doc.languageId === 'typescript' && docInfo.isTestFile) {
      await this.createVirtualTypeScriptTarget(doc, docInfo)
      return
    }

    this.syncHint.enable(doc.uri, this.repoRoot ?? '', docInfo)
  }

  private async createVirtualTypeScriptTarget(
    doc: vscode.TextDocument,
    docInfo: TestFileContents
  ) {
    this.outputChannel.appendLine(
      `Creating virtual TypeScript target for ${doc.fileName}`
    )

    const bazelTarget = await this.findBazelTestTarget(doc.uri)
    if (!bazelTarget) {
      this.outputChannel.appendLine(
        `No Bazel jest_test target found for ${doc.fileName}`
      )
      return
    }

    this.outputChannel.appendLine(`Found Bazel target: ${bazelTarget}`)

    const virtualTarget = this.createVirtualBuildTarget(bazelTarget, doc.uri)
    const root = this.store.testController.items.get('root')
    if (!root) {
      this.outputChannel.appendLine('Root test item not found')
      return
    }

    // Clear the "No test targets found" error if it was set
    if (root.error) {
      root.error = undefined
    }

    // Create test item using file name as the label
    const sourceItem: bsp.SourceItem = {
      uri: doc.uri.toString(),
      kind: bsp.SourceItemKind.File,
      generated: false,
    }

    const fileTestItem = this.testItemFactory.createSourceFileTestItem(
      virtualTarget,
      sourceItem
    )
    root.children.add(fileTestItem)
    this.store.setTargetIdentifier(virtualTarget.id, fileTestItem)
    this.store.knownFiles.add(doc.uri.toString())

    this.outputChannel.appendLine(
      `Created test file TestItem: ${fileTestItem.label}`
    )

    await this.populateTypeScriptTestCases(fileTestItem, virtualTarget, docInfo)

    this.outputChannel.appendLine(
      `Populated ${docInfo.testCases.length} test cases`
    )
  }

  private async populateTypeScriptTestCases(
    fileTestItem: vscode.TestItem,
    virtualTarget: bsp.BuildTarget,
    docInfo: TestFileContents
  ) {
    const newItems = new Map<DocumentTestItem, vscode.TestItem>()
    const directChildren: vscode.TestItem[] = []

    for (const testCase of docInfo.testCases) {
      const newTest = this.testItemFactory.createTestCaseTestItem(
        testCase,
        virtualTarget
      )
      newItems.set(testCase, newTest)

      if (testCase.parent) {
        newItems.get(testCase.parent)?.children.add(newTest)
      } else {
        directChildren.push(newTest)
      }
    }

    fileTestItem.children.replace(directChildren)

    const fileTestInfo = this.store.testCaseMetadata.get(
      fileTestItem
    ) as SourceFileTestCaseInfo
    if (fileTestInfo && docInfo.documentTest) {
      fileTestInfo.setDocumentTestItem(docInfo.documentTest)
    }
  }

  private createVirtualBuildTarget(
    targetLabel: string,
    fileUri: vscode.Uri
  ): bsp.BuildTarget {
    const packagePath = targetLabel.split(':')[0].replace('//', '')

    return {
      id: {uri: targetLabel},
      displayName: path.basename(fileUri.fsPath),
      baseDirectory: this.repoRoot
        ? path.join(this.repoRoot, packagePath)
        : undefined,
      tags: ['test'],
      languageIds: ['typescript'],
      dependencies: [],
      capabilities: {
        canCompile: false,
        canTest: true,
        canRun: true,
        canDebug: false,
      },
      dataKind: undefined,
      data: undefined,
    }
  }

  private async findBazelTestTarget(
    fileUri: vscode.Uri
  ): Promise<string | undefined> {
    if (!this.repoRoot) return undefined

    const relativePath = path.relative(this.repoRoot, fileUri.fsPath)
    const packagePath = path.dirname(relativePath)

    const bazelBinary = getExtensionSetting(SettingName.BAZEL_BINARY_PATH)
    if (!bazelBinary) {
      this.outputChannel.appendLine('Bazel binary path not configured')
      return undefined
    }
    try {
      const {exec} = await import('child_process')
      const {promisify} = await import('util')
      const execAsync = promisify(exec)

      const queryCmd = `${bazelBinary} query 'kind(jest_test, //${packagePath}:*)' --output=label`
      this.outputChannel.appendLine(`Running: ${queryCmd}`)

      const {stdout} = await execAsync(queryCmd, {
        cwd: this.repoRoot,
      })

      const targets = stdout
        .trim()
        .split('\n')
        .filter(t => t.length > 0)
      return targets[0]
    } catch (error) {
      this.outputChannel.appendLine(`Bazel query failed: ${error}`)
      return undefined
    }
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
    this.store.cacheSourcesResult(params, result)
    await this.processTargetSourcesResult(parentTest, result)
  }

  private async processTargetSourcesResult(
    parentTest: vscode.TestItem,
    result: bsp.SourcesResult,
    cancellationToken?: vscode.CancellationToken
  ) {
    const parentTarget = this.store.testCaseMetadata.get(parentTest)?.target
    if (!parentTarget) return

    const directories = new Map<string, vscode.TestItem>()
    parentTest.children.replace([])
    parentTest.canResolveChildren = false
    const allDocumentTestItems: vscode.TestItem[] = []
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
        this.store.knownFiles.add(source.uri)
        this.syncHint.disable(newTest.uri!)

        relevantParent.children.add(newTest)
        allDocumentTestItems.push(newTest)
      })
    })
    this.condenseTestItems(parentTest)

    // Kick off test case resolution within each of the target's documents.
    let counter = 1
    for (const doc of allDocumentTestItems) {
      updateDescription(
        parentTest,
        `Loading: analyzing test cases in file ${counter++} of ${
          allDocumentTestItems.length
        }`
      )
      await this.resolveDocumentTestCases(doc, cancellationToken)

      if (doc.uri) {
        // Assign a watcher to each source file's test item, to handle test case changes in the file.
        const watcher = vscode.workspace.createFileSystemWatcher(doc.uri.fsPath)
        watcher.onDidChange(e => {
          this.resolveHandler(doc)
        })
        this.store.updateTestItemWatcher(doc.id, watcher)
      }
    }
    updateDescription(parentTest)
  }

  private async resolveDocumentTestCases(
    parentTest: vscode.TestItem,
    cancellationToken?: vscode.CancellationToken
  ) {
    const parentTestInfo: SourceFileTestCaseInfo | undefined =
      this.store.testCaseMetadata.get(parentTest) as SourceFileTestCaseInfo
    if (!parentTestInfo?.target || parentTest.uri === undefined) return

    // Convert document contents into generic DocumentTestItem data.
    const testFileContents = await this.languageToolManager
      .getLanguageTools(parentTestInfo.target)
      .getDocumentTestCases(parentTest.uri, this.repoRoot ?? '')

    // If document analysis has determined that it is not to be considered a test file, hide it.
    if (!testFileContents.isTestFile) {
      // If removing this test item leaves the parent empty, clear the parent as well.
      const cleanupEmptyParent = (testItem?: vscode.TestItem) => {
        if (testItem?.children.size === 0) {
          testItem.parent?.children.delete(testItem.id)
          cleanupEmptyParent(testItem.parent)
        }
      }

      parentTest.parent?.children.delete(parentTest.id)
      cleanupEmptyParent(parentTest.parent)
    }

    // Convert the returned test cases into TestItems and add to the tree.
    const newItems = new Map<DocumentTestItem, vscode.TestItem>()
    const directChildren: vscode.TestItem[] = []
    for (const testCase of testFileContents.testCases ?? []) {
      const newTest = this.testItemFactory.createTestCaseTestItem(
        testCase,
        parentTestInfo.target
      )
      newItems.set(testCase, newTest)

      // Maintain the same parent-child relationship as the returned test case data.
      if (testCase.parent) newItems.get(testCase.parent)?.children.add(newTest)
      else directChildren.push(newTest)
    }
    parentTest.children.replace(directChildren)

    // Update the parent test with required information for full-file run.
    if (testFileContents.documentTest)
      parentTestInfo.setDocumentTestItem(testFileContents.documentTest)
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

const gettingStartedMessage = new vscode.MarkdownString(
  `To use the Test Explorer, please configure your project.

  Getting started tips:
  - Update this file with some paths that include test targets.
    - Use the directories key to specify by directory
    - Use the targets key to specify by Bazel target pattern
  - Ensure that the bazel_binary field in this file matches the path to your Bazel binary.
  - Re-sync at any time by clicking the $(extensions-refresh) refresh icon at the very top of the testing panel.

  Think something else went wrong? Check the output [here](command:bazelbsp.showServerOutput).
  `,
  true
)
gettingStartedMessage.isTrusted = true
