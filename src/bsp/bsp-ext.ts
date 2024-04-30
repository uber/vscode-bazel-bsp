/* eslint-disable @typescript-eslint/no-namespace */

// This file contains extensions to the protocol which are supported by Bazel BSP but not yet added to the base protocol.

export namespace TestParamsDataKind {
  export const BazelTest = 'bazel-test'
}

export interface BazelTestParamsData {
  coverage?: boolean
}
