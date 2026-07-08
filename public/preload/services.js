const { exec } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const {
  parseLsofOutput,
  getFindProcessesScript,
  getCloseHandlesScript,
  getKillCommand
} = require('./utils')

const TIMEOUT_MS = 10000

/**
 * Execute a command with timeout. Returns stdout.
 */
function execWithTimeout(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = exec(
      `"${cmd}" ${args.map((a) => `"${a}"`).join(' ')}`,
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr || err.message))
          return
        }
        resolve(stdout)
      }
    )
    proc.on('error', reject)
  })
}

/**
 * Find processes locking the given file.
 */
async function findLockingProcesses(filePath) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('文件不存在: ' + resolved)
  }

  if (os.platform() === 'win32') {
    const script = getFindProcessesScript(resolved)
    const output = await execWithTimeout('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      script
    ])
    const trimmed = output.trim()
    if (!trimmed) return []
    const parsed = JSON.parse(trimmed)
    const result = []
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      result.push({
        pid: item.pid,
        name: item.name || 'Unknown',
        path: ''
      })
    }
    return result
  }

  // macOS / Linux
  const output = await execWithTimeout('bash', [
    '-c',
    `lsof "${resolved.replace(/"/g, '\\"')}" 2>/dev/null | awk 'NR>1 {print $2, $1}'`
  ])
  const processes = parseLsofOutput(output)

  // Enrich with process path via ps
  for (const proc of processes) {
    try {
      const pathOutput = await execWithTimeout('bash', [
        '-c',
        `ps -p ${proc.pid} -o comm= 2>/dev/null`
      ])
      proc.path = pathOutput.trim()
    } catch {
      proc.path = ''
    }
  }
  return processes
}

/**
 * Close handles by shutting down processes locking the file (Windows only).
 */
async function closeFileHandle(filePath, pid) {
  if (os.platform() !== 'win32') {
    return { success: false, message: '该功能仅支持 Windows' }
  }
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('文件不存在: ' + resolved)
  }
  const script = getCloseHandlesScript(resolved)
  await execWithTimeout('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    script
  ])
  return { success: true, message: '已关闭占用该文件的进程' }
}

/**
 * Kill a process by PID.
 */
async function killProcess(pid) {
  const { cmd, args } = getKillCommand(pid)
  await execWithTimeout(cmd, args)
  return { success: true, message: `已结束进程 PID: ${pid}` }
}

window.services = {
  findLockingProcesses,
  closeFileHandle,
  killProcess
}
