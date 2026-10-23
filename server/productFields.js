function normalizeOptionalReference(value) {
  if (typeof value !== 'string') return value ?? null
  return value.trim() || null
}

module.exports = { normalizeOptionalReference }
