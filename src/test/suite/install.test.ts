import * as assert from 'assert'
import * as vscode from 'vscode'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as sinon from 'sinon'
import * as axios from 'axios'
import fs from 'fs/promises'
import cp from 'child_process'
import * as zlib from 'zlib'
const proxyquire = require('proxyquire')

import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {Utils} from '../../utils/utils'
import {BazelBSPInstaller} from '../../server/install'
import * as settings from '../../utils/settings'

suite('BSP Installer', () => {
  let ctx: vscode.ExtensionContext
  let bazelBSPInstaller: BazelBSPInstaller
  let spawnStub: sinon.SinonStub
  let osMock: any

  const sandbox = sinon.createSandbox()

  interface InstallTestConfig {
    platform: string
    arch: string
    isGzipped: boolean
    javaVersion: string
    additionalInstallFlags?: string[]
  }

  const setupInstallTest = (config: InstallTestConfig) => {
    // Set up OS mock values
    osMock.platform = () => config.platform
    osMock.arch = () => config.arch

    sandbox
      .stub(vscode.window, 'showErrorMessage')
      .resolves({title: 'Install BSP'})

    sandbox
      .stub(settings, 'getExtensionSetting')
      .withArgs(settings.SettingName.BAZEL_BINARY_PATH)
      .returns('bazel')
      .withArgs(settings.SettingName.BAZEL_PROJECT_FILE_PATH)
      .returns('projectview.bazelproject')
      .withArgs(settings.SettingName.BSP_SERVER_VERSION)
      .returns('2.0.0')
      .withArgs(settings.SettingName.SERVER_INSTALL_MODE)
      .returns('Prompt')
      .withArgs(settings.SettingName.ADDITIONAL_INSTALL_FLAGS)
      .returns(config.additionalInstallFlags || [])

    sandbox.stub(fs, 'readFile').resolves(
      `#if( $pythonEnabled == "true" && $bazel8OrAbove == "true" )
load("@rules_python//python:defs.bzl", "PyInfo", "PyRuntimeInfo")
#end

load("//aspects:utils/utils.bzl", "create_struct", "file_location", "to_file_location")`
    )

    const originalData = 'sample data'
    const responseData = config.isGzipped
      ? zlib.gzipSync(Buffer.from(originalData))
      : originalData

    sandbox.stub(axios.default, 'get').resolves({
      data: responseData,
    } as any)

    return {originalData}
  }

  beforeEach(async () => {
    let process = cp.spawn('echo')
    spawnStub = sandbox.stub(cp, 'spawn').returns(process)
    sandbox.stub(Utils, 'getWorkspaceGitRoot').resolves('/repo/root')

    osMock = {
      platform: () => 'darwin',
      arch: () => 'arm64',
    }

    // Use proxyquire to inject the OS mock
    const BazelBSPInstallerProxy = proxyquire('../../server/install', {
      os: osMock,
    }).BazelBSPInstaller

    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        {
          provide: BazelBSPInstaller,
          useClass: BazelBSPInstallerProxy,
        },
      ],
    }).compile()
    bazelBSPInstaller = moduleRef.get(BazelBSPInstaller)
  })

  afterEach(() => {
    sandbox.restore()
  })

  const testConfigs: {[key: string]: InstallTestConfig} = {
    macArm64: {
      platform: 'darwin',
      arch: 'arm64',
      isGzipped: true,
      javaVersion: 'temurin:1.17.0.0',
    },
    macIntel: {
      platform: 'darwin',
      arch: 'x64',
      isGzipped: true,
      javaVersion: 'temurin:1.17.0.0',
    },
    linux: {
      platform: 'linux',
      arch: 'x64',
      isGzipped: false,
      javaVersion: 'openjdk:1.17.0',
    },
  }

  Object.entries(testConfigs).forEach(([name, config]) => {
    test(`spawn install process - ${name}`, async () => {
      const {originalData} = setupInstallTest(config)

      const writeFileSpy = sandbox.spy(fs, 'writeFile')
      const chmodSpy = sandbox.spy(fs, 'chmod')
      const installResult = await bazelBSPInstaller.install()

      // Verify coursier download and permissions
      assert.equal(writeFileSpy.callCount, 2)
      const coursierPath = writeFileSpy.getCalls()[0].args[0]
      const writtenData = writeFileSpy.getCalls()[0].args[1]

      if (config.isGzipped) {
        assert.equal(writtenData.toString(), originalData)
      } else {
        assert.equal(writtenData, originalData)
      }

      assert.equal(chmodSpy.callCount, 1)
      assert.equal(chmodSpy.getCalls()[0].args[0], coursierPath)
      assert.equal(chmodSpy.getCalls()[0].args[1], 0o755)

      // Verify spawn command
      const updatedContents = writeFileSpy.getCalls()[1].args[1]
      const expectedContents = `load("@rules_python//python:defs.bzl", "PyInfo", "PyRuntimeInfo")

load("//aspects:utils/utils.bzl", "create_struct", "file_location", "to_file_location")`

      assert.equal(updatedContents, expectedContents)
      assert.equal(spawnStub.callCount, 1)
      const spawnCall = spawnStub.getCalls()[0]
      assert.ok(spawnCall.args[0].includes(coursierPath))
      assert.ok(spawnCall.args[0].includes(`--jvm ${config.javaVersion}`))
      assert.ok(spawnCall.args[0].includes('org.virtuslab:bazel-bsp:2.0.0'))
      assert.deepStrictEqual(spawnCall.args[1], {
        cwd: '/repo/root',
        shell: true,
      })
      assert.ok(installResult)
    })
  })

  test('failed coursier download', async () => {
    sandbox
      .stub(vscode.window, 'showErrorMessage')
      .resolves({title: 'Install BSP'})

    sandbox
      .stub(settings, 'getExtensionSetting')
      .withArgs(settings.SettingName.BAZEL_BINARY_PATH)
      .returns('bazel')
      .withArgs(settings.SettingName.BAZEL_PROJECT_FILE_PATH)
      .returns('projectview.bazelproject')
      .withArgs(settings.SettingName.BSP_SERVER_VERSION)
      .returns('2.0.0')
      .withArgs(settings.SettingName.SERVER_INSTALL_MODE)
      .returns('Prompt')

    sandbox.stub(axios.default, 'get').rejects(new Error('sample error'))

    const writeFileSpy = sandbox.spy(fs, 'writeFile')
    const installResult = await bazelBSPInstaller.install()

    // Confirm that installation was gracefully interrupted.
    assert.ok(writeFileSpy.notCalled)
    assert.ok(spawnStub.notCalled)
    assert.ok(!installResult)
  })

  test('undefined setting', async () => {
    sandbox
      .stub(vscode.window, 'showErrorMessage')
      .resolves({title: 'Install BSP'})

    sandbox
      .stub(settings, 'getExtensionSetting')
      .withArgs(settings.SettingName.BAZEL_BINARY_PATH)
      .returns(undefined)
      .withArgs(settings.SettingName.BAZEL_PROJECT_FILE_PATH)
      .returns('projectview.bazelproject')
      .withArgs(settings.SettingName.BSP_SERVER_VERSION)
      .returns('2.0.0')
      .withArgs(settings.SettingName.SERVER_INSTALL_MODE)
      .returns('Prompt')

    const writeFileSpy = sandbox.spy(fs, 'writeFile')
    const installResult = await bazelBSPInstaller.install()

    // Confirm that installation was gracefully interrupted.
    assert.ok(writeFileSpy.notCalled)
    assert.ok(spawnStub.notCalled)
    assert.ok(!installResult)
  })

  test('user decline', async () => {
    sandbox
      .stub(settings, 'getExtensionSetting')
      .withArgs(settings.SettingName.SERVER_INSTALL_MODE)
      .returns('Prompt')
    sandbox.stub(vscode.window, 'showErrorMessage').resolves({title: 'other'})
    sandbox.stub(axios.default, 'get').resolves({data: 'sample data'} as any)
    const actualInstallResult = await bazelBSPInstaller.install()
    assert.ok(!actualInstallResult)
  })

  test('install disabled', async () => {
    sandbox
      .stub(settings, 'getExtensionSetting')
      .withArgs(settings.SettingName.SERVER_INSTALL_MODE)
      .returns('Disabled')
    const actualInstallResult = await bazelBSPInstaller.install()
    assert.ok(!actualInstallResult)
  })

  test('additional install flags', async () => {
    const config = {
      ...testConfigs.macArm64,
      additionalInstallFlags: [
        '-J-Djavax.net.ssl.trustStore=/path/to/ca/cacerts',
        '-J-Djavax.net.ssl.trustStorePassword=xxxx',
      ],
    }
    setupInstallTest(config)

    await bazelBSPInstaller.install()

    assert.equal(spawnStub.callCount, 1)
    const spawnCall = spawnStub.getCalls()[0]
    const commandString = spawnCall.args[0]
    config.additionalInstallFlags.forEach(flag => {
      assert.ok(commandString.includes(flag))
    })
  })
})
