const ENTRY_RE = /(\S+?\.exe)\s+pid:\s+(\d+)\s+type:\s+(\S+)(?:\s+\S+:\s+(.*))?/i

function parseHandleExeOutput(raw) {
  if (!raw || !raw.trim()) return []
  const seen = new Set()
  const results = []
  for (const line of raw.split('\n')) {
    const m = line.match(ENTRY_RE)
    if (!m) continue
    const type = m[3].toLowerCase()
    if (type !== 'file') continue
    const pid = parseInt(m[2], 10)
    if (!Number.isInteger(pid) || pid <= 0) continue
    if (seen.has(pid)) continue
    seen.add(pid)
    const name = m[1].replace(/\.exe$/i, '')
    const handlePath = m[4] ? m[4].trim() : ''
    results.push({ pid, name, handlePath })
  }
  return results
}

/**
 * Check if a handle path is inside (or equals) a directory path.
 * Handles drive-letter case-insensitivity and slash normalization.
 * @param {string} handlePath - The handle's file path (may be empty)
 * @param {string} dirPath - The target directory path
 * @returns {boolean}
 */
function isPathInside(handlePath, dirPath) {
  if (!handlePath) return true // can't verify — keep it
  const hp = handlePath.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '')
  const dp = dirPath.toLowerCase().replace(/\//g, '\\').replace(/\\+$/, '')
  return hp === dp || hp.startsWith(dp + '\\')
}

module.exports = { parseHandleExeOutput, isPathInside }
