const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseHandleExeOutput } = require('./handle-parse')

describe('parseHandleExeOutput', () => {
  it('returns empty array for empty/whitespace input', () => {
    assert.deepEqual(parseHandleExeOutput(''), [])
    assert.deepEqual(parseHandleExeOutput('   '), [])
    assert.deepEqual(parseHandleExeOutput(null), [])
    assert.deepEqual(parseHandleExeOutput(undefined), [])
  })

  it('parses a single file handle entry', () => {
    const raw = [
      'Nthandle v5.0 - Handle viewer',
      'Copyright (C) 1997-2022 Mark Russinovich',
      'Sysinternals - www.sysinternals.com',
      '',
      '------',
      'notepad.exe      pid: 5678   type: File            1A4: D:\\path\\to\\file.txt'
    ].join('\n')
    assert.deepEqual(parseHandleExeOutput(raw), [
      { pid: 5678, name: 'notepad' }
    ])
  })

  it('parses multiple distinct process entries', () => {
    const raw = [
      'notepad.exe      pid: 5678   type: File            1A4: D:\\path\\to\\file.txt',
      'msedge.exe       pid: 9012   type: File            2B4: D:\\path\\to\\file.txt',
      'explorer.exe     pid: 1234   type: File            3C4: D:\\path\\to\\file.txt'
    ].join('\n')
    const result = parseHandleExeOutput(raw)
    assert.equal(result.length, 3)
    assert.deepEqual(result.map(r => r.pid).sort(), [1234, 5678, 9012])
    assert.deepEqual(result.map(r => r.name).sort(), ['explorer', 'msedge', 'notepad'])
  })

  it('deduplicates same PID with multiple handles', () => {
    const raw = [
      'notepad.exe      pid: 5678   type: File            1A4: D:\\path\\to\\file.txt',
      '                 pid: 5678   type: File            2B4: D:\\path\\to\\file.txt',
      '                 pid: 5678   type: File            3C4: D:\\path\\to\\file.txt'
    ].join('\n')
    assert.deepEqual(parseHandleExeOutput(raw), [
      { pid: 5678, name: 'notepad' }
    ])
  })

  it('filters out non-file handle types', () => {
    const raw = [
      'notepad.exe      pid: 5678   type: File            1A4: D:\\path',
      'svchost.exe      pid: 1234   type: Key             2B4: \\REG\\MACHINE',
      'explorer.exe     pid: 9999   type: Section         3C4: \\BaseNamedObjects\\foo',
      'msedge.exe       pid: 9012   type: File            4D4: D:\\path'
    ].join('\n')
    const result = parseHandleExeOutput(raw)
    assert.equal(result.length, 2)
    assert.deepEqual(result.map(r => r.pid).sort(), [5678, 9012])
  })

  it('handles case-insensitive type match', () => {
    const raw = 'notepad.exe      pid: 5678   type: FILE            1A4: D:\\path'
    assert.deepEqual(parseHandleExeOutput(raw), [
      { pid: 5678, name: 'notepad' }
    ])
  })

  it('silently skips malformed lines', () => {
    const raw = [
      'Nthandle v5.0 - Handle viewer',                    // banner
      'Copyright (C) 1997-2022 Mark Russinovich',          // banner
      'Sysinternals - www.sysinternals.com',               // banner
      '',                                                   // blank
      '------',                                             // separator
      'garbage line with no pid',                          // malformed
      '   pid: 5678   type: File            1A4: D:\\path', // no process name (different format)
      'notepad.exe      pid: 5678   type: File            1A4: D:\\path'  // valid
    ].join('\n')
    assert.deepEqual(parseHandleExeOutput(raw), [
      { pid: 5678, name: 'notepad' }
    ])
  })

  it('returns empty array when only banner present', () => {
    const raw = [
      'Nthandle v5.0 - Handle viewer',
      'Copyright (C) 1997-2022 Mark Russinovich',
      'Sysinternals - www.sysinternals.com'
    ].join('\n')
    assert.deepEqual(parseHandleExeOutput(raw), [])
  })
})
