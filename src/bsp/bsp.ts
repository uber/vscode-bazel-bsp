/**
 *
 * GENERATED FILE - DO NOT EDIT
 * This file is generated based on code included in the following Pull Request:
 *    https://github.com/agluszak/bsp-generators/pull/24
 *
 * Once those changes are reviewed and merged, we will import this code as an NPM package.
 * In the meantime, we will keep a checked-in copy here to begin work on the client.
 */

/* eslint-disable */

import { RequestType, RequestType0, RequestHandler, RequestHandler0, NotificationType, NotificationHandler } from 'vscode-jsonrpc'
import { MessageConnection } from 'vscode-jsonrpc/node'

export namespace Bsp4Ts {
  export const ProtocolVersion: string = "2.2.0"
}

export interface Range {
  start: Position
  end: Position
}

export interface CompileResult {
  originId?: string
  statusCode: StatusCode
  dataKind?: string
  data?: any
}

export type DiagnosticCode = string | number

export interface WorkspaceBuildTargetsResult {
  targets: BuildTarget[]
}

export interface TestFinish {
  displayName: string
  message?: string
  status: TestStatus
  location?: Location
  dataKind?: string
  data?: any
}

export interface DependencySourcesResult {
  items: DependencySourcesItem[]
}

export namespace InitializeBuildParamsDataKind {}

export type InitializeBuildParamsDataKind = string

export namespace BuildTargetTag {
  export const Application = "application"
  export const Benchmark = "benchmark"
  export const IntegrationTest = "integration-test"
  export const Library = "library"
  export const Manual = "manual"
  export const NoIde = "no-ide"
  export const Test = "test"
}

export type BuildTargetTag = string

export interface Position {
  line: number
  character: number
}

export interface BspConnectionDetails {
  name: string
  argv: string[]
  version: string
  bspVersion: string
  languages: string[]
}

export interface TestProvider {
  languageIds: string[]
}

export interface RunParams {
  target: BuildTargetIdentifier
  originId?: string
  arguments?: string[]
  environmentVariables?: { [key: string]: string }
  workingDirectory?: string
  dataKind?: string
  data?: any
}

export interface InverseSourcesParams {
  textDocument: TextDocumentIdentifier
}

export interface TaskProgressParams {
  taskId: TaskId
  originId?: string
  eventTime?: number
  message?: string
  total?: number
  progress?: number
  unit?: string
  dataKind?: string
  data?: any
}

export interface PrintParams {
  originId: string
  task?: TaskId
  message: string
}

export interface TaskStartParams {
  taskId: TaskId
  originId?: string
  eventTime?: number
  message?: string
  dataKind?: string
  data?: any
}

export interface OutputPathsResult {
  items: OutputPathsItem[]
}

export interface CompileReport {
  target: BuildTargetIdentifier
  originId?: string
  errors: number
  warnings: number
  time?: number
  noOp?: boolean
}

export interface BuildTargetIdentifier {
  uri: string
}

export namespace DiagnosticTag {
  export const Unnecessary = 1
  export const Deprecated = 2
}

export type DiagnosticTag = number

export enum TestStatus {
  Passed = 1,
  Failed = 2,
  Ignored = 3,
  Cancelled = 4,
  Skipped = 5
}

export namespace BuildInitialize {
  export const method: 'build/initialize' = 'build/initialize'
  export const type = new RequestType<InitializeBuildParams, InitializeBuildResult, void>(method)
  export type HandlerSignature = RequestHandler<InitializeBuildParams, InitializeBuildResult, void>
}

export namespace OnBuildInitialized {
  export const method: 'build/initialized' = 'build/initialized'
  export const type = new NotificationType<void>(method)
  export type HandlerSignature = NotificationHandler<void>
}

export namespace BuildShutdown {
  export const method: 'build/shutdown' = 'build/shutdown'
  export const type = new RequestType0<void, void>(method)
  export type HandlerSignature = RequestHandler0<void, void>
}

export namespace OnBuildExit {
  export const method: 'build/exit' = 'build/exit'
  export const type = new NotificationType<void>(method)
  export type HandlerSignature = NotificationHandler<void>
}

export namespace WorkspaceBuildTargets {
  export const method: 'workspace/buildTargets' = 'workspace/buildTargets'
  export const type = new RequestType0<WorkspaceBuildTargetsResult, void>(method)
  export type HandlerSignature = RequestHandler0<WorkspaceBuildTargetsResult, void>
}

export namespace WorkspaceReload {
  export const method: 'workspace/reload' = 'workspace/reload'
  export const type = new RequestType0<void, void>(method)
  export type HandlerSignature = RequestHandler0<void, void>
}

export namespace BuildTargetSources {
  export const method: 'buildTarget/sources' = 'buildTarget/sources'
  export const type = new RequestType<SourcesParams, SourcesResult, void>(method)
  export type HandlerSignature = RequestHandler<SourcesParams, SourcesResult, void>
}

