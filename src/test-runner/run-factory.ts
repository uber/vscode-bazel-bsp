import {randomUUID} from 'crypto'

import {Inject, Injectable} from '@nestjs/common'
import {TestCaseStore} from '../test-explorer/store'
import {TestRunTracker} from './run-tracker'
import {TestRunRequest} from 'vscode'
import {BazelBSPBuildClient} from '../test-explorer/client'

@Injectable()
export class RunTrackerFactory {
  @Inject(TestCaseStore) private readonly testCaseStore: TestCaseStore
  @Inject(BazelBSPBuildClient) private readonly buildClient: BazelBSPBuildClient

  public newRun(request: TestRunRequest): TestRunTracker {
    const originId = randomUUID()
    const run = this.testCaseStore.testController.createTestRun(request)
    const requestTracker = new TestRunTracker(
      this.testCaseStore.testCaseMetadata,
      run,
      request,
      originId
    )

    return requestTracker
  }
}
