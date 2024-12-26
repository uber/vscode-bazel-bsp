/* eslint-disable @typescript-eslint/no-namespace */

// This file contains extensions to the protocol which are supported by Bazel BSP but not yet added to the base protocol.
import {
  RequestType,
  RequestType0,
  RequestHandler,
  RequestHandler0,
  NotificationType,
  NotificationHandler,
} from 'vscode-jsonrpc'
import {MessageConnection} from 'vscode-jsonrpc/node'
import * as bsp from './bsp'

export namespace TestParamsDataKind {
  export const BazelTest = 'bazel-test'
}

export interface BazelTestParamsData {
  coverage?: boolean
  testFilter?: string
  additionalBazelParams?: string
}

export namespace OnBuildPublishOutput {
  // eslint-disable-next-line @typescript-eslint/prefer-as-const
  export const method: 'build/publishOutput' = 'build/publishOutput'
  export const type = new NotificationType<PublishOutputParams>(method)
  export type HandlerSignature = NotificationHandler<PublishOutputParams>
}

export interface PublishOutputParams {
  originId: string
  taskId?: bsp.TaskId
  buildTarget?: bsp.BuildTargetIdentifier
  dataKind: string
  data: any
}

export namespace PublishOutputDataKind {
  export const CoverageReport = 'coverage-report'
}

export interface TestCoverageReport {
  lcovReportUri: string
}

export interface ExtendedBuildClient {
  onBuildPublishOutput: OnBuildPublishOutput.HandlerSignature
}

export function registerExtendedBuildClientHandlers(
  connection: MessageConnection,
  handlers: ExtendedBuildClient
) {
  connection.onNotification(
    OnBuildPublishOutput.type,
    handlers.onBuildPublishOutput.bind(handlers)
  )
}

export namespace TestFinishDataKind {
  export const JUnitStyleTestCaseData = 'junit-style-test-case-data'
}

export interface JUnitStyleTestCaseData {
  time: number
  className?: string
  pkg?: string
  fullError?: string
  errorType?: string
}
