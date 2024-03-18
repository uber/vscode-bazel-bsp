import * as vscode from 'vscode'
import * as path from 'path'

export class Utils {
  static getWorkspaceRoot(): vscode.Uri | null {
    if (
      vscode.workspace.workspaceFolders === undefined ||
      vscode.workspace.workspaceFolders?.length == 0
    ) {
      return null
    }

    if (
      !vscode.workspace.workspaceFile ||
      vscode.workspace.workspaceFile?.scheme === 'untitled'
    ) {
      return vscode.workspace.workspaceFolders[0].uri
    }
    return vscode.Uri.parse(
      path.dirname(vscode.workspace.workspaceFile.toString())
    )
  }
}

export class Deferred<T> {
  public promise: Promise<T>
  public resolve!: (value: T | PromiseLike<T>) => void
  public reject!: (reason?: any) => void

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
  }
}
