import * as vscode from 'vscode'
import * as path from 'path'
import {promisify} from 'util'
import {exec} from 'child_process'
import * as fs from 'fs/promises'

const execAsync = promisify(exec)

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

  static async getGitRootFromPath(fsPath: string): Promise<string | null> {
    const {stdout} = await execAsync('git rev-parse --show-toplevel', {
      cwd: fsPath,
    })
    return stdout.trim()
  }

  static async getWorkspaceGitRoot(): Promise<string | null> {
    const workspaceRoot = Utils.getWorkspaceRoot()
    if (!workspaceRoot) {
      return null
    }
    return Utils.getGitRootFromPath(workspaceRoot.fsPath)
  }

  // Use wrapped file i/o operations for use in stubbing.
  static async readdir(path: string): Promise<string[]> {
    return fs.readdir(path)
  }

  static async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf8')
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
