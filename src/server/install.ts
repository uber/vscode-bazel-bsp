import cp from 'child_process'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import * as axios from 'axios'
import * as vscode from 'vscode'
import {Inject} from '@nestjs/common'

import {Utils} from '../utils/utils'
import {
  EXTENSION_CONTEXT_TOKEN,
  PRIMARY_OUTPUT_CHANNEL_TOKEN,
} from '../custom-providers'
import {
  SettingName,
  getExtensionSetting,
  openSettingsEditor,
} from '../utils/settings'

export const INSTALL_BSP_COMMAND = 'bazelbsp.install'

// TODO(IDE-1005): Make configurable based on VS Code settings.
const MAVEN_PACKAGE = 'org.jetbrains.bsp:bazel-bsp'
const INSTALL_METHOD = 'org.jetbrains.bsp.bazel.install.Install'
const BAZEL_BSP_VERSION = '3.1.0-20240405-0a05fa1-NIGHTLY'
const COURSIER_URL = 'https://git.io/coursier-cli'
const BAZEL_REL_PATH = 'tools/bazel'

export class BazelBSPInstaller {
  @Inject(PRIMARY_OUTPUT_CHANNEL_TOKEN)
  private readonly outputChannel: vscode.OutputChannel
  @Inject(EXTENSION_CONTEXT_TOKEN) private readonly ctx: vscode.ExtensionContext

  onModuleInit() {
    this.ctx.subscriptions.push(
      vscode.commands.registerCommand(
        INSTALL_BSP_COMMAND,
        this.install.bind(this)
      )
    )
  }

  /**
   * Installs Bazel BSP at the root of the current repository.
   * This will ensure that the BSP server is in place and available to be launched in this workspace.
   * See more: https://github.com/JetBrains/bazel-bsp/tree/master/install
   * @returns Boolean indicating a successful installation.
   */
  public async install(): Promise<boolean> {
    // Install at the git root of the current workspace.
    const root = await Utils.getWorkspaceGitRoot()
    if (!root) {
      return false
    }

    // User prompt before proceeding.
    const installSelection: vscode.MessageItem = {title: 'Install BSP'}
    const userSelection =
      await vscode.window.showErrorMessage<vscode.MessageItem>(
        `Do you want to install the Bazel Build Server in ${root}?`,
        installSelection,
        {title: 'Cancel', isCloseAffordance: true}
      )

    if (userSelection?.title !== installSelection.title) {
      this.outputChannel.appendLine(`Installation in ${root} declined by user`)
      return false
    }
    this.outputChannel.appendLine(`Installing Bazel BSP server at ${root}`)

    // Coursier install, to avoid dependence on the local environment.
    const coursierPath = await this.downloadCoursier()
    if (coursierPath === undefined) {
      return false
    }

    // Execute the BSP installer within this workspace.
    const exitCode = await this.runInstaller(coursierPath, root)
    if (exitCode !== 0) {
      return false
    }
    return true
  }

  /**
   * Downloads the Coursier cli to a temporary location, for one-time use by this installer.
   * This avoids depending on the local environment to have an existing available installation.
   * @returns The path to the downloaded Coursier cli, or undefined if the download failed.
   */
  private async downloadCoursier(): Promise<string | undefined> {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coursier-'))
    const coursierPath = path.join(tempDir, 'coursier')

    this.outputChannel.appendLine(`Downloading Coursier from ${COURSIER_URL}`)
    try {
      const response = await axios.default.get(COURSIER_URL, {
        responseType: 'arraybuffer',
      })

      await fs.writeFile(coursierPath, response.data)
      await fs.chmod(coursierPath, 0o755)
    } catch (e) {
      this.outputChannel.appendLine(`Failed to download Coursier: ${e}`)
      return undefined
    }

    this.outputChannel.appendLine(
      `Coursier temporarily installed at ${coursierPath}`
    )
    return coursierPath
  }

  /**
   * Run the BSP installer using the downloaded Coursier cli.
   * @param coursierPath Absolute path to an executable copy of the Coursier cli.
   * @param root Root of the repository where the BSP server will be installed.
   * @returns The exit code of the installer process, or null if the process failed to start.
   */
  private async runInstaller(
    coursierPath: string,
    root: string
  ): Promise<number | null> {
    this.outputChannel.appendLine(
      `Launching Bazel BSP installer from Maven package: ${MAVEN_PACKAGE}`
    )
    const bazelPath = path.join(root, BAZEL_REL_PATH)
    const projectFilePath = getExtensionSetting(
      SettingName.BAZEL_PROJECT_FILE_PATH
    )
    if (projectFilePath === undefined) {
      await this.bazelProjectErrorPrompt()
      return null
    }
    // Flags to be passed to the installer.
    // See CliOptionsProvider in the server code for available options.
    const installFlags: Map<string, string> = new Map([
      // Set Bazel project details to be used if a project file is not already present.
      ['--project-view-file', projectFilePath],
      ['--bazel-binary', bazelPath],
      ['--targets', '# //YOUR_TARGETS/...'],
    ])
    const flagsString = Array.from(installFlags.entries())
      .map(([key, value]) => `${key} "${value}"`)
      .join(' ')

    // Full install command including flags.
    const installCommand = `"${coursierPath}" launch ${MAVEN_PACKAGE}:${BAZEL_BSP_VERSION} -M ${INSTALL_METHOD} -- ${flagsString}`

    // Report progress in output channel.
    const installProcess = cp.spawn(installCommand, {cwd: root, shell: true})
    installProcess.stdout?.on('data', chunk => {
      this.outputChannel.appendLine(chunk.toString())
    })
    installProcess.stderr?.on('data', chunk => {
      this.outputChannel.appendLine(chunk.toString())
    })
    return new Promise<number | null>(resolve => {
      // Handle cases where process is already exited (e.g. tests), or exits later on.
      if (installProcess.exitCode !== null) resolve(installProcess.exitCode)
      installProcess.on('exit', code => {
        resolve(code)
      })

      // Handle cases where the process fails to start.
      installProcess.on('error', err => {
        this.outputChannel.appendLine(`Failed to start installer: ${err}`)
        resolve(null)
      })
    })
  }

  private async bazelProjectErrorPrompt() {
    const modifySelection: vscode.MessageItem = {title: 'Edit in settings'}
    const userSelection =
      await vscode.window.showErrorMessage<vscode.MessageItem>(
        'Unable to determine the Bazel project file path from settings.',
        modifySelection,
        {title: 'Cancel', isCloseAffordance: true}
      )
    if (userSelection?.title === modifySelection.title) {
      openSettingsEditor(SettingName.BAZEL_PROJECT_FILE_PATH)
    }
  }
}