export namespace BuildTargetInverseSources {
  export const method: 'buildTarget/inverseSources' = 'buildTarget/inverseSources'
  export const type = new RequestType<InverseSourcesParams, InverseSourcesResult, void>(method)
  export type HandlerSignature = RequestHandler<InverseSourcesParams, InverseSourcesResult, void>
}

export namespace BuildTargetDependencySources {
  export const method: 'buildTarget/dependencySources' = 'buildTarget/dependencySources'
  export const type = new RequestType<DependencySourcesParams, DependencySourcesResult, void>(method)
  export type HandlerSignature = RequestHandler<DependencySourcesParams, DependencySourcesResult, void>
}

export namespace BuildTargetDependencyModules {
  export const method: 'buildTarget/dependencyModules' = 'buildTarget/dependencyModules'
  export const type = new RequestType<DependencyModulesParams, DependencyModulesResult, void>(method)
  export type HandlerSignature = RequestHandler<DependencyModulesParams, DependencyModulesResult, void>
}

export namespace BuildTargetResources {
  export const method: 'buildTarget/resources' = 'buildTarget/resources'
  export const type = new RequestType<ResourcesParams, ResourcesResult, void>(method)
  export type HandlerSignature = RequestHandler<ResourcesParams, ResourcesResult, void>
}

export namespace BuildTargetOutputPaths {
  export const method: 'buildTarget/outputPaths' = 'buildTarget/outputPaths'
  export const type = new RequestType<OutputPathsParams, OutputPathsResult, void>(method)
  export type HandlerSignature = RequestHandler<OutputPathsParams, OutputPathsResult, void>
}

export namespace BuildTargetCompile {
  export const method: 'buildTarget/compile' = 'buildTarget/compile'
  export const type = new RequestType<CompileParams, CompileResult, void>(method)
  export type HandlerSignature = RequestHandler<CompileParams, CompileResult, void>
}

export namespace BuildTargetRun {
  export const method: 'buildTarget/run' = 'buildTarget/run'
  export const type = new RequestType<RunParams, RunResult, void>(method)
  export type HandlerSignature = RequestHandler<RunParams, RunResult, void>
}

export namespace BuildTargetTest {
  export const method: 'buildTarget/test' = 'buildTarget/test'
  export const type = new RequestType<TestParams, TestResult, void>(method)
  export type HandlerSignature = RequestHandler<TestParams, TestResult, void>
}

export namespace DebugSessionStart {
  export const method: 'debugSession/start' = 'debugSession/start'
  export const type = new RequestType<DebugSessionParams, DebugSessionAddress, void>(method)
  export type HandlerSignature = RequestHandler<DebugSessionParams, DebugSessionAddress, void>
}

export namespace BuildTargetCleanCache {
  export const method: 'buildTarget/cleanCache' = 'buildTarget/cleanCache'
  export const type = new RequestType<CleanCacheParams, CleanCacheResult, void>(method)
  export type HandlerSignature = RequestHandler<CleanCacheParams, CleanCacheResult, void>
}

export namespace OnRunReadStdin {
  export const method: 'run/readStdin' = 'run/readStdin'
  export const type = new NotificationType<ReadParams>(method)
  export type HandlerSignature = NotificationHandler<ReadParams>
}

export interface BuildServer {
  buildInitialize: BuildInitialize.HandlerSignature
  onBuildInitialized: OnBuildInitialized.HandlerSignature
  buildShutdown: BuildShutdown.HandlerSignature
  onBuildExit: OnBuildExit.HandlerSignature
  workspaceBuildTargets: WorkspaceBuildTargets.HandlerSignature
  workspaceReload: WorkspaceReload.HandlerSignature
  buildTargetSources: BuildTargetSources.HandlerSignature
  buildTargetInverseSources: BuildTargetInverseSources.HandlerSignature
  buildTargetDependencySources: BuildTargetDependencySources.HandlerSignature
  buildTargetDependencyModules: BuildTargetDependencyModules.HandlerSignature
  buildTargetResources: BuildTargetResources.HandlerSignature
  buildTargetOutputPaths: BuildTargetOutputPaths.HandlerSignature
  buildTargetCompile: BuildTargetCompile.HandlerSignature
  buildTargetRun: BuildTargetRun.HandlerSignature
  buildTargetTest: BuildTargetTest.HandlerSignature
  debugSessionStart: DebugSessionStart.HandlerSignature
  buildTargetCleanCache: BuildTargetCleanCache.HandlerSignature
  onRunReadStdin: OnRunReadStdin.HandlerSignature
}

