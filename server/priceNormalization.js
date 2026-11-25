function invalidPriceResult(originalValue, reason, method = null) {
  return {
    status: reason === 'ambiguous_format' ? 'ambiguous' : 'invalid',
    originalValue,
    normalizedValue: null,
    method,
    reason,
  }
}

function parseMonetaryAmount(value, { locale = 'es-AR', allowZero = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return invalidPriceResult(value, 'unsupported_type')
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || (value === 0 && !allowZero)) {
      return invalidPriceResult(value, 'non_positive')
    }
    const cents = Math.round(value * 100)
    if (!Number.isSafeInteger(cents)) return invalidPriceResult(value, 'precision_out_of_range')
    if (Math.abs(value - cents / 100) > Number.EPSILON * Math.max(1, Math.abs(value)) * 4) {
      return invalidPriceResult(value, 'invalid_decimal_precision')
    }
    return {
      status: 'valid',
      originalValue: value,
      normalizedValue: cents / 100,
      method: 'number',
      reason: null,
    }
  }

  let text = value.trim().replace(/[\s\u00a0\u202f]+/g, '')
  if (!text) return invalidPriceResult(value, 'empty_value')

  const hasCurrencySymbol = text.startsWith('$')
  if (hasCurrencySymbol) text = text.slice(1)
  if (!/^\d[\d.,]*$/.test(text)) return invalidPriceResult(value, 'unsupported_characters')
  if (/[eE]/.test(text)) return invalidPriceResult(value, 'scientific_notation')

  const hasComma = text.includes(',')
  const hasDot = text.includes('.')
  let canonical
  let method

  if (hasComma && hasDot) {
    if (locale === 'en-US'
      && /^\d{1,3}(?:,\d{3})+\.\d{1,2}$/.test(text)) {
      canonical = text.replace(/,/g, '')
      method = 'en-US-grouped-decimal'
    } else if (locale === 'es-AR'
      && /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(text)) {
      canonical = text.replace(/\./g, '').replace(',', '.')
      method = 'es-AR-grouped-decimal'
    } else {
      return invalidPriceResult(value, 'invalid_grouping')
    }
  } else if (hasComma) {
    if (locale === 'en-US' && /^\d{1,3}(?:,\d{3})+$/.test(text)) {
      canonical = text.replace(/,/g, '')
      method = 'en-US-grouping'
    } else if (locale === 'es-AR' && /^\d{1,3}(?:,\d{3})+$/.test(text)) {
      return invalidPriceResult(value, 'ambiguous_format', 'comma_with_three_trailing_digits')
    } else if (locale === 'es-AR' && /^\d+,\d{1,2}$/.test(text)) {
      canonical = text.replace(',', '.')
      method = 'comma-decimal'
    } else {
      return invalidPriceResult(value, 'invalid_grouping')
    }
  } else if (hasDot) {
    if (locale === 'es-AR' && /^\d{1,3}(?:\.\d{3})+$/.test(text)) {
      canonical = text.replace(/\./g, '')
      method = 'es-AR-grouping'
    } else if (/^\d+\.\d{1,2}$/.test(text)) {
      canonical = text
      method = 'dot-decimal'
    } else if (locale === 'en-US' && /^\d{1,3}(?:\.\d{3})+$/.test(text)) {
      return invalidPriceResult(value, 'ambiguous_format', 'dot_with_three_trailing_digits')
    } else {
      return invalidPriceResult(value, 'invalid_decimal_precision')
    }
  } else {
    canonical = text
    method = 'integer'
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(canonical)) {
    return invalidPriceResult(value, 'invalid_decimal_precision', method)
  }
  const [whole, fraction = ''] = canonical.split('.')
  if (whole.replace(/^0+(?=\d)/, '').length > 14) {
    return invalidPriceResult(value, 'precision_out_of_range', method)
  }
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    return invalidPriceResult(value, 'precision_out_of_range', method)
  }
  if (cents === 0n && !allowZero) return invalidPriceResult(value, 'non_positive', method)

  return {
    status: 'valid',
    originalValue: value,
    normalizedValue: Number(cents) / 100,
    method: hasCurrencySymbol ? `currency-${method}` : method,
    reason: null,
  }
}

function parsePrice(value) {
  const parsed = parseMonetaryAmount(value)
  return parsed.status === 'valid' ? parsed.normalizedValue : null
}

function normalizeNumericValue(value) {
  const parsed = parseMonetaryAmount(value, { allowZero: true })
  return parsed.status === 'valid' ? parsed.normalizedValue : null
}

function normalizeDiscoStoredPrice(value) {
  return normalizeNumericValue(value)
}

function classifyPriceVariation(previousValue, currentValue) {
  const current = parseMonetaryAmount(currentValue, { locale: 'numeric' })
  if (current.status !== 'valid') {
    return { status: 'invalid', ratio: null, reason: current.reason }
  }
  if (previousValue === null || previousValue === undefined) {
    return { status: 'insufficient_history', ratio: null, reason: 'no_previous_price' }
  }

  const previous = parseMonetaryAmount(previousValue, { locale: 'numeric' })
  if (previous.status !== 'valid') {
    return { status: 'invalid', ratio: null, reason: 'invalid_previous_price' }
  }
  const ratio = Math.max(previous.normalizedValue, current.normalizedValue)
    / Math.min(previous.normalizedValue, current.normalizedValue)
  if (ratio < 10) return { status: 'valid', ratio, reason: null }

  const scale = [10, 100, 1000].find((candidate) => (
    Math.abs(ratio / candidate - 1) <= 0.1
  ))
  return {
    status: 'requires_review',
    ratio: Number(ratio.toFixed(6)),
    reason: scale ? `scale_change_x${scale}` : 'abrupt_price_change',
  }
}

function isDiscoScaleCorrection(previousPrice, currentPrice) {
  const previous = Number(previousPrice)
  const current = Number(currentPrice)
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= current || current <= 0) return false
  const ratio = previous / current
  return ratio >= 85 && ratio <= 110
}

module.exports = {
  parseMonetaryAmount,
  parsePrice,
  normalizeNumericValue,
  normalizeDiscoStoredPrice,
  classifyPriceVariation,
  isDiscoScaleCorrection,
}
