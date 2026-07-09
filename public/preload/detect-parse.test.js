const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseDetectOutput } = require('./detect-parse')

describe('parseDetectOutput', () => {
  it('parses empty array', () => {
    assert.deepEqual(parseDetectOutput('[]'), [])
  })

  it('parses process entries', () => {
    const raw = JSON.stringify([
      { pid: 1234, name: 'notepad', appName: 'Notepad', exePath: 'C:\\Windows\\notepad.exe', appType: 'MainWindow' }
    ])
    assert.deepEqual(parseDetectOutput(raw), [
      { pid: 1234, name: 'notepad', appName: 'Notepad', exePath: 'C:\\Windows\\notepad.exe', appType: 'MainWindow' }
    ])
  })

  it('parses __LOCKED__ hint with locked=true', () => {
    const raw = JSON.stringify([{ pid: -1, name: '__LOCKED__', locked: true }])
    assert.deepEqual(parseDetectOutput(raw), [
      { pid: -1, name: '__LOCKED__', locked: true }
    ])
  })

  it('parses __LOCKED__ hint with locked=false', () => {
    const raw = JSON.stringify([{ pid: -1, name: '__LOCKED__', locked: false }])
    assert.deepEqual(parseDetectOutput(raw), [
      { pid: -1, name: '__LOCKED__', locked: false }
    ])
  })

  it('returns empty array for empty/whitespace input', () => {
    assert.deepEqual(parseDetectOutput(''), [])
    assert.deepEqual(parseDetectOutput('   '), [])
    assert.deepEqual(parseDetectOutput(null), [])
    assert.deepEqual(parseDetectOutput(undefined), [])
  })

  it('throws on invalid JSON', () => {
    assert.throws(() => parseDetectOutput('not json'), /JSON/)
  })
})