export function registerBuildServerHandlers(connection: MessageConnection, handlers: BuildServer) {
  connection.onRequest(BuildInitialize.type, handlers.buildInitialize.bind(handlers))
  connection.onNotification(OnBuildInitialized.type, handlers.onBuildInitialized.bind(handlers))
  connection.onRequest(BuildShutdown.type, handlers.buildShutdown.bind(handlers))
  connection.onNotification(OnBuildExit.type, handlers.onBuildExit.bind(handlers))
  connection.onRequest(WorkspaceBuildTargets.type, handlers.workspaceBuildTargets.bind(handlers))
  connection.onRequest(WorkspaceReload.type, handlers.workspaceReload.bind(handlers))
  connection.onRequest(BuildTargetSources.type, handlers.buildTargetSources.bind(handlers))
  connection.onRequest(BuildTargetInverseSources.type, handlers.buildTargetInverseSources.bind(handlers))
  connection.onRequest(BuildTargetDependencySources.type, handlers.buildTargetDependencySources.bind(handlers))
  connection.onRequest(BuildTargetDependencyModules.type, handlers.buildTargetDependencyModules.bind(handlers))
  connection.onRequest(BuildTargetResources.type, handlers.buildTargetResources.bind(handlers))
  connection.onRequest(BuildTargetOutputPaths.type, handlers.buildTargetOutputPaths.bind(handlers))
  connection.onRequest(BuildTargetCompile.type, handlers.buildTargetCompile.bind(handlers))
  connection.onRequest(BuildTargetRun.type, handlers.buildTargetRun.bind(handlers))
  connection.onRequest(BuildTargetTest.type, handlers.buildTargetTest.bind(handlers))
  connection.onRequest(DebugSessionStart.type, handlers.debugSessionStart.bind(handlers))
  connection.onRequest(BuildTargetCleanCache.type, handlers.buildTargetCleanCache.bind(handlers))
  connection.onNotification(OnRunReadStdin.type, handlers.onRunReadStdin.bind(handlers))
}

export interface ResourcesItem {
  target: BuildTargetIdentifier
  resources: string[]
}

export interface OutputPathsItem {
  target: BuildTargetIdentifier
  outputPaths: OutputPathItem[]
}

export namespace RunParamsDataKind {
  export const ScalaMainClass = "scala-main-class"
}

export type RunParamsDataKind = string

export namespace TestParamsDataKind {
  export const ScalaTest = "scala-test"
  export const ScalaTestSuites = "scala-test-suites"
  export const ScalaTestSuitesSelection = "scala-test-suites-selection"
}

export type TestParamsDataKind = string

export interface RunResult {
  originId?: string
  statusCode: StatusCode
}

export interface ResourcesResult {
  items: ResourcesItem[]
}

export interface CompileTask {
  target: BuildTargetIdentifier
}

export interface CleanCacheResult {
  message?: string
  cleaned: boolean
}

export interface TestReport {
  originId?: string
  target: BuildTargetIdentifier
  passed: number
  failed: number
  ignored: number
  cancelled: number
  skipped: number
  time?: number
}

export namespace InitializeBuildResultDataKind {}

export type InitializeBuildResultDataKind = string

export namespace DebugSessionParamsDataKind {
  export const ScalaAttachRemote = "scala-attach-remote"
  export const ScalaMainClass = "scala-main-class"
}

export type DebugSessionParamsDataKind = string

export interface TaskId {
  id: string
  parents?: string[]
}

export namespace OnBuildShowMessage {
  export const method: 'build/showMessage' = 'build/showMessage'
  export const type = new NotificationType<ShowMessageParams>(method)
  export type HandlerSignature = NotificationHandler<ShowMessageParams>
}

export namespace OnBuildLogMessage {
  export const method: 'build/logMessage' = 'build/logMessage'
  export const type = new NotificationType<LogMessageParams>(method)
  export type HandlerSignature = NotificationHandler<LogMessageParams>
}

export namespace OnBuildPublishDiagnostics {
  export const method: 'build/publishDiagnostics' = 'build/publishDiagnostics'
  export const type = new NotificationType<PublishDiagnosticsParams>(method)
  export type HandlerSignature = NotificationHandler<PublishDiagnosticsParams>
}

export namespace OnBuildTargetDidChange {
  export const method: 'buildTarget/didChange' = 'buildTarget/didChange'
  export const type = new NotificationType<DidChangeBuildTarget>(method)
  export type HandlerSignature = NotificationHandler<DidChangeBuildTarget>
}

export namespace OnBuildTaskStart {
  export const method: 'build/taskStart' = 'build/taskStart'
  export const type = new NotificationType<TaskStartParams>(method)
  export type HandlerSignature = NotificationHandler<TaskStartParams>
}

export namespace OnBuildTaskProgress {
  export const method: 'build/taskProgress' = 'build/taskProgress'
  export const type = new NotificationType<TaskProgressParams>(method)
  export type HandlerSignature = NotificationHandler<TaskProgressParams>
}

export namespace OnBuildTaskFinish {
  export const method: 'build/taskFinish' = 'build/taskFinish'
  export const type = new NotificationType<TaskFinishParams>(method)
  export type HandlerSignature = NotificationHandler<TaskFinishParams>
}

export namespace OnRunPrintStdout {
  export const method: 'run/printStdout' = 'run/printStdout'
  export const type = new NotificationType<PrintParams>(method)
  export type HandlerSignature = NotificationHandler<PrintParams>
}

