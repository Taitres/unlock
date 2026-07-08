const os = require('node:os')

/**
 * Parse lsof output lines into process info objects.
 * @param {string} output - Raw lsof output (lines: "PID NAME")
 * @returns {Array<{pid: number, name: string}>}
 */
function parseLsofOutput(output) {
  const lines = output.trim().split('\n')
  const processes = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const spaceIdx = trimmed.indexOf(' ')
    if (spaceIdx === -1) continue
    const pid = parseInt(trimmed.substring(0, spaceIdx), 10)
    const name = trimmed.substring(spaceIdx + 1).trim()
    if (isNaN(pid) || !name) continue
    processes.push({ pid, name })
  }
  return processes
}

/**
 * Get the process kill command for current platform.
 * @param {number} pid
 * @returns {{cmd: string, args: string[]}}
 */
function getKillCommand(pid) {
  if (os.platform() === 'win32') {
    return { cmd: 'taskkill', args: ['/PID', String(pid), '/F'] }
  }
  return { cmd: 'kill', args: ['-9', String(pid)] }
}

module.exports = {
  parseLsofOutput,
  getKillCommand
}
