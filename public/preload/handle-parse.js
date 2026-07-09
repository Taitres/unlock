const ENTRY_RE = /(\S+?\.exe)\s+pid:\s+(\d+)\s+type:\s+(\S+)/i

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
    results.push({ pid, name })
  }
  return results
}

module.exports = { parseHandleExeOutput }