export namespace OnRunPrintStderr {
  export const method: 'run/printStderr' = 'run/printStderr'
  export const type = new NotificationType<PrintParams>(method)
  export type HandlerSignature = NotificationHandler<PrintParams>
}

export interface BuildClient {
  onBuildShowMessage: OnBuildShowMessage.HandlerSignature
  onBuildLogMessage: OnBuildLogMessage.HandlerSignature
  onBuildPublishDiagnostics: OnBuildPublishDiagnostics.HandlerSignature
  onBuildTargetDidChange: OnBuildTargetDidChange.HandlerSignature
  onBuildTaskStart: OnBuildTaskStart.HandlerSignature
  onBuildTaskProgress: OnBuildTaskProgress.HandlerSignature
  onBuildTaskFinish: OnBuildTaskFinish.HandlerSignature
  onRunPrintStdout: OnRunPrintStdout.HandlerSignature
  onRunPrintStderr: OnRunPrintStderr.HandlerSignature
}

export function registerBuildClientHandlers(connection: MessageConnection, handlers: BuildClient) {
  connection.onNotification(OnBuildShowMessage.type, handlers.onBuildShowMessage.bind(handlers))
  connection.onNotification(OnBuildLogMessage.type, handlers.onBuildLogMessage.bind(handlers))
  connection.onNotification(OnBuildPublishDiagnostics.type, handlers.onBuildPublishDiagnostics.bind(handlers))
  connection.onNotification(OnBuildTargetDidChange.type, handlers.onBuildTargetDidChange.bind(handlers))
  connection.onNotification(OnBuildTaskStart.type, handlers.onBuildTaskStart.bind(handlers))
  connection.onNotification(OnBuildTaskProgress.type, handlers.onBuildTaskProgress.bind(handlers))
  connection.onNotification(OnBuildTaskFinish.type, handlers.onBuildTaskFinish.bind(handlers))
  connection.onNotification(OnRunPrintStdout.type, handlers.onRunPrintStdout.bind(handlers))
  connection.onNotification(OnRunPrintStderr.type, handlers.onRunPrintStderr.bind(handlers))
}

export namespace BuildTargetDataKind {
  export const Cargo = "cargo"
  export const Cpp = "cpp"
  export const Jvm = "jvm"
  export const Python = "python"
  export const Sbt = "sbt"
  export const Scala = "scala"
}

export type BuildTargetDataKind = string

export namespace TaskFinishDataKind {
  export const CompileReport = "compile-report"
  export const TestFinish = "test-finish"
  export const TestReport = "test-report"
}

export type TaskFinishDataKind = string

export interface BuildClientCapabilities {
  languageIds: string[]
}

export enum SourceItemKind {
  File = 1,
  Directory = 2
}

export interface InverseSourcesResult {
  targets: BuildTargetIdentifier[]
}

export interface SourcesResult {
  items: SourcesItem[]
}

export enum BuildTargetEventKind {
  Created = 1,
  Changed = 2,
  Deleted = 3
}

export interface BuildTargetCapabilities {
  canCompile?: boolean
  canTest?: boolean
  canRun?: boolean
  canDebug?: boolean
}

export interface OutputPathsParams {
  targets: BuildTargetIdentifier[]
}

export interface DependencyModulesItem {
  target: BuildTargetIdentifier
  modules: DependencyModule[]
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4
}

export namespace TestFinishDataKind {}

export type TestFinishDataKind = string

export interface DebugProvider {
  languageIds: string[]
}

export interface CleanCacheParams {
  targets: BuildTargetIdentifier[]
}

export interface SourcesParams {
  targets: BuildTargetIdentifier[]
}

export interface TestTask {
  target: BuildTargetIdentifier
}

export interface SourceItem {
  uri: string
  kind: SourceItemKind
  generated: boolean
}

export interface BuildTargetEvent {
  target: BuildTargetIdentifier
  kind?: BuildTargetEventKind
  dataKind?: string
  data?: any
}

export interface ResourcesParams {
  targets: BuildTargetIdentifier[]
}

export namespace TaskProgressDataKind {}

export type TaskProgressDataKind = string

export enum MessageType {
  Error = 1,
  Warning = 2,
  Info = 3,
  Log = 4
}

export interface DependencyModulesResult {
  items: DependencyModulesItem[]
}

export interface DiagnosticRelatedInformation {
  location: Location
  message: string
}

export interface CodeDescription {
  href: string
}

export interface SourcesItem {
  target: BuildTargetIdentifier
  sources: SourceItem[]
  roots?: string[]
}

export interface TextDocumentIdentifier {
  uri: string
}

export interface BuildTarget {
  id: BuildTargetIdentifier
  displayName?: string
  baseDirectory?: string
  tags: string[]
  languageIds: string[]
  dependencies: BuildTargetIdentifier[]
  capabilities: BuildTargetCapabilities
  dataKind?: string
  data?: any
}

