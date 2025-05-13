import {randomUUID} from 'crypto'
import {CancellationToken, TestRunRequest} from 'vscode'
import {Inject, Injectable} from '@nestjs/common'

import {TestCaseStore} from '../test-explorer/store'
import {TestRunTracker} from './run-tracker'
import {BazelBSPBuildClient} from '../test-explorer/client'
import {CoverageTracker} from '../coverage-utils/coverage-tracker'
import {LanguageToolManager} from '../language-tools/manager'
import {detectIdeClient} from '../utils/utils'

@Injectable()
export class RunTrackerFactory {
  @Inject(TestCaseStore) private readonly testCaseStore: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient
  @Inject(CoverageTracker) private readonly coverageTracker: CoverageTracker
  @Inject(LanguageToolManager)
  private readonly languageToolManager: LanguageToolManager

  /**
   * Creates a new test run tracker, and register it with the build client.
   * @param request The test run request which will be used to populate a TestRunTracker.
   * @returns TestRunTracker populated for this run.
   */
  public newRun(
    request: TestRunRequest,
    cancelToken: CancellationToken
  ): TestRunTracker {
    const originId = randomUUID()
    const run = this.testCaseStore.testController.createTestRun(request)
    const requestTracker = new TestRunTracker({
      testCaseMetadata: this.testCaseStore.testCaseMetadata,
      run: run,
      request: request,
      originName: originId,
      cancelToken: cancelToken,
      coverageTracker: this.coverageTracker,
      languageToolManager: this.languageToolManager,
    })

    const ideClient = detectIdeClient()
    requestTracker.setIdeTag(ideClient)

    this.buildClient.registerOriginHandlers(originId, requestTracker)
    requestTracker.onDone(() =>
      this.buildClient.disposeOriginHandlers(originId)
    )
    return requestTracker
  }
}
