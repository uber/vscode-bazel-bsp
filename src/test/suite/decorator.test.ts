import * as vscode from 'vscode'
import * as assert from 'assert'
import {Test} from '@nestjs/testing'
import {beforeEach, afterEach} from 'mocha'
import * as sinon from 'sinon'
import * as path from 'path'

import {SyncHintDecorationsManager} from '../../test-explorer/decorator'
import {EXTENSION_CONTEXT_TOKEN} from '../../custom-providers'
import {TestCaseStore} from '../../test-explorer/store'
import {
  LanguageToolManager,
  TestFileContents,
} from '../../language-tools/manager'

const fixtureDir = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'src',
  'test',
  'testdata'
)

suite('SyncHintDecorationsManager', () => {
  let manager: SyncHintDecorationsManager
  let ctx: vscode.ExtensionContext
  let storeMock: sinon.SinonStubbedInstance<TestCaseStore>
  let languageToolManagerMock: sinon.SinonStubbedInstance<LanguageToolManager>
  let registerCommandStub: sinon.Stub
  let setDecorationsStub: sinon.Stub

  const sandbox = sinon.createSandbox()

  const sampleContents: TestFileContents = {
    isTestFile: true,
    testCases: [
      {
        name: 'testCase1',
        range: new vscode.Range(1, 2, 3, 4),
        uri: vscode.Uri.file(
          path.join(fixtureDir, 'SampleValidExampleTest.java')
        ),
        testFilter: '',
      },
      {
        name: 'testCase2',
        range: new vscode.Range(5, 6, 7, 8),
        uri: vscode.Uri.file(
          path.join(fixtureDir, 'SampleValidExampleTest.java')
        ),
        testFilter: '',
      },
      {
        name: 'testCase3',
        range: new vscode.Range(9, 10, 11, 12),
        uri: vscode.Uri.file(
          path.join(fixtureDir, 'SampleValidExampleTest.java')
        ),
        testFilter: '',
      },
    ],
  }

  beforeEach(async () => {
    ctx = {
      subscriptions: [],
      asAbsolutePath: sinon.stub().returns('/path/to/resources/gutter.svg'),
    } as unknown as vscode.ExtensionContext

    storeMock = sandbox.createStubInstance(TestCaseStore)
    languageToolManagerMock = sandbox.createStubInstance(LanguageToolManager)
    registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand')
    setDecorationsStub = sandbox.stub()

    const moduleRef = await Test.createTestingModule({
      providers: [
        SyncHintDecorationsManager,
        {provide: EXTENSION_CONTEXT_TOKEN, useValue: ctx},
        {provide: TestCaseStore, useValue: storeMock},
        {provide: LanguageToolManager, useValue: languageToolManagerMock},
      ],
    }).compile()

    manager = moduleRef.get(SyncHintDecorationsManager)
  })

  afterEach(() => {
    sandbox.restore()
  })

  test('onModuleInit', async () => {
    const createTextEditorDecorationTypeSpy = sandbox.spy(
      vscode.window,
      'createTextEditorDecorationType'
    )
    manager.onModuleInit()
    assert.ok(registerCommandStub.calledOnceWith('bazelbsp.openProjectView'))
    assert.ok(createTextEditorDecorationTypeSpy.calledOnce)
  })

  test('enable and disable', async () => {
    setDecorationsStub
      .onFirstCall()
      .callsFake(
        (
          type: vscode.TextEditorDecorationType,
          decorations: vscode.DecorationOptions[]
        ) => {
          assert.equal(decorations.length, sampleContents.testCases.length)
          for (const i in decorations) {
            // Single line decoration gets added at the start of each test case.
            assert.ok(decorations[i].range.isSingleLine)
            assert.equal(
              sampleContents.testCases[i].range.start,
              decorations[i].range.start
            )
          }
        }
      )

    const disposeStub = sandbox.stub()
    const editorStub = {
      document: {
        uri: vscode.Uri.parse('file:///path/to/SampleValidExampleTest.java'),
      },
      setDecorations: setDecorationsStub,
    } as unknown as vscode.TextEditor
    const watcherStub = sandbox
      .stub(vscode.window, 'onDidChangeActiveTextEditor')
      .returns({dispose: disposeStub})

    sandbox.stub(vscode.window, 'visibleTextEditors').get(() => [editorStub])

    // Enable decorations for this document.
    manager.enable(editorStub.document.uri, '/sample/', sampleContents)
    assert.ok(watcherStub.calledOnce)

    // Disable sets decorations back to blank.
    manager.disable(editorStub.document.uri)
    assert.ok(disposeStub.calledOnce)
    assert.ok(setDecorationsStub.lastCall.args[1].length === 0) // Decorations get cleared
  })

  test('enable multiple times', async () => {
    setDecorationsStub.callsFake(
      (
        type: vscode.TextEditorDecorationType,
        decorations: vscode.DecorationOptions[]
      ) => {
        assert.equal(decorations.length, sampleContents.testCases.length)
        for (const i in decorations) {
          // Single line decoration gets added at the start of each test case.
          assert.ok(decorations[i].range.isSingleLine)
          assert.equal(
            sampleContents.testCases[i].range.start,
            decorations[i].range.start
          )
        }
      }
    )

    const disposeStub = sandbox.stub()
    const editorStub = {
      document: {
        uri: vscode.Uri.parse('file:///path/to/SampleValidExampleTest.java'),
      },
      setDecorations: setDecorationsStub,
    } as unknown as vscode.TextEditor
    const watcherStub = sandbox
      .stub(vscode.window, 'onDidChangeActiveTextEditor')
      .returns({dispose: disposeStub})

    sandbox.stub(vscode.window, 'visibleTextEditors').get(() => [editorStub])

    // Enable decorations for this document.
    manager.enable(editorStub.document.uri, '/sample/', sampleContents)
    manager.enable(editorStub.document.uri, '/sample/', sampleContents)
    manager.enable(editorStub.document.uri, '/sample/', sampleContents)
    assert.equal(watcherStub.callCount, 3)
    assert.equal(setDecorationsStub.callCount, 3)
    assert.equal(disposeStub.callCount, 2)
  })

  test('disable nonexistent entry', async () => {
    const disposeStub = sandbox.stub()
    const editorStub = {
      document: {
        uri: vscode.Uri.parse('file:///path/to/SampleValidExampleTest.java'),
      },
      setDecorations: setDecorationsStub,
    } as unknown as vscode.TextEditor

    manager.disable(editorStub.document.uri)
    assert.ok(disposeStub.notCalled)
    assert.ok(setDecorationsStub.notCalled)
  })
})
