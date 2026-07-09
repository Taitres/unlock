function getKillCommand(pid) {
  return { cmd: 'taskkill', args: ['/pid', String(pid), '/f'] }
}

module.exports = { getKillCommand }
