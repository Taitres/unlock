const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { getKillCommand } = require('./utils')

describe('getKillCommand', () => {
  it('returns taskkill with /f for any pid', () => {
    const { cmd, args } = getKillCommand(1234)
    assert.equal(cmd, 'taskkill')
    assert.deepEqual(args, ['/pid', '1234', '/f'])
  })

  it('stringifies pid', () => {
    const { args } = getKillCommand(98765)
    assert.equal(args[1], '98765')
    assert.equal(typeof args[1], 'string')
  })
})
