const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { parseHandleExeOutput, isPathInside } = require('./handle-parse')
const { getKillCommand } = require('./utils')

const TIMEOUT_MS = 30000
let _debugLog = []

function debugPush(msg) {
  _debugLog.push(msg)
}

function getDebugLog() {
  const logs = _debugLog
  _debugLog = []
  return logs
}

function execWithTimeout(cmd, args, label) {
  return new Promise((resolve, reject) => {
    debugPush('  [' + (label || 'exec') + '] ' + cmd + ' ' + args.map(a => a.includes(' ') ? '"' + a + '"' : a).join(' '))
    const proc = spawn(cmd, args, { timeout: TIMEOUT_MS })
    let stdout = ''
    let stderr = ''
    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')
    proc.stdout.on('data', function (d) { stdout += d })
    proc.stderr.on('data', function (d) { stderr += d })
    proc.on('error', function (err) {
      debugPush('  [' + (label || 'exec') + '] spawn error: ' + err.message)
      reject(new Error('spawn error: ' + err.message))
    })
    proc.on('close', function (code) {
      debugPush('  [' + (label || 'exec') + '] exit: ' + code)
      if (stderr.trim()) debugPush('  [' + (label || 'exec') + '] stderr: ' + stderr.trim().substring(0, 500))
      if (code !== 0) { reject(new Error(stderr.trim() || 'exit code ' + code)); return }
      resolve(stdout)
    })
  })
}

function buildHandleScript(handleExePath, isDir, resolvedPath) {
  const searchTerm = isDir ? resolvedPath : path.basename(resolvedPath)
  const escapedSearch = searchTerm.replace(/'/g, "''")
  const escapedExe = handleExePath.replace(/'/g, "''")
  return [
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    "& '" + escapedExe + "' -accepteula -nobanner -a '" + escapedSearch + "'"
  ].join('\n')
}

function buildAndWriteTempScript(handleExePath, isDir, resolvedPath) {
  const script = buildHandleScript(handleExePath, isDir, resolvedPath)
  const scriptPath = path.join(os.tmpdir(), 'unlock-handle-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.ps1')
  fs.writeFileSync(scriptPath, '\uFEFF' + script, 'utf8')
  return scriptPath
}

async function findLockingProcesses(filePath) {
  _debugLog = []
  const resolved = path.resolve(filePath)
  debugPush('=== findLockingProcesses ===')
  debugPush('path: ' + resolved)
  if (!fs.existsSync(resolved)) {
    throw new Error('path not found: ' + resolved)
  }
  const isDir = fs.statSync(resolved).isDirectory()

  const handleExe = path.join(__dirname, 'handle.exe')
  if (!fs.existsSync(handleExe)) {
    debugPush('[unlock] handle.exe not found at ' + handleExe)
    debugPush('=== done ===')
    return []
  }

  const scriptPath = buildAndWriteTempScript(handleExe, isDir, resolved)
  try {
    debugPush('[unlock] temp script: ' + scriptPath)
    const raw = await execWithTimeout('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath
    ], 'handle')
    const trimmed = raw.trim()
    let result = []
    if (trimmed) {
      const allHandles = parseHandleExeOutput(trimmed)
      const filtered = isDir
        ? allHandles.filter(function (h) { return isPathInside(h.handlePath, resolved) })
        : allHandles
      result = filtered.map(function (p) {
        return { pid: p.pid, name: p.name, exePath: p.handlePath }
      })
      debugPush('[unlock] found ' + result.length + ' processes')
    } else {
      debugPush('[unlock] no output from handle.exe')
    }
  } finally {
    try { fs.unlinkSync(scriptPath) } catch (e) {}
  }
  debugPush('=== done ===')
  return result
}

async function isProcessAlive(pid) {
  try {
    const raw = await execWithTimeout('tasklist', ['/FI', 'PID eq ' + pid, '/NH', '/FO', 'CSV'], 'alive')
    return raw.includes('"' + pid + '"')
  } catch { return false }
}

async function killProcess(pid) {
  _debugLog = []
  debugPush('=== killProcess PID: ' + pid + ' ===')
  const killCmd = getKillCommand(pid)
  debugPush('cmd: ' + killCmd.cmd + ' ' + killCmd.args.join(' '))
  return new Promise(function (resolve) {
    const proc = spawn(killCmd.cmd, killCmd.args, { timeout: TIMEOUT_MS })
    proc.on('error', function (err) {
      debugPush('[kill] spawn error: ' + err.message)
      resolve({ success: false, message: 'kill failed: ' + err.message + '. try Task Manager (Ctrl+Shift+Esc).' })
    })
    proc.on('close', function (code) {
      debugPush('[kill] exit code: ' + code)
      if (code === 0) {
        setTimeout(function () {
          isProcessAlive(pid).then(function (alive) {
            if (alive) {
              resolve({ success: false, message: 'PID ' + pid + ' still alive, needs admin rights. use Task Manager.' })
            } else {
              resolve({ success: true, message: 'killed PID ' + pid })
            }
          })
        }, 500)
      } else if (code === 128) {
        resolve({ success: true, message: 'PID ' + pid + ' already exited' })
      } else {
        resolve({ success: false, message: 'kill failed (exit:' + code + '), may need admin rights. use Task Manager.' })
      }
    })
  })
}

module.exports = { buildHandleScript, findLockingProcesses, killProcess, getDebugLog }
