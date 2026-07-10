const assert = require('node:assert')
const { describe, it } = require('node:test')
const { buildHandleScript } = require('./unlock')

describe('unlock', () => {
  describe('buildHandleScript', () => {
    it('generates PowerShell script with handle.exe path and search term', () => {
      var script = buildHandleScript('C:\\tools\\handle.exe', false, 'C:\\test\\file.txt')
      assert(script.includes('handle.exe'))
      assert(script.includes('-accepteula'))
      assert(script.includes('file.txt'))
      assert(script.includes('$OutputEncoding'))
    })

    it('uses basename for files, full path for directories', () => {
      var fileScript = buildHandleScript('handle.exe', false, 'C:\\project\\data\\report.pdf')
      assert(!fileScript.includes('C:\\project\\data\\report.pdf'), 'should not include full path for files')
      assert(fileScript.includes('report.pdf'), 'should include basename for files')

      var dirScript = buildHandleScript('handle.exe', true, 'C:\\project\\data')
      assert(dirScript.includes('C:\\project\\data'), 'should include full path for directories')
    })

    it('escapes single quotes in paths', () => {
      var script = buildHandleScript('handle.exe', false, "C:\\test\\it's.txt")
      assert(script.includes("it''s.txt"))
    })

    it('sets OutputEncoding to UTF-8', () => {
      var script = buildHandleScript('handle.exe', false, 'C:\\test.txt')
      assert(script.includes('$OutputEncoding = [System.Text.Encoding]::UTF8'))
    })
  })
})
