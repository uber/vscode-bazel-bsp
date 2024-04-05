import * as assert from 'assert'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as rpc from 'vscode-jsonrpc'
import path from 'path'

import {
  contextProviderFactory,
  outputChannelProvider,
} from '../../custom-providers'
import {ConnectionDetailsParser} from '../../rpc/connection-details'
import {Utils} from '../../utils/utils'

suite('Connection Info Parser', () => {
  let ctx: vscode.ExtensionContext
  let connectionDetailsParser: ConnectionDetailsParser
  let sampleConn: rpc.MessageConnection

  const sandbox = sinon.createSandbox()
  const testDir = '/sample/root'

  beforeEach(async () => {
    sandbox.stub(rpc, 'createMessageConnection').returns(sampleConn)
    sandbox.stub(Utils, 'getWorkspaceGitRoot').resolves('/sample/path')

    ctx = {subscriptions: []} as unknown as vscode.ExtensionContext
    const moduleRef = await Test.createTestingModule({
      providers: [
        outputChannelProvider,
        contextProviderFactory(ctx),
        ConnectionDetailsParser,
      ],
    }).compile()

    connectionDetailsParser = moduleRef.get(ConnectionDetailsParser)
  })

  afterEach(() => {
    sandbox.restore()
  })

  test('empty file', async () => {
    const paths = ['/path/1']
    sandbox.stub(Utils, 'readdir').resolves(paths)
    sandbox.stub(Utils, 'readFile').resolves('')
    const result = await connectionDetailsParser.getServerConnectionDetails(
      'sample',
      testDir
    )
    assert.equal(result, undefined)
  })

  test('not installed', async () => {
    const paths = ['/repo/root/.bsp/sample1.json']
    sandbox.stub(Utils, 'readdir').rejects(new Error('nonexistent dir'))
    const result = await connectionDetailsParser.getServerConnectionDetails(
      'sample',
      testDir
    )
    assert.equal(result, undefined)
  })

  const testCases = [
    {
      name: 'no match',
      expectedResultIndex: undefined,
      configs: [
        {
          name: 'other',
          version: '1.0',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0',
        },
      ],
    },
    {
      name: 'valid single entry',
      expectedResultIndex: 0,
      configs: [
        {
          name: 'sample',
          version: '1.0',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0',
        },
      ],
    },
    {
      name: 'multiple versions and build servers',
      expectedResultIndex: 1,
      configs: [
        {
          name: 'sample',
          version: '1.0.0',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.0',
        },
        {
          name: 'sample',
          version: '1.1.1',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.1',
        },
        {
          name: 'sample',
          version: '1.1.1-NIGHTLY',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.1',
        },
        {
          name: 'other',
          version: '1.1.0',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.0',
        },
      ],
    },
    {
      name: 'multiple servers, no match',
      expectedResultIndex: undefined,
      configs: [
        {
          name: 'other1',
          version: '1.0.0',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.0',
        },
        {
          name: 'other2',
          version: '1.1.1',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.1',
        },
        {
          name: 'other3',
          version: '1.1.1-NIGHTLY',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.1',
        },
        {
          name: 'other4',
          version: '1.1.0',
          argv: ['/bin/path/', '--foo', '--bar'],
          languages: ['scala'],
          bspVersion: '2.0.0',
        },
      ],
    },
  ]

  for (const testCase of testCases) {
    test(testCase.name, async () => {
      const lookupMap: Map<string, string> = new Map()
      const fileNames = testCase.configs.map(config => {
        const currentPathBase = `${config.name + config.version}.json`
        const currentPathAbs = path.join(testDir, '.bsp', currentPathBase)
        lookupMap.set(currentPathAbs, JSON.stringify(config))
        return currentPathBase
      })

      sandbox.stub(Utils, 'readdir').resolves(fileNames)
      sandbox.stub(Utils, 'readFile').callsFake((path: string) => {
        return Promise.resolve(lookupMap.get(path) ?? '')
      })

      const result = await connectionDetailsParser.getServerConnectionDetails(
        'sample',
        testDir
      )
      if (testCase.expectedResultIndex === undefined) {
        assert.equal(result, undefined)
        return
      }
      assert.deepEqual(result, testCase.configs[testCase.expectedResultIndex])
    })
  }
})
