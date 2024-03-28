import {TestItem} from 'vscode'
import {BuildTargetIdentifier} from '../bsp/bsp'

export enum TestItemType {
  Root,
  BazelTarget,
  SourceDirectory,
  SourceFile,
  TestSuite,
  TestCase,
}

export class TestCaseInfo {
  public readonly type: TestItemType
  public readonly languageIds: string[]
  public readonly target: BuildTargetIdentifier | undefined

  private test: TestItem

  constructor(
    test: TestItem,
    type: TestItemType,
    languageIds?: string[],
    target?: BuildTargetIdentifier
  ) {
    this.test = test
    this.type = type
    this.languageIds = languageIds ?? []
    this.target = target
  }
}
