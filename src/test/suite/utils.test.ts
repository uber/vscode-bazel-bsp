import * as vscode from 'vscode'
import * as assert from 'assert'
import sinon from 'sinon'
import {afterEach} from 'mocha'
import * as zlib from 'zlib'

import {Deferred, Utils, detectIdeClient} from '../../utils/utils'

suite('Utils Test Suite', () => {
  const sandbox = sinon.createSandbox()
  afterEach(() => {
    sandbox.restore()
  })

  test('getWorkspaceRoot, no workspace folders', async () => {
    sandbox.stub(vscode.workspace, 'workspaceFolders').value(undefined)

    const result = Utils.getWorkspaceRoot()
    assert.strictEqual(result, null)
  })

  test('getWorkspaceRoot, no workspace file', async () => {
    const workspaceFolders: vscode.WorkspaceFolder[] = [
      {
        uri: vscode.Uri.parse('file:///path/to/workspace'),
        name: 'Workspace',
        index: 0,
      },
    ]
    sandbox
      .stub(vscode.workspace, 'workspaceFolders')
      .get(() => workspaceFolders)
    sandbox.stub(vscode.workspace, 'workspaceFile').value(undefined)

    const result = Utils.getWorkspaceRoot()
    assert.strictEqual(result, workspaceFolders[0].uri)
  })

  test('getWorkspaceRoot, with workspace file', async () => {
    const uri = vscode.Uri.parse('file:///path/to/workspace/')
    const workspaceFolders: vscode.WorkspaceFolder[] = [
      {
        uri: uri,
        name: 'Workspace',
        index: 0,
      },
    ]

    sandbox
      .stub(vscode.workspace, 'workspaceFolders')
      .get(() => workspaceFolders)
    sandbox
      .stub(vscode.workspace, 'workspaceFile')
      .value(uri.with({path: uri.path + '/workspace.code-workspace'}))

    const result = Utils.getWorkspaceRoot()
    assert.strictEqual(result?.toString(), uri.toString())
  })

  test('removeAnsiEscapeCodes', async () => {
    const testCases = [
      {
        input: '\x1b[31mRed Text\x1b[0m',
        expected: 'Red Text',
        scenario: 'Color Code Removal',
      },
      {
        input: '\x1b[1mBold\x1b[0m and \x1b[4mUnderlined\x1b[0m',
        expected: 'Bold and Underlined',
        scenario: 'Text Formatting Removal',
      },
      {
        input: '\x1b[2J\x1b[;H',
        expected: '',
        scenario: 'Complex Sequence Handling',
      },
      {
        input: '\x1b]0;Custom Title\x07',
        expected: '',
        scenario: 'Custom Escape Sequence Removal',
      },
      {
        input: '\x1b[1;31mBold and Red\x1b[0m normal \x1b]0;Title\x07',
        expected: 'Bold and Red normal ',
        scenario: 'Mixed Sequences Removal',
      },
      {
        input: 'Just plain text without any escapes',
        expected: 'Just plain text without any escapes',
        scenario: 'No Escape Sequences',
      },
    ]

    // Iterate through each test case and assert conditions
    testCases.forEach(({input, expected, scenario}) => {
      assert.strictEqual(
        Utils.removeAnsiEscapeCodes(input),
        expected,
        `Scenario failed: ${scenario}`
      )
    })
  })

  test('gunzip successful decompression', async () => {
    const originalData = 'Hello, World!'
    const compressedData = zlib.gzipSync(Buffer.from(originalData))

    const result = await Utils.gunzip(compressedData)
    assert.strictEqual(result.toString(), originalData)
  })

  test('gunzip handles invalid data', async () => {
    const invalidData = Buffer.from('not compressed data')

    try {
      await Utils.gunzip(invalidData)
      assert.fail('Should have thrown an error')
    } catch (error) {
      assert.ok(error instanceof Error)
    }
  })

  test('detectIdeClient with different environments', async () => {
    const processEnv = process.env

    const testCases = [
      {
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/path/to/.vscode/remote-cli',
          __CFBundleIdentifier: '',
        },
        expected: 'vscode',
        name: 'VSCode remote',
      },
      {
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
          __CFBundleIdentifier: 'com.microsoft.VSCode',
        },
        expected: 'vscode',
        name: 'VSCode local',
      },
      {
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:/path/to/.cursor/remote-cli',
          __CFBundleIdentifier: '',
        },
        expected: 'cursor',
        name: 'Cursor remote',
      },
      {
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
          __CFBundleIdentifier: 'com.todesktop.230313mzl4w4u92',
        },
        expected: 'cursor',
        name: 'Cursor local',
      },
      {
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
          __CFBundleIdentifier: 'com.microsoft.VSCodeInsiders',
        },
        expected: 'vscode-insiders',
        name: 'VSCode Insiders local',
      },
      {
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin',
          __CFBundleIdentifier: '',
        },
        expected: 'unknown',
        name: 'Unknown IDE',
      },
    ]

    try {
      for (const {env, expected, name} of testCases) {
        process.env = env
        const result = detectIdeClient()
        assert.strictEqual(result, expected, `Failed: ${name}`)
      }
    } finally {
      process.env = processEnv
    }
  })
})

suite('Deferred Promise Test Suite', () => {
  test('promise resolved', async () => {
    const deferred = new Deferred<number>()
    deferred.resolve(42)
    const result = await deferred.promise
    assert.equal(result, 42)
  })

  test('promise rejected', async () => {
    const deferred = new Deferred<number>()
    const sampleErr = new Error('sample error')
    deferred.reject(sampleErr)

    try {
      const result = await deferred.promise
      assert.fail('Promise should not be resolved')
    } catch (e) {
      assert.equal(e, sampleErr)
    }
  })
})
