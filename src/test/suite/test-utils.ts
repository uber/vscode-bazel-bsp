import * as vscode from 'vscode'
import {Writable, Readable} from 'stream'
import * as rpc from 'vscode-jsonrpc/node'
import {TestCaseStore} from '../../test-explorer/store'
import {
  BuildTargetTestCaseInfo,
  TestCaseInfo,
  TestItemType,
} from '../../test-info/test-info'
import {BuildTarget, BuildTargetIdentifier} from '../../bsp/bsp'

/**
 * Creates a sample MessageConnection instance bound to no-op read/write streams.
 * @returns A sample MessageConnection instance. Tests may stub methods on this instance as needed.
 */
export function createSampleMessageConnection(): rpc.MessageConnection {
  const noopReadStream = new Readable({read(size) {}})
  const noopWriteStream = new Writable({
    write(chunk, encoding, callback) {
      callback()
    },
  })
  return rpc.createMessageConnection(
    new rpc.StreamMessageReader(noopReadStream),
    new rpc.StreamMessageWriter(noopWriteStream)
  )
}

export const sampleTestData = [
  {
    id: 'target1',
    label: 'Target 1',
    children: [
      {id: 'test1_1', label: 'Test 1.1', type: TestItemType.TestCase},
      {id: 'test1_2', label: 'Test 1.2', type: TestItemType.TestCase},
      {
        id: 'target3',
        label: 'Target 3',
        children: [
          {id: 'test1_1', label: 'Test 1.1', type: TestItemType.TestCase},
          {id: 'test1_2', label: 'Test 1.2', type: TestItemType.TestCase},
        ],
        type: TestItemType.BazelTarget,
      },
    ],
    type: TestItemType.BazelTarget,
  },
  {
    id: 'target2',
    label: 'Target 2',
    children: [
      {
        id: 'suite2_1',
        label: 'Suite 2.1',
        children: [
          {
            id: 'test2_1_1',
            label: 'Test 2.1.1',
            type: TestItemType.TestCase,
          },
          {
            id: 'test2_1_2',
            label: 'Test 2.1.2',
            type: TestItemType.TestCase,
          },
        ],
        type: TestItemType.TestSuite,
      },
      {id: 'test2_2', label: 'Test 2.2', type: TestItemType.TestCase},
    ],
    type: TestItemType.BazelTarget,
  },
]

export function sampleBuildTarget(): BuildTarget {
  return {
    id: {uri: 'sample'},
    tags: [],
    languageIds: [],
    dependencies: [],
    capabilities: {},
  }
}

export function populateTestCaseStore(store: TestCaseStore) {
  const createTestItems = (parent: vscode.TestItem | undefined, items) => {
    items.forEach(item => {
      const testItem = store.testController.createTestItem(item.id, item.label)

      if (item.type === TestItemType.BazelTarget) {
        const target: BuildTarget = {
          id: {uri: item.id},
          tags: [],
          languageIds: [],
          dependencies: [],
          capabilities: {},
        }
        store.testCaseMetadata.set(
          testItem,
          new BuildTargetTestCaseInfo(testItem, target)
        )
      } else {
        store.testCaseMetadata.set(
          testItem,
          new TestCaseInfo(testItem, undefined, item.type)
        )
      }

      if (parent) {
        parent.children.add(testItem)
      } else {
        store.testController.items.add(testItem)
      }

      if (item.children) {
        createTestItems(testItem, item.children)
      }
    })
  }
  createTestItems(undefined, sampleTestData)
}
