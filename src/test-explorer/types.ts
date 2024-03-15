export enum TestItemType {
  Root,
  BazelTarget,
  SourceDirectory,
  SourceFile,
  TestSuite,
  TestCase,
}

export interface TestCaseInfo {
  type: TestItemType
  target?: string
  testFilters?: string[]
  resolver?: boolean
}