export interface InitializeBuildParams {
  displayName: string
  version: string
  bspVersion: string
  rootUri: string
  capabilities: BuildClientCapabilities
  dataKind?: string
  data?: any
}

export interface RunProvider {
  languageIds: string[]
}

export interface DependencyModule {
  name: string
  version: string
  dataKind?: string
  data?: any
}

export interface DidChangeBuildTarget {
  changes: BuildTargetEvent[]
}

export interface BuildServerCapabilities {
  compileProvider?: CompileProvider
  testProvider?: TestProvider
  runProvider?: RunProvider
  debugProvider?: DebugProvider
  inverseSourcesProvider?: boolean
  dependencySourcesProvider?: boolean
  dependencyModulesProvider?: boolean
  resourcesProvider?: boolean
  outputPathsProvider?: boolean
  buildTargetChangedProvider?: boolean
  jvmRunEnvironmentProvider?: boolean
  jvmTestEnvironmentProvider?: boolean
  cargoFeaturesProvider?: boolean
  canReload?: boolean
}

export namespace DiagnosticDataKind {
  export const Scala = "scala"
}

export type DiagnosticDataKind = string

export interface TaskFinishParams {
  taskId: TaskId
  originId?: string
  eventTime?: number
  message?: string
  status: StatusCode
  dataKind?: string
  data?: any
}

export enum StatusCode {
  Ok = 1,
  Error = 2,
  Cancelled = 3
}

export interface LogMessageParams {
  type: MessageType
  task?: TaskId
  originId?: string
  message: string
}

export namespace CompileResultDataKind {}

export type CompileResultDataKind = string

export interface TestResult {
  originId?: string
  statusCode: StatusCode
  dataKind?: string
  data?: any
}

export interface OutputPathItem {
  uri: string
  kind: OutputPathItemKind
}

export interface DebugSessionParams {
  targets: BuildTargetIdentifier[]
  dataKind?: string
  data?: any
}

export interface DependencySourcesParams {
  targets: BuildTargetIdentifier[]
}

export namespace DependencyModuleDataKind {
  export const Maven = "maven"
}

export type DependencyModuleDataKind = string

export interface CompileProvider {
  languageIds: string[]
}

export interface CompileParams {
  targets: BuildTargetIdentifier[]
  originId?: string
  arguments?: string[]
}

export interface InitializeBuildResult {
  displayName: string
  version: string
  bspVersion: string
  capabilities: BuildServerCapabilities
  dataKind?: string
  data?: any
}

export namespace TaskStartDataKind {
  export const CompileTask = "compile-task"
  export const TestStart = "test-start"
  export const TestTask = "test-task"
}

export type TaskStartDataKind = string

export interface DependencyModulesParams {
  targets: BuildTargetIdentifier[]
}

export interface ReadParams {
  originId: string
  task?: TaskId
  message: string
}

export interface Location {
  uri: string
  range: Range
}

export enum OutputPathItemKind {
  File = 1,
  Directory = 2
}

export interface DependencySourcesItem {
  target: BuildTargetIdentifier
  sources: string[]
}

export namespace TestResultDataKind {}

export type TestResultDataKind = string

export interface TestStart {
  displayName: string
  location?: Location
}

export interface PublishDiagnosticsParams {
  textDocument: TextDocumentIdentifier
  buildTarget: BuildTargetIdentifier
  originId?: string
  diagnostics: Diagnostic[]
  reset: boolean
}

export namespace BuildTargetEventDataKind {}

export type BuildTargetEventDataKind = string

export interface TestParams {
  targets: BuildTargetIdentifier[]
  originId?: string
  arguments?: string[]
  environmentVariables?: { [key: string]: string }
  workingDirectory?: string
  dataKind?: string
  data?: any
}

export interface DebugSessionAddress {
  uri: string
}

export interface Diagnostic {
  range: Range
  severity?: DiagnosticSeverity
  code?: DiagnosticCode
  codeDescription?: CodeDescription
  source?: string
  message: string
  tags?: number[]
  relatedInformation?: DiagnosticRelatedInformation[]
  dataKind?: string
  data?: any
}

export interface ShowMessageParams {
  type: MessageType
  task?: TaskId
  originId?: string
  message: string
}

export type RequestId = string | number

export interface CancelRequestParams {
  id: RequestId
}

export namespace CancelRequest {
  export const method: '$/cancelRequest' = '$/cancelRequest'
  export const type = new NotificationType<CancelRequestParams>(method)
  export type HandlerSignature = NotificationHandler<CancelRequestParams>
}

export interface CancelExtension {
  cancelRequest: CancelRequest.HandlerSignature
}

export function registerCancelExtensionHandlers(connection: MessageConnection, handlers: CancelExtension) {
  connection.onNotification(CancelRequest.type, handlers.cancelRequest.bind(handlers))
}

export interface SetCargoFeaturesResult {
  statusCode: StatusCode
}

