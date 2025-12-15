import {promisify} from 'util'
import {exec} from 'child_process'
import {getExtensionSetting, SettingName} from './settings'

const execAsync = promisify(exec)

/**
 * Service for querying Bazel information.
 * Caches results per workspace to avoid repeated queries.
 */
export class BazelInfoService {
  private static executionRootCache = new Map<string, string>()
  private static outputBaseCache = new Map<string, string>()
  private static platformCache = new Map<string, string>()

  /**
   * Gets the Bazel execution root for the given workspace.
   * Caches the result to avoid repeated queries.
   * @param workspaceRoot The root directory of the workspace
   * @returns The execution root path, or undefined if the query fails
   */
  static async getExecutionRoot(
    workspaceRoot: string
  ): Promise<string | undefined> {
    // Return cached value if available
    if (this.executionRootCache.has(workspaceRoot)) {
      return this.executionRootCache.get(workspaceRoot)
    }

    try {
      const bazelBinaryPath = getExtensionSetting(SettingName.BAZEL_BINARY_PATH)
      if (!bazelBinaryPath) {
        return undefined
      }

      const {stdout} = await execAsync(
        `${bazelBinaryPath} info execution_root`,
        {
          cwd: workspaceRoot,
        }
      )

      const executionRoot = stdout.trim()
      if (executionRoot) {
        this.executionRootCache.set(workspaceRoot, executionRoot)
        return executionRoot
      }
    } catch (error) {
      // Silently fail - caller can handle undefined
      return undefined
    }

    return undefined
  }

  /**
   * Gets the Bazel output base for the given workspace.
   * Caches the result to avoid repeated queries.
   * @param workspaceRoot The root directory of the workspace
   * @returns The output base path, or undefined if the query fails
   */
  static async getOutputBase(
    workspaceRoot: string
  ): Promise<string | undefined> {
    // Return cached value if available
    if (this.outputBaseCache.has(workspaceRoot)) {
      return this.outputBaseCache.get(workspaceRoot)
    }

    try {
      const bazelBinaryPath = getExtensionSetting(SettingName.BAZEL_BINARY_PATH)
      if (!bazelBinaryPath) {
        return undefined
      }

      const {stdout} = await execAsync(`${bazelBinaryPath} info output_base`, {
        cwd: workspaceRoot,
      })

      const outputBase = stdout.trim()
      if (outputBase) {
        this.outputBaseCache.set(workspaceRoot, outputBase)
        return outputBase
      }
    } catch (error) {
      // Silently fail - caller can handle undefined
      return undefined
    }

    return undefined
  }

  /**
   * Gets the Bazel platform configuration (e.g., "darwin_arm64-fastbuild").
   * This is used to construct the correct bazel-out path.
   * @param workspaceRoot The root directory of the workspace
   * @returns The platform string, or undefined if the query fails
   */
  static async getPlatform(workspaceRoot: string): Promise<string | undefined> {
    // Return cached value if available
    if (this.platformCache.has(workspaceRoot)) {
      return this.platformCache.get(workspaceRoot)
    }

    try {
      const bazelBinaryPath = getExtensionSetting(SettingName.BAZEL_BINARY_PATH)
      if (!bazelBinaryPath) {
        return undefined
      }

      // Query for the platform configuration
      // Format: bazel info | grep "bazel-bin" or use "bazel info bazel-bin" and extract platform
      const {stdout} = await execAsync(`${bazelBinaryPath} info bazel-bin`, {
        cwd: workspaceRoot,
      })

      // Extract platform from bazel-bin path
      // Format: .../bazel-out/{platform}/bin
      const platformMatch = stdout.trim().match(/bazel-out[/\\]([^/\\]+)/)
      if (platformMatch && platformMatch[1]) {
        const platform = platformMatch[1]
        this.platformCache.set(workspaceRoot, platform)
        return platform
      }
    } catch (error) {
      // Silently fail - caller can handle undefined
      return undefined
    }

    return undefined
  }

  /**
   * Clears the cache for a specific workspace.
   * Useful when Bazel configuration changes.
   * @param workspaceRoot The workspace root to clear cache for
   */
  static clearCache(workspaceRoot: string): void {
    this.executionRootCache.delete(workspaceRoot)
    this.outputBaseCache.delete(workspaceRoot)
    this.platformCache.delete(workspaceRoot)
  }

  /**
   * Clears all cached values.
   */
  static clearAllCache(): void {
    this.executionRootCache.clear()
    this.outputBaseCache.clear()
    this.platformCache.clear()
  }
}
