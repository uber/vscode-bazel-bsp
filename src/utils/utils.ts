import * as vscode from 'vscode'
import * as path from 'path'
import {promisify} from 'util'
import {exec} from 'child_process'
import * as fs from 'fs/promises'

const execAsync = promisify(exec)

// Escape codes, compiled from https://invisible-island.net/xterm/ctlseqs/ctlseqs.html#h3-Functions-using-CSI-_-ordered-by-the-final-character_s_
// Plus additional markers for custom `\x1b]...\x07` instructions.
// Borrowed from VS Code base (see: https://github.com/Microsoft/vscode/blob/main/src/vs/base/common/strings.ts)
const CSI_SEQUENCE =
  // eslint-disable-next-line no-control-regex
  /(:?(:?\x1b\[|\x9B)[=?>!]?[\d;:]*["$#'* ]?[a-zA-Z@^`{}|~])|(:?\x1b\].*?\x07)/g

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

  /**
   * Strips ANSI escape sequences from a string.
   * Borrowed from VS Code base (see: https://github.com/Microsoft/vscode/blob/main/src/vs/base/common/strings.ts)
   * @param str The string to strip the ANSI escape sequences from.
   *
   * @example
   * removeAnsiEscapeCodes('\u001b[31mHello, World!\u001b[0m');
   * // 'Hello, World!'
   */
  static removeAnsiEscapeCodes(str: string): string {
    if (str) {
      str = str.replace(CSI_SEQUENCE, '')
    }

    return str
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