export interface SetCargoFeaturesParams {
  packageId: string
  features: Set<string>
}

export interface PackageFeatures {
  packageId: string
  targets: BuildTargetIdentifier[]
  availableFeatures: { [key: string]: Set<string> }
  enabledFeatures: Set<string>
}

export interface CargoBuildTarget {
  edition: string
  requiredFeatures: Set<string>
}

export namespace CargoFeaturesState {
  export const method: 'workspace/cargoFeaturesState' = 'workspace/cargoFeaturesState'
  export const type = new RequestType0<CargoFeaturesStateResult, void>(method)
  export type HandlerSignature = RequestHandler0<CargoFeaturesStateResult, void>
}

export namespace SetCargoFeatures {
  export const method: 'workspace/setCargoFeatures' = 'workspace/setCargoFeatures'
  export const type = new RequestType<SetCargoFeaturesParams, SetCargoFeaturesResult, void>(method)
  export type HandlerSignature = RequestHandler<SetCargoFeaturesParams, SetCargoFeaturesResult, void>
}

export interface CargoBuildServer {
  cargoFeaturesState: CargoFeaturesState.HandlerSignature
  setCargoFeatures: SetCargoFeatures.HandlerSignature
}

export function registerCargoBuildServerHandlers(connection: MessageConnection, handlers: CargoBuildServer) {
  connection.onRequest(CargoFeaturesState.type, handlers.cargoFeaturesState.bind(handlers))
  connection.onRequest(SetCargoFeatures.type, handlers.setCargoFeatures.bind(handlers))
}

export interface CargoFeaturesStateResult {
  packagesFeatures: PackageFeatures[]
}

export interface CppOptionsResult {
  items: CppOptionsItem[]
}

export interface CppOptionsParams {
  targets: BuildTargetIdentifier[]
}

export interface CppOptionsItem {
  target: BuildTargetIdentifier
  copts: string[]
  defines: string[]
  linkopts: string[]
  linkshared?: boolean
}

export interface CppBuildTarget {
  version?: string
  compiler?: string
  cCompiler?: string
  cppCompiler?: string
}

export namespace BuildTargetCppOptions {
  export const method: 'buildTarget/cppOptions' = 'buildTarget/cppOptions'
  export const type = new RequestType<CppOptionsParams, CppOptionsResult, void>(method)
  export type HandlerSignature = RequestHandler<CppOptionsParams, CppOptionsResult, void>
}

export interface CppBuildServer {
  buildTargetCppOptions: BuildTargetCppOptions.HandlerSignature
}

export function registerCppBuildServerHandlers(connection: MessageConnection, handlers: CppBuildServer) {
  connection.onRequest(BuildTargetCppOptions.type, handlers.buildTargetCppOptions.bind(handlers))
}

export interface JavacOptionsResult {
  items: JavacOptionsItem[]
}

export namespace BuildTargetJavacOptions {
  export const method: 'buildTarget/javacOptions' = 'buildTarget/javacOptions'
  export const type = new RequestType<JavacOptionsParams, JavacOptionsResult, void>(method)
  export type HandlerSignature = RequestHandler<JavacOptionsParams, JavacOptionsResult, void>
}

export interface JavaBuildServer {
  buildTargetJavacOptions: BuildTargetJavacOptions.HandlerSignature
}

export function registerJavaBuildServerHandlers(connection: MessageConnection, handlers: JavaBuildServer) {
  connection.onRequest(BuildTargetJavacOptions.type, handlers.buildTargetJavacOptions.bind(handlers))
}

export interface JavacOptionsItem {
  target: BuildTargetIdentifier
  options: string[]
  classpath: string[]
  classDirectory: string
}

export interface JavacOptionsParams {
  targets: BuildTargetIdentifier[]
}

export interface JvmTestEnvironmentResult {
  items: JvmEnvironmentItem[]
}

export namespace BuildTargetJvmTestEnvironment {
  export const method: 'buildTarget/jvmTestEnvironment' = 'buildTarget/jvmTestEnvironment'
  export const type = new RequestType<JvmTestEnvironmentParams, JvmTestEnvironmentResult, void>(method)
  export type HandlerSignature = RequestHandler<JvmTestEnvironmentParams, JvmTestEnvironmentResult, void>
}

export namespace BuildTargetJvmRunEnvironment {
  export const method: 'buildTarget/jvmRunEnvironment' = 'buildTarget/jvmRunEnvironment'
  export const type = new RequestType<JvmRunEnvironmentParams, JvmRunEnvironmentResult, void>(method)
  export type HandlerSignature = RequestHandler<JvmRunEnvironmentParams, JvmRunEnvironmentResult, void>
}

export interface JvmBuildServer {
  buildTargetJvmTestEnvironment: BuildTargetJvmTestEnvironment.HandlerSignature
  buildTargetJvmRunEnvironment: BuildTargetJvmRunEnvironment.HandlerSignature
}

