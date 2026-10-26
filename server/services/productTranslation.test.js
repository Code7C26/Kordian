const assert = require('node:assert/strict')
const test = require('node:test')
const { createProductTranslationService } = require('./productTranslation')

test('translates product names through a LibreTranslate-compatible endpoint', async () => {
  const requests = []
  const service = createProductTranslationService({
    serviceUrl: 'http://libretranslate:5000/translate',
    apiKey: 'test-key',
    fetchImpl: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) })
      return { ok: true, json: async () => ({ translatedText: 'Whole milk' }) }
    },
  })

  const translations = await service.translate(['Leche entera'])

  assert.equal(translations.get('Leche entera'), 'Whole milk')
  assert.deepEqual(requests, [{
    url: 'http://libretranslate:5000/translate',
    body: {
      q: 'Leche entera',
      source: 'auto',
      target: 'en',
      format: 'text',
      api_key: 'test-key',
    },
  }])
})

test('caches translations and avoids repeated provider requests', async () => {
  let requestCount = 0
  const service = createProductTranslationService({
    serviceUrl: 'http://libretranslate:5000/translate',
    fetchImpl: async () => {
      requestCount += 1
      return { ok: true, json: async () => ({ translatedText: 'Rice' }) }
    },
  })

  await service.translate(['Arroz'])
  await service.translate(['Arroz'])

  assert.equal(requestCount, 1)
})

test('rejects missing provider configuration instead of returning untranslated text', async () => {
  const service = createProductTranslationService({ serviceUrl: '' })
  await assert.rejects(
    service.translate(['Producto nuevo']),
    { code: 'TRANSLATION_SERVICE_NOT_CONFIGURED' },
  )
})

test('rejects provider responses without translated text', async () => {
  const service = createProductTranslationService({
    serviceUrl: 'http://libretranslate:5000/translate',
    fetchImpl: async () => ({ ok: true, json: async () => ({}) }),
  })
  await assert.rejects(service.translate(['Producto nuevo']), /empty translation/)
})

test('rejects unsafe or invalid provider URLs', () => {
  assert.throws(
    () => createProductTranslationService({ serviceUrl: 'file:///etc/passwd' }),
    /HTTP\(S\) URL/,
  )
  assert.throws(
    () => createProductTranslationService({ serviceUrl: 'https://user:secret@example.com/translate' }),
    /without embedded credentials/,
  )
})
