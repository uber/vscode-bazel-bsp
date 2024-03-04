import * as vscode from 'vscode'

export async function activate(context: vscode.ExtensionContext) {
  let channel = vscode.window.createOutputChannel('Bazel BSP')
  channel.appendLine('Hello World')
}

// This method is called when your extension is deactivated
export function deactivate() {}
