const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseLsofOutput, getKillCommand } = require('./utils')

describe('parseLsofOutput', () => {
  it('parses valid lsof output', () => {
    const output = '1234 notepad\n5678 WINWORD'
    const result = parseLsofOutput(output)
    assert.deepEqual(result, [
      { pid: 1234, name: 'notepad' },
      { pid: 5678, name: 'WINWORD' }
    ])
  })

  it('handles empty output', () => {
    assert.deepEqual(parseLsofOutput(''), [])
  })

  it('skips invalid lines', () => {
    const output = '1234 valid\ninvalid-line\n5678 alsovalid'
    const result = parseLsofOutput(output)
    assert.deepEqual(result, [
      { pid: 1234, name: 'valid' },
      { pid: 5678, name: 'alsovalid' }
    ])
  })
})

describe('getKillCommand', () => {
  it('returns taskkill on Windows', () => {
    const origPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
    if (origPlatform && origPlatform.value === 'win32') {
      const { cmd, args } = getKillCommand(1234)
      assert.equal(cmd, 'taskkill')
      assert.deepEqual(args, ['/PID', '1234', '/F'])
    }
  })
})
