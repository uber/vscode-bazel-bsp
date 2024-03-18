import * as vscode from 'vscode'
import * as assert from 'assert'
import sinon from 'sinon'
import {afterEach} from 'mocha'

import {Deferred, Utils} from '../../utils/utils'

suite('Utils Test Suite', () => {
  afterEach(() => {
    sinon.restore()
  })

  test('getWorkspaceRoot, no workspace folders', async () => {
    sinon.stub(vscode.workspace, 'workspaceFolders').value(undefined)

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
    sinon.stub(vscode.workspace, 'workspaceFolders').get(() => workspaceFolders)
    sinon.stub(vscode.workspace, 'workspaceFile').value(undefined)

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

    sinon.stub(vscode.workspace, 'workspaceFolders').get(() => workspaceFolders)
    sinon
      .stub(vscode.workspace, 'workspaceFile')
      .value(uri.with({path: uri.path + '/workspace.code-workspace'}))

    const result = Utils.getWorkspaceRoot()
    assert.strictEqual(result?.toString(), uri.toString())
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
