import * as path from 'path'

import {runTests} from '@vscode/test-electron'
import {randomBytes} from 'crypto'
import {tmpdir} from 'os'
import {join} from 'path'
import {mkdir} from 'fs'
import {promisify} from 'util'
const mkdirAsync = promisify(mkdir)

async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../')
    const extensionTestsPath = path.resolve(__dirname, './suite/index')

    const testTmp = await getTempDir()

    // Download VS Code, unzip it and run the integration test
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [testTmp],
      extensionTestsEnv: {
        DEVPOD_FLAVOR: 'go',
        WORKSPACE_ROOT: testTmp,
      },
    })
  } catch (err) {
    console.error('Failed to run tests')
    process.exit(1)
  }
}

async function getTempDir(): Promise<string> {
  const rng = randomBytes(16).toString('hex')
  const temp = join(tmpdir(), rng)
  await mkdirAsync(temp, {recursive: true})

  return temp
}

main()
  .then(() => {})
  .catch(e => {
    console.error(e)
  })
