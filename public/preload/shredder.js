const fs = require('node:fs')
const path = require('node:path')

// PowerShell 脚本头部: 强制 UTF-8 输出,避免中文乱码
var PS_HEADER = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n$OutputEncoding = [System.Text.Encoding]::UTF8\n'

function isDirectory(filePath) {
  try { return fs.statSync(filePath).isDirectory() } catch { return false }
}

function buildShredScript(filePath) {
  const escaped = filePath.replace(/'/g, "''")
  const isDir = isDirectory(filePath)
  if (isDir) {
    return PS_HEADER + [
      '$ErrorActionPreference = "Stop"',
      'try {',
      '$path = ' + "'" + escaped + "'",
      '$files = Get-ChildItem -Path $path -Recurse -File -ErrorAction Stop',
      '$count = 0',
      '$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()',
      '$bufSize = 65536',
      'foreach ($f in $files) {',
      '  try {',
      '    $len = $f.Length',
      '    if ($len -eq 0) { Remove-Item -Force $f.FullName; $count++; continue }',
      '    $buf = [byte[]]::new($bufSize)',
      '    $fs = [System.IO.File]::Open($f.FullName, "Open", "Write", "None")',
      '    $written = 0',
      '    while ($written -lt $len) {',
      '      $chunk = [Math]::Min($bufSize, $len - $written)',
      '      if ($chunk -lt $bufSize) { $buf = [byte[]]::new($chunk) }',
      '      $rng.GetBytes($buf)',
      '      $fs.Write($buf, 0, $chunk)',
      '      $fs.Flush()',
      '      $written += $chunk',
      '    }',
      '    $fs.Close()',
      '    Remove-Item -Force $f.FullName',
      '    $count++',
      '  } catch { }',
      '}',
      'Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue',
      'Write-Output (ConvertTo-Json @{ ok = $true; count = $count })',
      '} catch { Write-Output (ConvertTo-Json @{ ok = $false; error = $_.Exception.Message }) }'
    ].join('\n')
  }
  return PS_HEADER + [
    '$ErrorActionPreference = "Stop"',
    'try {',
    '$path = ' + "'" + escaped + "'",
    '$len = (Get-Item $path).Length',
    'if ($len -eq 0) { Remove-Item -Force $path; Write-Output (ConvertTo-Json @{ ok = $true; count = 1 }); exit }',
    '$bufSize = 65536',
    '$buf = [byte[]]::new($bufSize)',
    '$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()',
    '$fs = [System.IO.File]::Open($path, "Open", "Write", "None")',
    '$written = 0',
    'while ($written -lt $len) {',
    '  $chunk = [Math]::Min($bufSize, $len - $written)',
    '  if ($chunk -lt $bufSize) { $buf = [byte[]]::new($chunk) }',
    '  $rng.GetBytes($buf)',
    '  $fs.Write($buf, 0, $chunk)',
    '  $fs.Flush()',
    '  $written += $chunk',
    '}',
    '$fs.Close()',
    'Remove-Item -Force $path',
    'Write-Output (ConvertTo-Json @{ ok = $true; count = 1 })',
    '} catch { Write-Output (ConvertTo-Json @{ ok = $false; error = $_.Exception.Message }) }'
  ].join('\n')
}

function buildDeleteScript(filePath) {
  const escaped = filePath.replace(/'/g, "''")
  const isDir = isDirectory(filePath)
  if (isDir) {
    return PS_HEADER + "$ErrorActionPreference = 'Stop'" + `
try { Remove-Item -Recurse -Force '${escaped}'; Write-Output (ConvertTo-Json @{ ok = $true; count = 0 }) }
catch { Write-Output (ConvertTo-Json @{ ok = $false; error = $_.Exception.Message }) }`
  }
  return PS_HEADER + "$ErrorActionPreference = 'Stop'" + `
try { Remove-Item -Force '${escaped}'; Write-Output (ConvertTo-Json @{ ok = $true; count = 1 }) }
catch { Write-Output (ConvertTo-Json @{ ok = $false; error = $_.Exception.Message }) }`
}

function _isLockError(msg) {
  const lower = (msg || '').toLowerCase()
  // English patterns
  if (lower.includes('being used') || lower.includes('in use')) return true
  // Chinese patterns (.NET 异常消息)
  if (msg && (msg.includes('正由另一进程使用') || msg.includes('被另一进程使用') || msg.includes('正在使用'))) return true
  return false
}

function _isPermissionError(msg) {
  const lower = (msg || '').toLowerCase()
  // English patterns
  if (lower.includes('access denied') || lower.includes('permission denied')) return true
  // Chinese patterns
  if (msg && (msg.includes('拒绝') || msg.includes('权限不足'))) return true
  return false
}

function parseShredResult(raw) {
  const trimmed = raw.trim().replace(/^\uFEFF/, '')
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed.ok) {
      return { success: true, message: '完成,已处理 ' + (parsed.count || 0) + ' 个文件', filesProcessed: parsed.count || 0 }
    }
    const errMsg = parsed.error || '未知错误'
    if (_isLockError(errMsg)) {
      return { success: false, message: '文件被其他进程占用', locked: true, rawError: errMsg }
    }
    if (_isPermissionError(errMsg)) {
      return { success: false, message: '权限不足,请以管理员身份运行', locked: true, rawError: errMsg }
    }
    return { success: false, message: errMsg }
  } catch (e) {
    if (_isPermissionError(trimmed)) {
      return { success: false, message: '权限不足,请以管理员身份运行', locked: true }
    }
    if (_isLockError(trimmed)) {
      return { success: false, message: '文件被其他进程占用', locked: true }
    }
    return { success: false, message: trimmed.substring(0, 200) || '未知错误' }
  }
}

module.exports = { buildShredScript, buildDeleteScript, parseShredResult }
