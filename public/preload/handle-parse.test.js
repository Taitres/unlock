const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseHandleExeOutput, isPathInside } = require('./handle-parse')

describe('parseHandleExeOutput', () => {
  it('returns empty array for empty/whitespace input', () => {
    assert.deepEqual(parseHandleExeOutput(''), [])
    assert.deepEqual(parseHandleExeOutput('   '), [])
    assert.deepEqual(parseHandleExeOutput(null), [])
    assert.deepEqual(parseHandleExeOutput(undefined), [])
  })

  it('parses a single file handle entry with handlePath', () => {
    const raw = [
      'Nthandle v5.0 - Handle viewer',
      'Copyright (C) 1997-2022 Mark Russinovich',
      'Sysinternals - www.sysinternals.com',
      '',
      '------',
      'notepad.exe      pid: 5678   type: File            1A4: D:\\path\\to\\file.txt'
    ].join('\n')
    assert.deepEqual(parseHandleExeOutput(raw), [
      { pid: 5678, name: 'notepad', handlePath: 'D:\\path\\to\\file.txt' }
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
    assert.deepEqual(result.map(r => r.handlePath).sort(), [
      'D:\\path\\to\\file.txt',
      'D:\\path\\to\\file.txt',
      'D:\\path\\to\\file.txt'
    ])
  })

  it('deduplicates same PID with multiple handles', () => {
    const raw = [
      'notepad.exe      pid: 5678   type: File            1A4: D:\\path\\to\\file.txt',
      '                 pid: 5678   type: File            2B4: D:\\path\\to\\other.txt',
      '                 pid: 5678   type: File            3C4: D:\\path\\to\\third.txt'
    ].join('\n')
    assert.deepEqual(parseHandleExeOutput(raw), [
      { pid: 5678, name: 'notepad', handlePath: 'D:\\path\\to\\file.txt' }
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
      { pid: 5678, name: 'notepad', handlePath: 'D:\\path' }
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
      { pid: 5678, name: 'notepad', handlePath: 'D:\\path' }
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

describe('isPathInside', () => {
  it('returns true when handlePath is empty (cannot verify)', () => {
    assert.equal(isPathInside('', 'C:\\proj'), true)
    assert.equal(isPathInside(undefined, 'C:\\proj'), true)
  })

  it('returns true for exact match (directory itself)', () => {
    assert.equal(isPathInside('C:\\proj\\myapp', 'C:\\proj\\myapp'), true)
  })

  it('returns true for files inside the directory', () => {
    assert.equal(isPathInside('C:\\proj\\myapp\\target\\App.class', 'C:\\proj\\myapp'), true)
    assert.equal(isPathInside('C:\\proj\\myapp\\src\\Main.java', 'C:\\proj\\myapp'), true)
  })

  it('returns false for sibling directories with similar names', () => {
    assert.equal(isPathInside('C:\\proj\\myapp_backup', 'C:\\proj\\myapp'), false)
    assert.equal(isPathInside('C:\\proj\\myapp_v2', 'C:\\proj\\myapp'), false)
    assert.equal(isPathInside('C:\\proj\\myapplication', 'C:\\proj\\myapp'), false)
  })

  it('handles case-insensitivity on Windows paths', () => {
    assert.equal(isPathInside('c:\\PROJ\\MyApp\\file.txt', 'C:\\proj\\myapp'), true)
    assert.equal(isPathInside('C:\\PROJ\\MYAPP', 'c:\\proj\\myapp'), true)
  })

  it('normalizes forward slashes to backslashes', () => {
    assert.equal(isPathInside('C:/proj/myapp/file.txt', 'C:\\proj\\myapp'), true)
    assert.equal(isPathInside('C:\\proj\\myapp\\file.txt', 'C:/proj/myapp'), true)
  })

  it('handles trailing slashes in directory path', () => {
    assert.equal(isPathInside('C:\\proj\\myapp\\file.txt', 'C:\\proj\\myapp\\'), true)
    assert.equal(isPathInside('C:\\proj\\myapp', 'C:\\proj\\myapp\\\\'), true)
  })
})