export function registerJvmBuildServerHandlers(connection: MessageConnection, handlers: JvmBuildServer) {
  connection.onRequest(BuildTargetJvmTestEnvironment.type, handlers.buildTargetJvmTestEnvironment.bind(handlers))
  connection.onRequest(BuildTargetJvmRunEnvironment.type, handlers.buildTargetJvmRunEnvironment.bind(handlers))
}

export interface JvmBuildTarget {
  javaHome?: string
  javaVersion?: string
}

export interface JvmTestEnvironmentParams {
  targets: BuildTargetIdentifier[]
  originId?: string
}

export interface JvmRunEnvironmentResult {
  items: JvmEnvironmentItem[]
}

export interface JvmMainClass {
  className: string
  arguments: string[]
}

export interface JvmRunEnvironmentParams {
  targets: BuildTargetIdentifier[]
  originId?: string
}

export interface JvmEnvironmentItem {
  target: BuildTargetIdentifier
  classpath: string[]
  jvmOptions: string[]
  workingDirectory: string
  environmentVariables: { [key: string]: string }
  mainClasses?: JvmMainClass[]
}

export interface MavenDependencyModuleArtifact {
  uri: string
  classifier?: string
}

export interface MavenDependencyModule {
  organization: string
  name: string
  version: string
  artifacts: MavenDependencyModuleArtifact[]
  scope?: string
}

export interface PythonBuildTarget {
  version?: string
  interpreter?: string
}

export interface PythonOptionsResult {
  items: PythonOptionsItem[]
}

export namespace BuildTargetPythonOptions {
  export const method: 'buildTarget/pythonOptions' = 'buildTarget/pythonOptions'
  export const type = new RequestType<PythonOptionsParams, PythonOptionsResult, void>(method)
  export type HandlerSignature = RequestHandler<PythonOptionsParams, PythonOptionsResult, void>
}

export interface PythonBuildServer {
  buildTargetPythonOptions: BuildTargetPythonOptions.HandlerSignature
}

export function registerPythonBuildServerHandlers(connection: MessageConnection, handlers: PythonBuildServer) {
  connection.onRequest(BuildTargetPythonOptions.type, handlers.buildTargetPythonOptions.bind(handlers))
}

export interface PythonOptionsItem {
  target: BuildTargetIdentifier
  interpreterOptions: string[]
}

export interface PythonOptionsParams {
  targets: BuildTargetIdentifier[]
}

export interface RustPackage {
  id: string
  rootUrl: string
  name: string
  version: string
  origin: string
  edition: string
  source?: string
  resolvedTargets: RustTarget[]
  allTargets: RustTarget[]
  features: { [key: string]: Set<string> }
  enabledFeatures: Set<string>
  cfgOptions?: { [key: string]: string[] }
  env?: { [key: string]: string }
  outDirUrl?: string
  procMacroArtifact?: string
}

export interface RustWorkspaceParams {
  targets: BuildTargetIdentifier[]
}

export interface RustDepKindInfo {
  kind: string
  target?: string
}

export enum RustTargetKind {
  Lib = 1,
  Bin = 2,
  Test = 3,
  Example = 4,
  Bench = 5,
  CustomBuild = 6,
  Unknown = 7
}

export enum RustCrateType {
  Bin = 1,
  Lib = 2,
  Rlib = 3,
  Dylib = 4,
  Cdylib = 5,
  Staticlib = 6,
  ProcMacro = 7,
  Unknown = 8
}

export namespace RustWorkspace {
  export const method: 'buildTarget/rustWorkspace' = 'buildTarget/rustWorkspace'
  export const type = new RequestType<RustWorkspaceParams, RustWorkspaceResult, void>(method)
  export type HandlerSignature = RequestHandler<RustWorkspaceParams, RustWorkspaceResult, void>
}

export interface RustBuildServer {
  rustWorkspace: RustWorkspace.HandlerSignature
}

export function registerRustBuildServerHandlers(connection: MessageConnection, handlers: RustBuildServer) {
  connection.onRequest(RustWorkspace.type, handlers.rustWorkspace.bind(handlers))
}

export namespace RustDepKind {
  export const Build = "build"
  export const Dev = "dev"
  export const Normal = "normal"
  export const Unclassified = "unclassified"
}

export type RustDepKind = string

export interface RustTarget {
  name: string
  crateRootUrl: string
  kind: RustTargetKind
  crateTypes?: RustCrateType[]
  edition: string
  doctest: boolean
  requiredFeatures?: Set<string>
}

export interface RustRawDependency {
  name: string
  rename?: string
  kind?: string
  target?: string
  optional: boolean
  usesDefaultFeatures: boolean
  features: Set<string>
}

export interface RustDependency {
  pkg: string
  name?: string
  depKinds?: RustDepKindInfo[]
}

export namespace RustEdition {
  export const E2015 = "2015"
  export const E2018 = "2018"
  export const E2021 = "2021"
}

export type RustEdition = string

