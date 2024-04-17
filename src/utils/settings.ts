import * as vscode from 'vscode'

const CONFIGURATION_SECTION = 'bazelbsp'

export enum SettingName {
  BUILD_FILE_NAME = 'buildFileName',
  BAZEL_PROJECT_FILE_PATH = 'bazelProjectFilePath',
}

export interface SettingTypes {
  [SettingName.BUILD_FILE_NAME]: string
  [SettingName.BAZEL_PROJECT_FILE_PATH]: string
}

export function getExtensionSetting<T extends keyof SettingTypes>(
  setting: T
): SettingTypes[T] | undefined {
  const value = vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<SettingTypes[T]>(setting)

  return value
}

export function openSettingsEditor(setting: SettingName): void {
  vscode.commands.executeCommand(
    'workbench.action.openSettings',
    CONFIGURATION_SECTION + '.' + setting
  )
}
