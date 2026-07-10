const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { buildShredScript, buildDeleteScript, parseShredResult } = require('./shredder')

describe('shredder', () => {
  describe('buildShredScript', () => {
    it('generates PowerShell script for single file shred', () => {
      const script = buildShredScript('C:\\test\\file.txt')
      assert(script.includes('RandomNumberGenerator'))
      assert(script.includes("'C:\\test\\file.txt'"))
      assert(script.includes('Remove-Item'))
    })

    it('generates PowerShell script for directory shred', () => {
      const script = buildShredScript('C:\\test\\dir')
      assert(script.includes('Get-ChildItem'))
      assert(script.includes('-Recurse'))
      assert(script.includes('-File'))
    })

    it('escapes single quotes in path', () => {
      const script = buildShredScript("C:\\test\\it's.txt")
      assert(script.includes("'C:\\test\\it''s.txt'"))
    })
  })

  describe('buildDeleteScript', () => {
    it('generates Remove-Item for file', () => {
      const script = buildDeleteScript('C:\\test\\file.txt')
      assert(script.includes('Remove-Item'))
      assert(script.includes('-Force'))
    })

    it('generates Remove-Item -Recurse for directory', () => {
      const script = buildDeleteScript('C:\\test\\dir')
      assert(script.includes('-Recurse'))
    })
  })

  describe('parseShredResult', () => {
    it('parses success JSON', () => {
      const result = parseShredResult('{"ok":true,"count":5}')
      assert.equal(result.success, true)
      assert.equal(result.filesProcessed, 5)
    })

    it('parses failure JSON with permission error', () => {
      const result = parseShredResult('{"ok":false,"error":"access denied"}')
      assert.equal(result.success, false)
      assert(result.message.includes('access denied'))
    })

    it('detects lock from error text', () => {
      const result = parseShredResult('Remove-Item : The process cannot access the file because it is being used by another process.')
      assert.equal(result.success, false)
      assert.equal(result.locked, true)
    })
  })
})
