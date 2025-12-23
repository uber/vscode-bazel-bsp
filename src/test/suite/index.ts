import * as path from 'path'
import Mocha from 'mocha'
import {glob} from 'glob'

export async function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    asyncOnly: true,
    timeout: 15000, // Timeout after 15 seconds
  })

  const testsRoot = path.resolve(__dirname, '..')

  const files = glob.sync('**/**.test.js', {cwd: testsRoot})

  // Add files to the test suite
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)))

  // Run the mocha test
  await new Promise<void>((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} tests failed.`))
        } else {
          resolve()
        }
      })
    } catch (err) {
      console.error(err)
      reject(err)
    }
  })
}
