import * as vscode from 'vscode'
import {Provider} from '@nestjs/common'

// Create a custom provider that injects the current extension context.
export const EXTENSION_CONTEXT_TOKEN = Symbol('ExtensionContext')
export const contextProviderFactory = (
  context: vscode.ExtensionContext
): Provider => {
  return {
    provide: EXTENSION_CONTEXT_TOKEN,
    useValue: context,
  }
}

// Test controller naming is globally unique. Ensure that only 1 can be created.
export const TEST_CONTROLLER_TOKEN = Symbol('TestController')
export const testControllerProvider = {
  provide: TEST_CONTROLLER_TOKEN,
  useValue: vscode.tests.createTestController('bazelBSP', 'Bazel BSP Tests'),
}

// This custom provider creates a single primary output channel.
// Created once at extension launch and provided anywhere this symbol is injected.
const outputChannel = vscode.window.createOutputChannel(
  'Bazel BSP (extension)',
  {log: true}
)
export const PRIMARY_OUTPUT_CHANNEL_TOKEN = Symbol('OutputChannel')
export const outputChannelProvider: Provider = {
  provide: PRIMARY_OUTPUT_CHANNEL_TOKEN,
  useValue: outputChannel,
}
