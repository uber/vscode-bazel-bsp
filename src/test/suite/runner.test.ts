import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import sinon from 'sinon'
import {MessageConnection} from 'vscode-jsonrpc'
import {TestParamsDataKind} from '../../bsp/bsp-ext'

import {BazelBSPBuildClient} from '../../test-explorer/client'
import {TestCaseStore} from '../../test-explorer/store'
import {TestResolver} from '../../test-explorer/resolver'
import {
  BuildServerManager,
  CANCEL_ERROR_CODE,
} from '../../server/server-manager'
import {
  TEST_CONTROLLER_TOKEN,
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {TestRunner} from '../../test-runner/runner'
import {
  createSampleMessageConnection,
  populateTestCaseStore,
} from './test-utils'
import {TestItem} from 'vscode'
import {RunTrackerFactory} from '../../test-runner/run-factory'
import * as bsp from '../../bsp/bsp'
import {TestItemFactory} from '../../test-info/test-item-factory'
import {CoverageTracker} from '../../coverage-utils/coverage-tracker'
import {LanguageToolManager} from '../../language-tools/manager'
import {SyncHintDecorationsManager} from '../../test-explorer/decorator'
import * as settings from '../../utils/settings'
import * as utils from '../../utils/utils'

suite('Test Runner', () => {
  let ctx: vscode.ExtensionContext
  let testRunner: TestRunner
  let testCaseStore: TestCaseStore
  let buildServerStub: sinon.SinonStubbedInstance<BuildServerManager>
  let buildClientStub: sinon.SinonStubbedInstance<BazelBSPBuildClient>
  let sampleConn: MessageConnection

  const sandbox = sinon.createSandbox()

  beforeEach(async () => {
    buildServerStub = sandbox.createStubInstance(BuildServerManager)
    sampleConn = createSampleMessageConnection()
    buildServerStub.getConnection.returns(Promise.resolve(sampleConn))

    buildClientStub = sandbox.createStubInstance(BazelBSPBuildClient)

    ctx = {
      subscriptions: [],
      asAbsolutePath: (relativePath: string) => `/sample/${relativePath}`,
      workspaceState: {
        update: sandbox.stub(),
        get: sandbox.stub().resolves(undefined),
      },
    } as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        TestCaseStore,
        TestResolver,
        TestRunner,
        RunTrackerFactory,
        TestItemFactory,
        CoverageTracker,
        LanguageToolManager,
        SyncHintDecorationsManager,
      ],
    })
      .useMocker(token => {
        if (token === BuildServerManager) {
          return buildServerStub
        } else if (token === BazelBSPBuildClient) {
          return buildClientStub
        } else if (token === TEST_CONTROLLER_TOKEN) {
          return vscode.tests.createTestController(
            'testStoreTestController',
            ''
          )
        }
        throw new Error('No mock available for token.')
      })
      .compile()
    moduleRef.init()
    testRunner = moduleRef.get(TestRunner)
    testCaseStore = moduleRef.get(TestCaseStore)

    populateTestCaseStore(testCaseStore)
  })

  afterEach(() => {
    for (const item of ctx.subscriptions) {
      item.dispose()
    }
    sandbox.restore()
  })

  test('onModuleInit', async () => {
    await testRunner.onModuleInit()
    assert.ok(testRunner.runProfiles.get(vscode.TestRunProfileKind.Run))
    assert.equal(ctx.subscriptions.length, 3)
  })

  test('Test Run', async () => {
    await testRunner.onModuleInit()
    const runProfile = testRunner.runProfiles.get(vscode.TestRunProfileKind.Run)
    assert.ok(runProfile)

    const sampleResult: bsp.TestResult = {
      statusCode: bsp.StatusCode.Ok,
    }
    const connStub = sinon
      .stub(sampleConn, 'sendRequest')
      .returns(Promise.resolve(sampleResult))

    const requestedTestItems: TestItem[] = []
    testCaseStore.testController.items.forEach(item => {
      requestedTestItems.push(item)
    })
    await runProfile.runHandler(
      {
        include: requestedTestItems,
        exclude: [],
        profile: runProfile,
        preserveFocus: false,
      },
      new vscode.CancellationTokenSource().token
    )
    assert.equal(connStub.callCount, 3)
  })

  test('Test Run with Coverage', async () => {
    await testRunner.onModuleInit()
    const runProfile = testRunner.runProfiles.get(
      vscode.TestRunProfileKind.Coverage
    )
    assert.ok(runProfile)

    const sampleResult: bsp.TestResult = {
      statusCode: bsp.StatusCode.Ok,
    }
    const connStub = sinon
      .stub(sampleConn, 'sendRequest')
      .returns(Promise.resolve(sampleResult))

    const requestedTestItems: TestItem[] = []
    testCaseStore.testController.items.forEach(item => {
      requestedTestItems.push(item)
    })
    await runProfile.runHandler(
      {
        include: requestedTestItems,
        exclude: [],
        profile: runProfile,
        preserveFocus: false,
      },
      new vscode.CancellationTokenSource().token
    )
    assert.equal(connStub.callCount, 3)
    for (const callArgs of connStub.args) {
      assert.ok(callArgs[1].data.coverage)
      assert.strictEqual(callArgs[1].dataKind, TestParamsDataKind.BazelTest)
    }
  })

  test('Test Run with Debug, Valid Settings', async () => {
    // Debug enabled and valid settings present.
    const settingsStub: sinon.SinonStub = sandbox.stub(
      settings,
      'getExtensionSetting'
    )
    settingsStub
      .withArgs(settings.SettingName.DEBUG_ENABLED)
      .returns(true)
      .withArgs(settings.SettingName.LAUNCH_CONFIG_NAME)
      .returns('myLaunchConfig')
      .withArgs(settings.SettingName.DEBUG_READY_PATTERN)
      .returns('^Ready to Debug')
      .withArgs(settings.SettingName.DEBUG_BAZEL_FLAGS)
      .returns(['--my_flag_1', '--my_flag_2'])

    // Launch configuration that matches setting above.
    const fakeLaunchConfig: vscode.DebugConfiguration = {
      type: 'node',
      request: 'connect',
      name: 'myLaunchConfig',
    }
    const configurationsStub = sandbox.stub()
    configurationsStub.withArgs('configurations').returns([fakeLaunchConfig])
    const launchConfigurationsStub = sandbox.stub(
      vscode.workspace,
      'getConfiguration'
    )
    launchConfigurationsStub
      .withArgs('launch')
      .returns({get: configurationsStub})

    // Mock the connection to return a test result.
    const sampleResult: bsp.TestResult = {
      statusCode: bsp.StatusCode.Ok,
    }
    const connStub = sinon
      .stub(sampleConn, 'sendRequest')
      .returns(Promise.resolve(sampleResult))

    // Mock the IDE tag detection
    sandbox.stub(utils, 'detectIdeClient').returns('cursor')

    // Ensure run profile creation.
    await testRunner.onModuleInit()
    const runProfile = testRunner.runProfiles.get(
      vscode.TestRunProfileKind.Debug
    )
    assert.ok(runProfile)

    // Ensure proper test run execution with configured Bazel flags.
    const requestedTestItems: TestItem[] = []
    testCaseStore.testController.items.forEach(item => {
      requestedTestItems.push(item)
    })
    await runProfile.runHandler(
      {
        include: requestedTestItems,
        exclude: [],
        profile: runProfile,
        preserveFocus: false,
      },
      new vscode.CancellationTokenSource().token
    )

    assert.equal(connStub.callCount, 3)
    for (const callArgs of connStub.args) {
      assert.ok(!callArgs[1].data.coverage)
      assert.strictEqual(
        callArgs[1].data.additionalBazelParams,
        '--my_flag_1 --my_flag_2 --test_env=IDE_CLIENT=cursor'
      )
      assert.strictEqual(callArgs[1].dataKind, TestParamsDataKind.BazelTest)
    }
  })

  test('Test Run with Debug, Disabled', async () => {
    // Debug disabled.
    const settingsStub: sinon.SinonStub = sandbox.stub(
      settings,
      'getExtensionSetting'
    )
    settingsStub.withArgs(settings.SettingName.DEBUG_ENABLED).returns(false)

    // Ensure that no debug run profile gets created.
    await testRunner.onModuleInit()
    const runProfile = testRunner.runProfiles.get(
      vscode.TestRunProfileKind.Debug
    )
    assert.strictEqual(runProfile, undefined)
    assert.strictEqual(settingsStub.callCount, 1)
  })

  test('Test Run with Cancel', async () => {
    await testRunner.onModuleInit()
    const runProfile = testRunner.runProfiles.get(vscode.TestRunProfileKind.Run)
    assert.ok(runProfile)

    const tokenSource = new vscode.CancellationTokenSource()
    let firstRequest = true
    const connStub = sinon.stub(sampleConn, 'sendRequest').callsFake(() => {
      tokenSource.cancel()
      assert.ok(firstRequest)
      firstRequest = false
      return Promise.reject({code: CANCEL_ERROR_CODE})
    })

    const requestedTestItems: TestItem[] = []
    testCaseStore.testController.items.forEach(item => {
      requestedTestItems.push(item)
    })
    await runProfile.runHandler(
      {
        include: requestedTestItems,
        exclude: [],
        profile: runProfile,
        preserveFocus: false,
      },
      tokenSource.token
    )
    assert.equal(connStub.callCount, 1)
  })
})
