/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

export type AppType =
  | 'Unknown'
  | 'MainWindow'
  | 'OtherWindow'
  | 'Service'
  | 'Explorer'
  | 'Console'
  | 'Critical'

export interface ProcessInfo {
  pid: number
  name: string
  appName: string
  exePath: string
  appType: AppType
}

export interface LockedHint {
  pid: -1
  name: '__LOCKED__'
  locked: boolean
}

export interface OperationResult {
  success: boolean
  message: string
}

export interface Services {
  findLockingProcesses: (filePath: string) => Promise<(ProcessInfo | LockedHint)[]>
  killProcess: (pid: number) => Promise<OperationResult>
}

declare global {
  interface Window {
    services: Services
    ztools: ZToolsApi & { getPathForFile(file: File): string }
  }
}

export {}
