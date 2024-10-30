import * as vscode from 'vscode'
import {Inject, Injectable, OnModuleInit} from '@nestjs/common'
import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {TestCaseStore} from './store'
import {LanguageToolManager, TestFileContents} from '../language-tools/manager'

/**
 * This will allow dummy run arrows to be applied to a document, to provide indication of out of scope files.
 * The resolver can use this class to enable or disable these decorators in a given file.
 */
@Injectable()
export class SyncHintDecorationsManager implements OnModuleInit {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext
  @Inject(TestCaseStore) private readonly store: TestCaseStore
  @Inject(LanguageToolManager)
  private readonly languageToolManager: LanguageToolManager

  private activeFiles = new Map<string, vscode.Disposable>()
  private hoverMessage: vscode.MarkdownString
  private decorationType: vscode.TextEditorDecorationType

  onModuleInit() {
    this.ctx.subscriptions.push(
      // Access to the Project View file for use in the markdown command on hover.
      vscode.commands.registerCommand('bazelbsp.openProjectView', async () => {
        const uri = this.store.testController.items.get('root')?.uri
        if (uri) {
          const document = await vscode.workspace.openTextDocument(uri)
          await vscode.window.showTextDocument(document)
        }
      })
    )

    // Set up the decorator type and hover message.
    this.decorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: vscode.Uri.file(
        this.ctx.asAbsolutePath('resources/gutter.svg')
      ),
      isWholeLine: true,
      gutterIconSize: 'contain',
    })
    this.hoverMessage = new vscode.MarkdownString(
      '**Test Explorer**\n\nTests in this file are not yet synced.\n\n- [Adjust Project Scope](command:bazelbsp.openProjectView)\n\n- [Sync Now](command:testing.refreshTests)\n\n'
    )
    this.hoverMessage.isTrusted = true
  }

  /**
   * Enable decorators for a given file.
   * @param uri file on which to enable sync hint decorators.
   * @param repoRoot portion of the path representing this file's repo root.
   * @param docInfo existing processed test file contents for initial decorator positions.
   */
  async enable(uri: vscode.Uri, repoRoot: string, docInfo: TestFileContents) {
    const editor = vscode.window.visibleTextEditors.find(
      editor => editor.document.uri.toString() === uri.toString()
    )
    if (editor) this.setDecorationRanges(editor, docInfo)

    this.ensureWatcher(uri, repoRoot)
  }

  /**
   * Stop applying decorators for a given file, and clear if visible.
   * @param uri file on which decorators will be removed.
   */
  async disable(uri: vscode.Uri) {
    const watcher = this.activeFiles.get(uri.fsPath)
    if (watcher) {
      watcher.dispose()
      this.activeFiles.delete(uri.fsPath)

      const editor = vscode.window.visibleTextEditors.find(
        editor => editor.document.uri.toString() === uri.toString()
      )
      if (editor) this.setDecorationRanges(editor, null)
    }
  }

  /**
   * Determine current test case positions then apply the decorator.
   * @param editor text document to be updated.
   * @param repoRoot repo root to be used when getting
   */
  private async refreshDecoratorPositions(
    editor: vscode.TextEditor,
    repoRoot: string
  ) {
    const testFileContents = await this.languageToolManager
      .getLanguageToolsForFile(editor.document)
      .getDocumentTestCases(editor.document.uri, repoRoot)
    this.setDecorationRanges(editor, testFileContents)
  }

  /**
   * Adds a watcher for this file, reapplying the decorators each file the file is shown.
   * @param uri text document to be updated.
   * @param repoRoot portion of the path representing this file's repo root.
   */
  private ensureWatcher(uri: vscode.Uri, repoRoot: string) {
    const existing = this.activeFiles.get(uri.fsPath)
    if (existing) {
      existing.dispose()
    }

    const watcher = vscode.window.onDidChangeActiveTextEditor(async editor => {
      if (editor?.document.uri === uri) {
        await this.refreshDecoratorPositions(editor, repoRoot)
      }
    })

    this.activeFiles.set(uri.fsPath, watcher)
  }

  /**
   * Apply decorators to the given editor based on the provided TestFileContents.
   * @param editor editor to be updated.
   * @param docInfo processed test file information indication expected positions for documents. null to clear current contents.
   */
  private setDecorationRanges(
    editor: vscode.TextEditor,
    docInfo: TestFileContents | null
  ) {
    let ranges: vscode.Range[] = []
    if (docInfo) {
      ranges = docInfo.testCases.map(test => test.range)
    }

    const decorations: vscode.DecorationOptions[] = []
    for (const range of ranges) {
      decorations.push({
        range: new vscode.Range(range.start, range.start), // first line of the test only
        hoverMessage: this.hoverMessage,
      })
    }
    editor.setDecorations(this.decorationType, decorations)
  }
}
