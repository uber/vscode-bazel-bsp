import * as assert from 'assert'
import {beforeEach} from 'mocha'
import {TaskEventTracker} from '../../test-runner/task-events'
import {
  StatusCode,
  TaskFinishDataKind,
  TaskStartDataKind,
  TestStatus,
} from '../../bsp/bsp'
import {TestFinishDataKind} from '../../bsp/bsp-ext'

suite('Task Events Tracker', () => {
  let tracker: TaskEventTracker

  beforeEach(async () => {
    tracker = new TaskEventTracker()
  })

  test('Get build target from task', async () => {
    for (let i = 0; i < sampleEvents.length; i++) {
      tracker.addTaskStart(sampleEvents[i].start)
    }

    for (let i = sampleEvents.length - 1; i >= 0; i--) {
      tracker.addTaskFinish(sampleEvents[i].finish)
    }

    // Accurately get the target from any subtasks.
    let result = tracker.getBuildTargetId('task2')
    assert.deepStrictEqual(result, {uri: 'sample'})

    result = tracker.getBuildTargetId('task1')
    assert.deepStrictEqual(result, {uri: 'sample'})
  })

  test('Retrieve existing event', async () => {
    for (let i = 0; i < sampleEvents.length; i++) {
      tracker.addTaskStart(sampleEvents[i].start)
    }

    for (let i = sampleEvents.length - 1; i >= 0; i--) {
      tracker.addTaskFinish(sampleEvents[i].finish)
    }

    let result = tracker.getTaskEvent('task2')
    assert.deepStrictEqual(result?.startParams, sampleEvents[1].start)
    assert.deepStrictEqual(result?.finishParams, sampleEvents[1].finish)

    result = tracker.getTaskEvent('task1')
    assert.deepStrictEqual(result?.startParams, sampleEvents[0].start)
    assert.deepStrictEqual(result?.finishParams, sampleEvents[0].finish)
  })
})

const sampleEvents = [
  {
    start: {
      originId: 'sample',
      taskId: {id: 'task1', parents: []},
      message: 'task1 started',
      dataKind: TaskStartDataKind.TestTask,
      data: {
        target: {
          uri: 'sample',
        },
      },
    },
    finish: {
      originId: 'sample',
      taskId: {id: 'task1', parents: []},
      status: StatusCode.Ok,
      message: 'task1 finished',
    },
  },
  {
    start: {
      originId: 'sample',
      taskId: {id: 'task2', parents: ['task1']},
      message: 'task1 started',
      dataKind: TaskStartDataKind.TestStart,
    },
    finish: {
      originId: 'sample',
      taskId: {id: 'task2', parents: ['task1']},
      status: StatusCode.Ok,
      message: 'task2 finished',
      dataKind: TaskFinishDataKind.TestFinish,
      data: {
        displayName: 'test1_1',
        status: TestStatus.Passed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'sample',
          displayName: 'sample test',
        },
      },
    },
  },
  {
    start: {
      originId: 'sample',
      taskId: {id: 'task3', parents: ['task1']},
      message: 'task3 started',
      dataKind: TaskStartDataKind.TestStart,
    },
    finish: {
      originId: 'sample',
      taskId: {id: 'task3', parents: ['task1']},
      status: StatusCode.Ok,
      message: 'task3 finished',
      dataKind: TaskFinishDataKind.TestFinish,
      data: {
        displayName: 'test1_2',
        status: TestStatus.Failed,
        dataKind: TestFinishDataKind.JUnitStyleTestCaseData,
        data: {
          time: 0,
          className: 'sample',
          displayName: 'sample test',
        },
      },
    },
  },
]
