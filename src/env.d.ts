/// <reference types="vite/client" />
/// <reference types="@ztools-center/ztools-api-types" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface ProcessInfo {
  pid: number
  name: string
  path: string
}

interface OperationResult {
  success: boolean
  message: string
}

interface Services {
  findLockingProcesses: (filePath: string) => Promise<ProcessInfo[]>
  closeFileHandle: (filePath: string, pid: number) => Promise<OperationResult>
  killProcess: (pid: number) => Promise<OperationResult>
}

declare global {
  interface Window {
    services: Services
  }
}

export {}
