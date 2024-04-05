import * as vscode from 'vscode'
import * as path from 'path'
import {Inject} from '@nestjs/common'
import * as semver from 'semver'

import {BspConnectionDetails} from '../bsp/bsp'
import {PRIMARY_OUTPUT_CHANNEL_TOKEN} from '../custom-providers'
import {Utils} from '../utils/utils'

export class ConnectionDetailsParser {
  @Inject(PRIMARY_OUTPUT_CHANNEL_TOKEN)
  private readonly outputChannel: vscode.OutputChannel

  /**
   * Check for server connection details in the current repository.
   * Return the highest matching version for the given server name.
   * @param bspServerName The name of the server to find connection details for.
   * @returns The connection details for the given server, or undefined if none were found.
   */
  async getServerConnectionDetails(
    bspServerName: string,
    repoRoot: string
  ): Promise<BspConnectionDetails | undefined> {
    this.outputChannel.appendLine('Checking BSP connection details.')

    const connectInfo = await this.processConnectionDir(bspServerName, repoRoot)
    if (connectInfo === undefined) {
      this.outputChannel.appendLine(
        `Unable to get connection details for ${bspServerName}.`
      )
      return
    }

    this.outputChannel.appendLine(
      `Found connection details for ${bspServerName} version ${connectInfo.version}`
    )
    return connectInfo
  }

  /**
   * Check the current repository for a .bsp directory, and parse all files present to get connection details.
   * See more: https://build-server-protocol.github.io/docs/overview/server-discovery
   * @returns Connectiion details for the given bspServer name, or undefined if not found.
   */
  private async processConnectionDir(
    bspServerName: string,
    repoRoot: string
  ): Promise<BspConnectionDetails | undefined> {
    let result: BspConnectionDetails | undefined = undefined

    const bspDir = path.join(repoRoot, '.bsp')
    let allFiles: string[] = []
    try {
      allFiles = await Utils.readdir(bspDir)
    } catch {
      this.outputChannel.appendLine(`Unable to access ${bspDir}.`)
      return result
    }

    this.outputChannel.appendLine(
      `Found ${bspDir}, checking for server connection details.`
    )

    // Collect all json files from the bsp connection directory.
    const jsonFiles = allFiles.filter(file => file.endsWith('.json'))

    // Evaluate each file to find the best match for the requested server.
    for (const fileName of jsonFiles) {
      const connectionInfo = await this.processConnectionFile(
        path.join(bspDir, fileName)
      )
      if (connectionInfo && connectionInfo.name === bspServerName) {
        if (
          result === undefined ||
          semver.gt(connectionInfo.version, result.version)
        ) {
          result = connectionInfo
        }
      }
    }
    return result
  }

  /**
   * Reads the contents of a json file containing data in the format of BspConnectionDetails.
   * Skip invalid files, as it's possible other files may be present in this directory.
   * @param filePath The path to the file to read.
   * @returns The parsed connection details, or undefined if the file could not be read or parsed.
   */
  private async processConnectionFile(
    filePath: string
  ): Promise<BspConnectionDetails | undefined> {
    let fileContents = ''
    try {
      fileContents = await Utils.readFile(filePath)
    } catch {
      this.outputChannel.appendLine(
        `Skipping ${filePath}: Failed to read file.`
      )
      return
    }

    try {
      return JSON.parse(fileContents)
    } catch {
      this.outputChannel.appendLine(
        `Skipping ${filePath}: Failed to parse file contents.`
      )
      return
    }
  }
}
