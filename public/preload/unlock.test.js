const assert = require('node:assert/strict')
const { describe, it } = require('node:test')
const { buildHandleScript } = require('./unlock')

describe('unlock', () => {
  describe('buildHandleScript', () => {
    it('generates PowerShell script with handle.exe path and search term', () => {
      const script = buildHandleScript('C:\\tools\\handle.exe', false, 'C:\\test\\file.txt')
      assert(script.includes('handle.exe'))
      assert(script.includes('-accepteula'))
      assert(script.includes('file.txt'))
      assert(script.includes('$OutputEncoding'))
    })

    it('uses basename for files, full path for directories', () => {
      const fileScript = buildHandleScript('handle.exe', false, 'C:\\project\\data\\report.pdf')
      assert(!fileScript.includes('C:\\project\\data\\report.pdf'), 'should not include full path for files')
      assert(fileScript.includes('report.pdf'), 'should include basename for files')

      const dirScript = buildHandleScript('handle.exe', true, 'C:\\project\\data')
      assert(dirScript.includes('C:\\project\\data'), 'should include full path for directories')
    })

    it('escapes single quotes in paths', () => {
      const script = buildHandleScript('handle.exe', false, "C:\\test\\it's.txt")
      assert(script.includes("it''s.txt"))
    })

    it('sets OutputEncoding to UTF-8', () => {
      const script = buildHandleScript('handle.exe', false, 'C:\\test.txt')
      assert(script.includes('$OutputEncoding = [System.Text.Encoding]::UTF8'))
    })
  })
})
