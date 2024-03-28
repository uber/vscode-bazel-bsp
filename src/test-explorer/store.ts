import * as vscode from 'vscode'
import {Inject, OnModuleInit} from '@nestjs/common'

import {EXTENSION_CONTEXT_TOKEN} from '../custom-providers'
import {TestCaseInfo} from './test-info'

export class TestCaseStore implements OnModuleInit, vscode.Disposable {
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext

  testController: vscode.TestController
  testCaseMetadata: WeakMap<vscode.TestItem, TestCaseInfo>

  constructor() {
    this.testController = vscode.tests.createTestController(
      'bazelBSP',
      'Bazel BSP Tests'
    )
    this.testCaseMetadata = new WeakMap<vscode.TestItem, TestCaseInfo>()
  }

  onModuleInit() {
    this.ctx.subscriptions.push(this)
  }

  dispose() {
    this.testController.dispose()
  }
}
