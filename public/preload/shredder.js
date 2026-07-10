const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const TIMEOUT_MS = 120000

function buildShredScript(filePath) {
  const escaped = filePath.replace(/'/g, "''")
  let isDir
  try { isDir = fs.statSync(filePath).isDirectory() } catch { isDir = !path.extname(filePath) }
  if (isDir) {
    return [
      '$path = ' + "'" + escaped + "'",
      '$files = Get-ChildItem -Path $path -Recurse -File -ErrorAction Stop',
      '$count = 0',
      '$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()',
      'foreach ($f in $files) {',
      '  try {',
      '    $len = $f.Length',
      '    if ($len -eq 0) { Remove-Item -Force $f.FullName; $count++; continue }',
      '    $buf = [byte[]]::new(65536)',
      '    $fs = [System.IO.File]::Open($f.FullName, "Open", "Write", "None")',
      '    $written = 0',
      '    while ($written -lt $len) {',
      '      $chunk = [Math]::Min(65536, $len - $written)',
      '      if ($chunk -lt 65536) { $buf = [byte[]]::new($chunk) }',
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
      'try { Remove-Item -Recurse -Force $path -ErrorAction SilentlyContinue } catch {}',
      'Write-Output (ConvertTo-Json @{ ok = $true; count = $count })'
    ].join('\n')
  }
  return [
    '$path = ' + "'" + escaped + "'",
    '$len = (Get-Item $path).Length',
    'if ($len -eq 0) { Remove-Item -Force $path; Write-Output (ConvertTo-Json @{ ok = $true; count = 1 }); exit }',
    '$buf = [byte[]]::new(65536)',
    '$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()',
    '$fs = [System.IO.File]::Open($path, "Open", "Write", "None")',
    '$written = 0',
    'while ($written -lt $len) {',
    '  $chunk = [Math]::Min(65536, $len - $written)',
    '  if ($chunk -lt 65536) { $buf = [byte[]]::new($chunk) }',
    '  $rng.GetBytes($buf)',
    '  $fs.Write($buf, 0, $chunk)',
    '  $fs.Flush()',
    '  $written += $chunk',
    '}',
    '$fs.Close()',
    'Remove-Item -Force $path',
    'Write-Output (ConvertTo-Json @{ ok = $true; count = 1 })'
  ].join('\n')
}

function buildDeleteScript(filePath) {
  const escaped = filePath.replace(/'/g, "''")
  let isDir
  try { isDir = fs.statSync(filePath).isDirectory() } catch { isDir = !path.extname(filePath) }
  if (isDir) {
    return "Remove-Item -Recurse -Force '" + escaped + "'; Write-Output (ConvertTo-Json @{ ok = $true; count = 0 })"
  }
  return "Remove-Item -Force '" + escaped + "'; Write-Output (ConvertTo-Json @{ ok = $true; count = 1 })"
}

function parseShredResult(raw) {
  const trimmed = raw.trim().replace(/^\uFEFF/, '')
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed.ok) {
      return { success: true, message: 'done. ' + (parsed.count || 0) + ' files processed.', filesProcessed: parsed.count || 0 }
    }
    return { success: false, message: parsed.error || 'unknown error' }
  } catch (e) {
    if (trimmed.toLowerCase().includes('access denied') || trimmed.toLowerCase().includes('permission')) {
      return { success: false, message: 'permission denied. try running as admin.', locked: true }
    }
    if (trimmed.toLowerCase().includes('being used') || trimmed.toLowerCase().includes('in use')) {
      return { success: false, message: 'file is in use by another process.', locked: true }
    }
    return { success: false, message: trimmed.substring(0, 200) || 'unknown error' }
  }
}

module.exports = { buildShredScript, buildDeleteScript, parseShredResult }
