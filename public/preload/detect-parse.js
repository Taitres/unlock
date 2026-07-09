function parseDetectOutput(raw) {
  if (!raw || !raw.trim()) return []
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : [parsed]
}

module.exports = { parseDetectOutput }
