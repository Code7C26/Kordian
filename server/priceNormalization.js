function normalizeNumericString(value) {
  if (value === null || value === undefined || value === '') return null

  const text = String(value).trim().replace(/\s+/g, '')
  if (!text) return null

  const hasComma = text.includes(',')
  const hasDot = text.includes('.')

  if (hasComma && hasDot) {
    const lastComma = text.lastIndexOf(',')
    const lastDot = text.lastIndexOf('.')
    if (lastComma > lastDot) {
      return text.replace(/\./g, '').replace(',', '.')
    }
    return text.replace(/,/g, '')
  }

  if (hasComma) {
    const commaParts = text.split(',')
    if (commaParts.length > 2) {
      return commaParts.join('').replace(/(\d+),(\d+)$/, '$1.$2')
    }
    const decimalPart = commaParts[1] || ''
    const integerPart = commaParts[0] || ''
    if (decimalPart.length <= 2) {
      return `${integerPart}.${decimalPart}`
    }
    return `${integerPart}${decimalPart}`
  }

  if (hasDot) {
    const parts = text.split('.')
    if (parts.length > 2) {
      const last = parts.pop()
      const integer = parts.join('')
      return `${integer}.${last}`
    }

    if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
      return text.replace(/\./g, '')
    }
  }

  return text
}

function parsePrice(value) {
  const normalized = normalizeNumericString(value)
  if (normalized === null) return null

  const price = Number(normalized)
  return Number.isFinite(price) ? price : null
}

function normalizeNumericValue(value) {
  const normalized = normalizeNumericString(value)
  if (normalized === null) return null

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

module.exports = { parsePrice, normalizeNumericValue }
