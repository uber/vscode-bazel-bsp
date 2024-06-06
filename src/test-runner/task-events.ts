import {
  TaskStartParams,
  TaskFinishParams,
  TaskId,
  BuildTargetIdentifier,
  TaskStartDataKind,
  TestTask,
} from '../bsp/bsp'

export type TaskEventCollector = {
  startParams: TaskStartParams
  parents: TaskEventCollector[]
  finishParams?: TaskFinishParams
}

export class TaskEventTracker {
  private entries: Map<string, TaskEventCollector> = new Map()

  addTaskStart(params: TaskStartParams) {
    const newEntry: TaskEventCollector = {
      startParams: params,
      parents: [],
    }

    for (const parentId of params.taskId.parents ?? []) {
      const parent = this.entries.get(parentId)
      if (parent) {
        newEntry.parents.push(parent)
      }
    }

    this.entries.set(params.taskId.id, newEntry)
  }

  addTaskFinish(params: TaskFinishParams) {
    const entry = this.entries.get(params.taskId.id)
    if (entry) {
      entry.finishParams = params
    }
  }

  getTaskEvent(id: string): TaskEventCollector | undefined {
    return this.entries.get(id)
  }

  getBuildTargetId(id: string): BuildTargetIdentifier | undefined {
    let current = this.entries.get(id)
    while (current?.startParams.dataKind !== TaskStartDataKind.TestTask) {
      const firstParent = current?.parents[0]
      if (firstParent === undefined) return
      current = firstParent
    }

    if (current.startParams.dataKind === TaskStartDataKind.TestTask) {
      const testTask = current.startParams.data as TestTask
      return testTask.target
    }

    return undefined
  }
}
