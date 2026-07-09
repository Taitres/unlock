const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { parseDetectOutput } = require('./detect-parse')
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

  const scriptPath = path.join(__dirname, 'detect-lock.ps1')
  const raw = await execWithTimeout('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    resolved
  ])

  const trimmed = raw.trim().replace(/^\uFEFF/, '')
  if (!trimmed) return []

  return parseDetectOutput(trimmed)
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
