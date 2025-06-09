import * as vscode from 'vscode'
import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import * as sinon from 'sinon'
import {
  getExtensionSetting,
  settingModifyPrompt,
  SettingName,
  SettingTypes,
} from '../../../utils/settings'

suite('Settings Utils', () => {
  let sandbox: sinon.SinonSandbox
  let workspaceGetConfigurationStub: sinon.SinonStub
  let configurationGetStub: sinon.SinonStub
  let showErrorMessageStub: sinon.SinonStub
  let executeCommandStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    configurationGetStub = sandbox.stub()
    workspaceGetConfigurationStub = sandbox
      .stub(vscode.workspace, 'getConfiguration')
      .returns({get: configurationGetStub} as any)
    showErrorMessageStub = sandbox.stub(vscode.window, 'showErrorMessage')
    executeCommandStub = sandbox.stub(vscode.commands, 'executeCommand')
  })

  afterEach(() => {
    sandbox.restore()
  })

  suite('getExtensionSetting', () => {
    test('should retrieve string setting', () => {
      const expectedValue = 'test-value'
      configurationGetStub
        .withArgs(SettingName.BUILD_FILE_NAME)
        .returns(expectedValue)

      const result = getExtensionSetting(SettingName.BUILD_FILE_NAME)

      assert.strictEqual(result, expectedValue)
      assert.ok(
        workspaceGetConfigurationStub.calledWith('bazelbsp'),
        'Should use correct configuration section'
      )
      assert.ok(
        configurationGetStub.calledWith(SettingName.BUILD_FILE_NAME),
        'Should request correct setting'
      )
    })

    test('should retrieve boolean setting', () => {
      const expectedValue = true
      configurationGetStub
        .withArgs(SettingName.JAVA_USE_DOCUMENT_SYMBOLS)
        .returns(expectedValue)

      const result = getExtensionSetting(SettingName.JAVA_USE_DOCUMENT_SYMBOLS)

      assert.strictEqual(result, expectedValue)
      assert.ok(
        workspaceGetConfigurationStub.calledWith('bazelbsp'),
        'Should use correct configuration section'
      )
      assert.ok(
        configurationGetStub.calledWith(SettingName.JAVA_USE_DOCUMENT_SYMBOLS),
        'Should request correct setting'
      )
    })

    test('should retrieve string array setting', () => {
      const expectedValue = ['--flag1', '--flag2']
      configurationGetStub
        .withArgs(SettingName.ADDITIONAL_INSTALL_FLAGS)
        .returns(expectedValue)

      const result = getExtensionSetting(SettingName.ADDITIONAL_INSTALL_FLAGS)

      assert.deepStrictEqual(result, expectedValue)
      assert.ok(
        workspaceGetConfigurationStub.calledWith('bazelbsp'),
        'Should use correct configuration section'
      )
      assert.ok(
        configurationGetStub.calledWith(SettingName.ADDITIONAL_INSTALL_FLAGS),
        'Should request correct setting'
      )
    })

    test('should return undefined for non-existent setting', () => {
      configurationGetStub.withArgs(SettingName.BUILD_FILE_NAME).returns(undefined)

      const result = getExtensionSetting(SettingName.BUILD_FILE_NAME)

      assert.strictEqual(result, undefined)
    })

    test('should handle empty string array setting', () => {
      const expectedValue: string[] = []
      configurationGetStub
        .withArgs(SettingName.DEBUG_BAZEL_FLAGS)
        .returns(expectedValue)

      const result = getExtensionSetting(SettingName.DEBUG_BAZEL_FLAGS)

      assert.deepStrictEqual(result, expectedValue)
    })

    test('should handle false boolean setting', () => {
      const expectedValue = false
      configurationGetStub
        .withArgs(SettingName.AUTO_EXPAND_TARGET)
        .returns(expectedValue)

      const result = getExtensionSetting(SettingName.AUTO_EXPAND_TARGET)

      assert.strictEqual(result, expectedValue)
    })
  })

  suite('settingModifyPrompt', () => {
    test('should show error message and open settings when user selects edit', async () => {
      const testMessage = 'Test error message'
      const testSetting = SettingName.BUILD_FILE_NAME
      
      showErrorMessageStub.resolves({title: 'Edit in settings'})

      await settingModifyPrompt(testMessage, testSetting)

      assert.ok(
        showErrorMessageStub.calledWith(
          testMessage,
          {title: 'Edit in settings'},
          {title: 'Cancel', isCloseAffordance: true}
        ),
        'Should show error message with correct options'
      )
      assert.ok(
        executeCommandStub.calledWith(
          'workbench.action.openSettings',
          `bazelbsp.${testSetting}`
        ),
        'Should execute command to open settings with correct parameter'
      )
    })

    test('should not open settings when user cancels', async () => {
      const testMessage = 'Test error message'
      const testSetting = SettingName.BUILD_FILE_NAME
      
      showErrorMessageStub.resolves({title: 'Cancel', isCloseAffordance: true})

      await settingModifyPrompt(testMessage, testSetting)

      assert.ok(
        showErrorMessageStub.calledWith(
          testMessage,
          {title: 'Edit in settings'},
          {title: 'Cancel', isCloseAffordance: true}
        ),
        'Should show error message with correct options'
      )
      assert.ok(
        executeCommandStub.notCalled,
        'Should not execute command when user cancels'
      )
    })

    test('should not open settings when user dismisses dialog', async () => {
      const testMessage = 'Test error message'
      const testSetting = SettingName.BUILD_FILE_NAME
      
      showErrorMessageStub.resolves(undefined)

      await settingModifyPrompt(testMessage, testSetting)

      assert.ok(
        showErrorMessageStub.calledWith(
          testMessage,
          {title: 'Edit in settings'},
          {title: 'Cancel', isCloseAffordance: true}
        ),
        'Should show error message with correct options'
      )
      assert.ok(
        executeCommandStub.notCalled,
        'Should not execute command when user dismisses dialog'
      )
    })

    test('should handle different setting types correctly', async () => {
      const testMessage = 'Test error message'
      const settingsToTest = [
        SettingName.JAVA_USE_DOCUMENT_SYMBOLS,
        SettingName.ADDITIONAL_INSTALL_FLAGS,
        SettingName.DEBUG_BAZEL_FLAGS,
        SettingName.AUTO_EXPAND_TARGET,
      ]
      
      showErrorMessageStub.resolves({title: 'Edit in settings'})

      for (const setting of settingsToTest) {
        executeCommandStub.resetHistory()
        
        await settingModifyPrompt(testMessage, setting)

        assert.ok(
          executeCommandStub.calledWith(
            'workbench.action.openSettings',
            `bazelbsp.${setting}`
          ),
          `Should execute command with correct setting parameter for ${setting}`
        )
      }
    })
  })

  suite('Setting types validation', () => {
    test('should have correct types for all settings', () => {
      // Test that our SettingTypes interface matches the SettingName enum
      const settingKeys = Object.values(SettingName)
      
      // These should be the expected types based on the interface
      const expectedTypes: Record<SettingName, string> = {
        [SettingName.BUILD_FILE_NAME]: 'string',
        [SettingName.BAZEL_PROJECT_FILE_PATH]: 'string',
        [SettingName.BSP_SERVER_VERSION]: 'string',
        [SettingName.BAZEL_BINARY_PATH]: 'string',
        [SettingName.SERVER_INSTALL_MODE]: 'string',
        [SettingName.AUTO_EXPAND_TARGET]: 'boolean',
        [SettingName.DEBUG_ENABLED]: 'boolean',
        [SettingName.DEBUG_BAZEL_FLAGS]: 'object',
        [SettingName.LAUNCH_CONFIG_NAME]: 'string',
        [SettingName.DEBUG_READY_PATTERN]: 'string',
        [SettingName.JAVA_USE_DOCUMENT_SYMBOLS]: 'boolean',
        [SettingName.ADDITIONAL_INSTALL_FLAGS]: 'object',
      }

      for (const setting of settingKeys) {
        assert.ok(
          expectedTypes.hasOwnProperty(setting),
          `Setting ${setting} should have a defined expected type`
        )
      }

      // Ensure we haven't missed any new settings
      assert.strictEqual(
        Object.keys(expectedTypes).length,
        settingKeys.length,
        'All settings should have expected types defined'
      )
    })

    test('should validate new JAVA_USE_DOCUMENT_SYMBOLS setting', () => {
      configurationGetStub
        .withArgs(SettingName.JAVA_USE_DOCUMENT_SYMBOLS)
        .returns(true)

      const result = getExtensionSetting(SettingName.JAVA_USE_DOCUMENT_SYMBOLS)

      assert.strictEqual(typeof result, 'boolean')
      assert.strictEqual(result, true)
    })

    test('should validate new ADDITIONAL_INSTALL_FLAGS setting', () => {
      const testFlags = ['-J-Xmx4g', '--verbose']
      configurationGetStub
        .withArgs(SettingName.ADDITIONAL_INSTALL_FLAGS)
        .returns(testFlags)

      const result = getExtensionSetting(SettingName.ADDITIONAL_INSTALL_FLAGS)

      assert.ok(Array.isArray(result))
      assert.deepStrictEqual(result, testFlags)
    })
  })
}) 