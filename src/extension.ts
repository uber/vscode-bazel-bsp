import * as vscode from 'vscode'
import {NestFactory} from '@nestjs/core'
import {bootstrap} from './app.module'
import {BuildServerManager} from './server/server-manager'
import {BazelBSPBuildClient} from './test-explorer/client'
import {TestCaseStore} from './test-explorer/store'

export async function activate(context: vscode.ExtensionContext) {
  bootstrap(context)
}

// This method is called when your extension is deactivated
export function deactivate() {}
