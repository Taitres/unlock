const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { parseDetectOutput } = require('./detect-parse')
const { parseHandleExeOutput } = require('./handle-parse')
const { getKillCommand } = require('./utils')

const TIMEOUT_MS = 60000

function execWithTimeout(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: TIMEOUT_MS })
    let stdout = ''
    let stderr = ''
  proc.stdout.setEncoding('utf8')
  proc.stderr.setEncoding('utf8')
  // UTF-8 is safe only while PowerShell output is ASCII or JSON-escaped.
  // detect-lock.ps1 must use ConvertTo-Json so non-ASCII is escaped, not raw.
    proc.stdout.on('data', (data) => { stdout += data })
    proc.stderr.on('data', (data) => { stderr += data })
    proc.on('error', (err) => reject(new Error('spawn error: ' + err.message)))
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'exit code ' + code))
        return
      }
      resolve(stdout)
    })
  })
}

async function findLockingProcesses(filePath) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('路径不存在: ' + resolved)
  }

  // 路径 1: Restart Manager (RmGetList)
  let rmResult = []
  let rmHint = null
  try {
    const scriptPath = path.join(__dirname, 'detect-lock.ps1')
    const raw = await execWithTimeout('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      resolved
    ])
    const trimmed = raw.trim().replace(/^\uFEFF/, '')
    if (trimmed) {
      const parsed = parseDetectOutput(trimmed)
      const hint = parsed.find(p => p.pid === -1)
      rmResult = parsed.filter(p => p.pid !== -1)
      if (hint) rmHint = hint
    }
  } catch {
    // RM call failed entirely; fall through to handle.exe
  }

  if (rmResult.length > 0) {
    return rmResult
  }

  // 路径 2: handle.exe fallback
  const handleExe = path.join(__dirname, 'handle.exe')
  if (fs.existsSync(handleExe)) {
    try {
      const baseName = path.basename(resolved)
      const raw = await execWithTimeout(handleExe, [
        '--accepteula',
        '-a',
        baseName
      ])
      const trimmed = raw.trim()
      if (trimmed) {
        const handleResults = parseHandleExeOutput(trimmed)
        if (handleResults.length > 0) {
          return handleResults.map(p => ({
            pid: p.pid,
            name: p.name,
            appName: '',
            exePath: '',
            appType: 'Unknown'
          }))
        }
      }
    } catch {
      // handle.exe failed (likely timeout or non-interactive session)
    }
  }

  // Neither found anything. If RM hinted at a lock, surface it; else return empty.
  return rmHint ? [rmHint] : []
}

async function killProcess(pid) {
  const { cmd, args } = getKillCommand(pid)
  try {
    await execWithTimeout(cmd, args)
    return { success: true, message: '已结束进程 PID: ' + pid }
  } catch (err) {
    return { success: false, message: '结束进程失败: ' + (err.message || '未知错误') }
  }
}

window.services = {
  findLockingProcesses,
  killProcess
}
