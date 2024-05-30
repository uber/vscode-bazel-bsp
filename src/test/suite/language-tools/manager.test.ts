import * as assert from 'assert'
import {beforeEach, afterEach} from 'mocha'
import {LanguageToolManager} from '../../../language-tools/manager'
import {BuildTarget} from '../../../bsp/bsp'

suite('Language Tools Manager', () => {
  let languageTools: LanguageToolManager
  beforeEach(async () => {
    languageTools = new LanguageToolManager()
  })

  afterEach(() => {})

  test('get tools, python', async () => {
    const target: BuildTarget = {
      id: {
        uri: '@@//sample:target',
      },
      tags: [],
      languageIds: ['python'],
      dependencies: [],
      capabilities: {},
    }
    const result = languageTools.getLanguageTools(target)
    assert.strictEqual(result.constructor.name, 'PythonLanguageTools')
  })

  test('get tools, java', async () => {
    const target: BuildTarget = {
      id: {
        uri: '@@//sample:target',
      },
      tags: [],
      languageIds: ['java'],
      dependencies: [],
      capabilities: {},
    }
    const result = languageTools.getLanguageTools(target)
    assert.strictEqual(result.constructor.name, 'JavaLanguageTools')
  })

  test('get tools, other', async () => {
    const target: BuildTarget = {
      id: {
        uri: '@@//sample:target',
      },
      tags: [],
      languageIds: ['other'],
      dependencies: [],
      capabilities: {},
    }
    const result = languageTools.getLanguageTools(target)
    assert.strictEqual(result.constructor.name, 'BaseLanguageTools')
  })
})
