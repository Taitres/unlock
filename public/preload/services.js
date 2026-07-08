const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { parseLsofOutput, getKillCommand } = require('./utils')

const TIMEOUT_MS = 60000

function execWithTimeout(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { timeout: TIMEOUT_MS })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (data) => { stdout += data })
    proc.stderr.on('data', (data) => { stderr += data })
    proc.on('error', (err) => {
      reject(new Error('spawn error: ' + err.message))
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || 'exit code ' + code))
        return
      }
      resolve(stdout)
    })
  })
}

async function runWindowsDetection(action, filePath) {
  const scriptPath = path.join(__dirname, 'detect-lock.ps1')
  const output = await execWithTimeout('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    action,
    filePath
  ])
  return output.trim()
}

async function findLockingProcesses(filePath) {
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('文件不存在: ' + resolved)
  }

  if (os.platform() === 'win32') {
    const raw = await runWindowsDetection('detect', resolved)
    if (!raw) return []

    if (raw.startsWith('ERROR:')) {
      throw new Error('查找失败: ' + raw)
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch (e) {
      throw new Error('解析结果失败: ' + raw)
    }

    const result = []
    for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
      result.push({ pid: item.pid, name: item.name || 'Unknown', path: '' })
    }
    return result
  }

  const escapedPath = resolved.replace(/"/g, '\\"')
  const output = await execWithTimeout('sh', [
    '-c',
    'lsof "' + escapedPath + '" 2>/dev/null | awk \'NR>1 {print $2, $1}\''
  ])
  const processes = parseLsofOutput(output)

  for (const proc of processes) {
    try {
      const pathOutput = await execWithTimeout('sh', [
        '-c',
        'ps -p ' + proc.pid + ' -o comm= 2>/dev/null'
      ])
      proc.path = pathOutput.trim()
    } catch {
      proc.path = ''
    }
  }
  return processes
}

async function closeFileHandle(filePath, pid) {
  if (os.platform() !== 'win32') {
    return { success: false, message: '该功能仅支持 Windows' }
  }
  const resolved = path.resolve(filePath)
  if (!fs.existsSync(resolved)) {
    throw new Error('文件不存在: ' + resolved)
  }
  const scriptPath = path.join(__dirname, 'close-handle.ps1')
  const raw = (await execWithTimeout('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    resolved,
    String(pid)
  ])).trim()

  if (raw.startsWith('SUCCESS')) {
    return { success: true, message: '已解除文件占用' }
  }
  if (raw.startsWith('ACCESS_DENIED')) {
    return { success: false, message: '需要管理员权限。请以管理员运行 ZTools，或使用"结束进程"' }
  }
  if (raw.startsWith('ERROR:')) {
    return { success: false, message: raw.substring(6).trim() }
  }
  return { success: false, message: raw || '操作失败' }
}

async function killProcess(pid) {
  const { cmd, args } = getKillCommand(pid)
  await execWithTimeout(cmd, args)
  return { success: true, message: '已结束进程 PID: ' + pid }
}

window.services = {
  findLockingProcesses,
  closeFileHandle,
  killProcess
}
