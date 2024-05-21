import * as vscode from 'vscode'
import {Module} from '@nestjs/common'
import {NestFactory} from '@nestjs/core'

import {BuildServerManager} from './server/server-manager'
import {BazelBSPBuildClient} from './test-explorer/client'
import {TestCaseStore} from './test-explorer/store'
import {TestRunner} from './test-runner/runner'
import {contextProviderFactory, outputChannelProvider} from './custom-providers'
import {TestResolver} from './test-explorer/resolver'
import {RunTrackerFactory} from './test-runner/run-factory'
import {ConnectionDetailsParser} from './server/connection-details'
import {BazelBSPInstaller} from './server/install'
import {TestItemFactory} from './test-info/test-item-factory'
import {CoverageTracker} from './coverage-utils/coverage-tracker'
import {LanguageToolManager} from './language-tools/manager'

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
      RunTrackerFactory,
      ConnectionDetailsParser,
      BazelBSPInstaller,
      TestItemFactory,
      CoverageTracker,
      LanguageToolManager,
    ],
  })
  class AppModule {}

  const app = await NestFactory.createApplicationContext(AppModule)

  context.subscriptions.push({
    dispose: async () => await app.close(),
  })
}
