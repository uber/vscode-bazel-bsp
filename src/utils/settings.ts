import * as vscode from 'vscode'

const CONFIGURATION_SECTION = 'bazelbsp'

export enum SettingName {
  BUILD_FILE_NAME = 'buildFileName',
  BAZEL_PROJECT_FILE_PATH = 'bazelProjectFilePath',
  BSP_SERVER_VERSION = 'serverVersion',
  BAZEL_BINARY_PATH = 'bazelBinaryPath',
  SERVER_INSTALL_MODE = 'serverInstallMode',
  AUTO_EXPAND_TARGET = 'autoExpandTarget',
}

export interface SettingTypes {
  [SettingName.BUILD_FILE_NAME]: string
  [SettingName.BAZEL_PROJECT_FILE_PATH]: string
  [SettingName.BSP_SERVER_VERSION]: string
  [SettingName.BAZEL_BINARY_PATH]: string
  [SettingName.SERVER_INSTALL_MODE]: string
  [SettingName.AUTO_EXPAND_TARGET]: boolean
}

export function getExtensionSetting<T extends keyof SettingTypes>(
  setting: T
): SettingTypes[T] | undefined {
  const value = vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<SettingTypes[T]>(setting)

  return value
}

export async function settingModifyPrompt(
  message: string,
  setting: SettingName
): Promise<void> {
  const modifySelection: vscode.MessageItem = {title: 'Edit in settings'}
  const userSelection =
    await vscode.window.showErrorMessage<vscode.MessageItem>(
      message,
      modifySelection,
      {title: 'Cancel', isCloseAffordance: true}
    )
  if (userSelection?.title === modifySelection.title) {
    vscode.commands.executeCommand(
      'workbench.action.openSettings',
      CONFIGURATION_SECTION + '.' + setting
    )
  }
}
