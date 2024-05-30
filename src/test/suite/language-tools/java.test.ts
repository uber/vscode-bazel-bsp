import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import {beforeEach} from 'mocha'
import {JavaLanguageTools} from '../../../language-tools/java'

const fixtureDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src',
  'test',
  'testdata'
)

suite('Java Language Tools', () => {
  let languageTools: JavaLanguageTools
  beforeEach(async () => {
    languageTools = new JavaLanguageTools()
  })

  test('process test cases', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.file(
        path.join(fixtureDir, 'language_files', 'SampleValidExampleTest.java')
      )
    )

    assert.strictEqual(result.isTestFile, true)
    assert.strictEqual(result.testCases.length, 2)

    const expectedBaseTestFilter =
      'com.sample.project.common.client.samplepackage.SampleValidExampleTest'

    const expectedTests = ['testGetInstance', 'testGetSampleClient']
    for (const test of result.testCases) {
      assert.ok(expectedTests.includes(test.name))
      assert.ok(test.testFilter.startsWith(expectedBaseTestFilter))
      assert.ok(test.testFilter.endsWith(test.name))
    }
    assert.equal(result.documentTest?.testFilter, expectedBaseTestFilter)
    assert.equal(result.documentTest?.name, 'SampleValidExampleTest')
  })

  test('no matching test class name', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.file(
        path.join(fixtureDir, 'language_files', 'SampleInvalidTest.java')
      )
    )

    assert.strictEqual(result.isTestFile, true)
    assert.strictEqual(result.testCases.length, 0)
  })

  test('non test file', async () => {
    const result = await languageTools.getDocumentTestCases(
      vscode.Uri.parse('file:///sample/OtherFile.java')
    )
    assert.strictEqual(result.isTestFile, false)
    assert.strictEqual(result.testCases.length, 0)
  })
})