export interface RustWorkspaceResult {
  packages: RustPackage[]
  rawDependencies: { [key: string]: RustRawDependency[] }
  dependencies: { [key: string]: RustDependency[] }
  resolvedTargets: BuildTargetIdentifier[]
}

export namespace RustPackageOrigin {
  export const Dependency = "dependency"
  export const Stdlib = "stdlib"
  export const StdlibDependency = "stdlib-dependency"
  export const Workspace = "workspace"
}

export type RustPackageOrigin = string

export interface SbtBuildTarget {
  sbtVersion: string
  autoImports: string[]
  scalaBuildTarget: ScalaBuildTarget
  parent?: BuildTargetIdentifier
  children: BuildTargetIdentifier[]
}

export interface ScalaTestSuiteSelection {
  className: string
  tests: string[]
}

export interface ScalaMainClassesParams {
  targets: BuildTargetIdentifier[]
  originId?: string
}

export interface ScalaTextEdit {
  range: Range
  newText: string
}

export interface ScalaBuildTarget {
  scalaOrganization: string
  scalaVersion: string
  scalaBinaryVersion: string
  platform: ScalaPlatform
  jars: string[]
  jvmBuildTarget?: JvmBuildTarget
}

export interface ScalacOptionsResult {
  items: ScalacOptionsItem[]
}

export interface ScalaMainClass {
  className: string
  arguments: string[]
  jvmOptions: string[]
  environmentVariables?: string[]
}

export interface ScalaMainClassesResult {
  items: ScalaMainClassesItem[]
  originId?: string
}

export interface ScalacOptionsItem {
  target: BuildTargetIdentifier
  options: string[]
  classpath: string[]
  classDirectory: string
}

export interface ScalaWorkspaceEdit {
  changes: ScalaTextEdit[]
}

export interface ScalacOptionsParams {
  targets: BuildTargetIdentifier[]
}

export interface ScalaTestClassesResult {
  items: ScalaTestClassesItem[]
}

export namespace BuildTargetScalacOptions {
  export const method: 'buildTarget/scalacOptions' = 'buildTarget/scalacOptions'
  export const type = new RequestType<ScalacOptionsParams, ScalacOptionsResult, void>(method)
  export type HandlerSignature = RequestHandler<ScalacOptionsParams, ScalacOptionsResult, void>
}

/**
 * @deprecated Use buildTarget/jvmTestEnvironment instead
 */
export namespace BuildTargetScalaTestClasses {
  export const method: 'buildTarget/scalaTestClasses' = 'buildTarget/scalaTestClasses'
  export const type = new RequestType<ScalaTestClassesParams, ScalaTestClassesResult, void>(method)
  export type HandlerSignature = RequestHandler<ScalaTestClassesParams, ScalaTestClassesResult, void>
}

/**
 * @deprecated Use buildTarget/jvmRunEnvironment instead
 */
export namespace BuildTargetScalaMainClasses {
  export const method: 'buildTarget/scalaMainClasses' = 'buildTarget/scalaMainClasses'
  export const type = new RequestType<ScalaMainClassesParams, ScalaMainClassesResult, void>(method)
  export type HandlerSignature = RequestHandler<ScalaMainClassesParams, ScalaMainClassesResult, void>
}

export interface ScalaBuildServer {
  buildTargetScalacOptions: BuildTargetScalacOptions.HandlerSignature
  buildTargetScalaTestClasses: BuildTargetScalaTestClasses.HandlerSignature
  buildTargetScalaMainClasses: BuildTargetScalaMainClasses.HandlerSignature
}

export function registerScalaBuildServerHandlers(connection: MessageConnection, handlers: ScalaBuildServer) {
  connection.onRequest(BuildTargetScalacOptions.type, handlers.buildTargetScalacOptions.bind(handlers))
  connection.onRequest(BuildTargetScalaTestClasses.type, handlers.buildTargetScalaTestClasses.bind(handlers))
  connection.onRequest(BuildTargetScalaMainClasses.type, handlers.buildTargetScalaMainClasses.bind(handlers))
}

export interface ScalaMainClassesItem {
  target: BuildTargetIdentifier
  classes: ScalaMainClass[]
}

export interface ScalaTestParams {
  testClasses?: ScalaTestClassesItem[]
  jvmOptions?: string[]
}

export interface ScalaTestSuites {
  suites: ScalaTestSuiteSelection[]
  jvmOptions: string[]
  environmentVariables: string[]
}

export interface ScalaTestClassesParams {
  targets: BuildTargetIdentifier[]
  originId?: string
}

export interface ScalaAction {
  title: string
  description?: string
  edit?: ScalaWorkspaceEdit
}

export interface ScalaTestClassesItem {
  target: BuildTargetIdentifier
  framework?: string
  classes: string[]
}

export interface ScalaAttachRemote {
}

export interface ScalaDiagnostic {
  actions?: ScalaAction[]
}

export enum ScalaPlatform {
  Jvm = 1,
  Js = 2,
  Native = 3
}
