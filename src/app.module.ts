import * as vscode from 'vscode'
import {Module} from '@nestjs/common'
import {NestFactory} from '@nestjs/core'

import {BuildServerManager} from './rpc/server-manager'
import {BazelBSPBuildClient} from './test-explorer/client'
import {TestCaseStore} from './test-explorer/store'
import {TestRunner} from './test-explorer/runner'
import {contextProviderFactory, outputChannelProvider} from './custom-providers'
import {TestResolver} from './test-explorer/resolver'

export async function bootstrap(context: vscode.ExtensionContext) {
  // Define the application's dependencies.  This is done at runtime to allow for dynamically created providers such as extension context.
  // NestJS also supports dynamic modules, but they currently have compatbility issues with VS Code's runtime environment.
  // TODO(IDE-984): Invesigate why the NestConstainer.addModule method causes Node to report dependence on "extensionRuntime" experimental API.
  @Module({
    providers: [
      contextProviderFactory(context),
      outputChannelProvider,
      BuildServerManager,
      BazelBSPBuildClient,
      TestResolver,
      TestRunner,
      TestCaseStore,
    ],
  })
  class AppModule {}

  const app = await NestFactory.createApplicationContext(AppModule)

  context.subscriptions.push({
    dispose: async () => await app.close(),
  })
}
