const DISCO_API_URL = 'https://www.disco.com.ar/api/catalog_system/pub/products/search'
const DISCO_IMAGE_CHECK_CONCURRENCY = 8
const DISCO_PROMOTION_CACHE_TTL_MS = 10 * 60 * 1000
const DISCO_PROMOTION_CACHE_MAX_ENTRIES = 256
const DISCO_MAX_LIST_PRICE_RATIO = 10
import { createCommonProduct, getCommonInvalidReason, isValidCommonProduct } from './importerContract.js'
import { extractGenericProductProfile, extractJsonLdProductItems, parseHtmlProductDetails } from './htmlProductParser.js'
import {
  resolveCatalogMappingFromExamples,
  suggestCatalogMapping,
} from './catalogTaxonomy.js'
import priceNormalization from '../priceNormalization.js'

const { parseMonetaryAmount } = priceNormalization

export class InvalidDiscoPromotionRequestError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidDiscoPromotionRequestError'
  }
}

const numeric = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const normalizeName = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const invalidProductNamePattern = /\b(envio|envios|entrega|delivery|shipping|oferta|promo|promocion|promociones)\b/i
const productMeasurePattern = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|kilo(?:s)?|g|gr|gramo(?:s)?|mg|l|lt|lts|litro(?:s)?|ml|cc|cl|unidad(?:es)?|un|uds?|u)\b/i

function normalizeDiscoPrice(value) {
  const parsed = parseMonetaryAmount(value, { locale: 'numeric' })
  return parsed.status === 'valid' ? parsed.normalizedValue : 0
}

function getTokenPrice(token) {
  if (token == null || token === '') return { price: null, status: 'missing' }
  if (typeof token !== 'string') return { price: null, status: 'invalid', reason: 'token_not_string' }
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString())
    const parsed = parseMonetaryAmount(payload?.data?.price, { locale: 'numeric' })
    return parsed.status === 'valid'
      ? { price: parsed.normalizedValue, status: 'valid' }
      : { price: null, status: 'invalid', reason: parsed.reason }
  } catch {
    return { price: null, status: 'invalid', reason: 'malformed_token_payload' }
  }
}

const categoryMapping = [
  { matches: ['bebidas', 'gaseosas', 'aguas', 'jugos', 'cervezas', 'vinos', 'soda', 'energizante'], category: 'Almacén y Alimentos', subcategory: 'Bebidas' },
  { matches: ['azucar', 'edulcorante', 'miel', 'endulzante'], category: 'Almacén y Alimentos', subcategory: 'Azúcares y dulces' },
  { matches: ['yerba', 'yerbas', 'mate', 'tes', 'infusiones', 'cafes', 'mate cocido', 'te'], category: 'Almacén y Alimentos', subcategory: 'Infusiones' },
  { matches: ['leche', 'leches', 'yogur', 'yogures', 'queso', 'quesos', 'lacteo', 'lacteos', 'dulce de leche', 'manteca'], category: 'Alimentos Frescos y Refrigerados', subcategory: 'Lácteos' },
  { matches: ['limpieza', 'lavandina', 'detergente', 'desinfectante', 'papel higienico', 'escoba'], category: 'Limpieza e Higiene', subcategory: 'Limpieza del hogar' },
  { matches: ['perfumeria', 'jabones', 'higiene personal'], category: 'Limpieza e Higiene', subcategory: 'Higiene personal' },
  { matches: ['cuidado capilar', 'capilar'], category: 'Limpieza e Higiene', subcategory: 'Cuidado capilar' },
  { matches: ['cuidado oral', 'cuidado bucal'], category: 'Limpieza e Higiene', subcategory: 'Cuidado bucal' },
  { matches: ['electro', 'televisores', 'informatica', 'audio', 'notebook', 'celular'], category: 'Electrónica y Electrodomésticos', subcategory: 'Computación' },
]

function matchesNormalizedTerm(text, match) {
  const normalizedText = normalizeName(text)
  const normalizedMatch = normalizeName(match)
  if (!normalizedMatch) return false
  const matchTokens = normalizedMatch.split(/\s+/).filter(Boolean)
  if (matchTokens.length <= 1) return normalizedText === normalizedMatch
  const textTokens = normalizedText.split(/\s+/).filter(Boolean)
  return normalizedText === normalizedMatch || matchTokens.every((token) => textTokens.includes(token))
}

function suggestMapping(categories = []) {
  const segments = categories
    .flatMap((category) => String(category || '').split(/[/>]/))
    .map(normalizeName)
    .filter(Boolean)
  return categoryMapping.filter(({ matches }) => (
    matches.some((match) => segments.some((segment) => matchesNormalizedTerm(segment, match)))
  ))
}

const explicitDiscoBazarAccessoryPattern = /\b(?:bombillas?|yerberas?|azucareras?|filtros?\s+(?:de\s+cafe|de\s+papel\s+para\s+cafe)|recipientes?\s+(?:para|de)\s+yerba|portayerbas?)\b/
const discoCanisterPattern = /\bcanisters?\b/
const discoConsumableInfusionPattern = /\b(?:yerbas?|mate\s+cocido|tes?|cafes?\s+(?:tostado\s+molido|molido|torrado|instantaneo|soluble|en\s+grano|en\s+saquitos)|infusiones?)\b/
const discoLightingProductPattern = /\b(?:bombillas?\s+(?:led|dicroicas?|halogenas?|incandescentes?)|lamparas?|luminarias?|iluminacion)\b/
const discoLightingSourcePattern = /\b(?:ferreteria\s+)?lamparas?\b/
const discoBathroomSourcePattern = /\bbanos?\b/
const discoKitchenSourcePattern = /\bcocina\b/

function isDiscoConsumableInfusion(text) {
  return discoConsumableInfusionPattern.test(text)
    && !/\b(?:para|de)\s+yerbas?\b/.test(text)
}

function isDiscoMateAccessory(name) {
  return /^mate(?:\s|$)/.test(name)
    && !/^mate\s+cocido\b/.test(name)
}

function isDiscoLightingProduct(text, sourceText) {
  return discoLightingProductPattern.test(text)
    || (/\bbombillas?\b/.test(text) && discoLightingSourcePattern.test(sourceText))
}

function isDiscoKitchenCanister(name, sourceText) {
  if (!discoCanisterPattern.test(name)) return false
  const mentionsKitchen = discoKitchenSourcePattern.test(`${name} ${sourceText}`)
  const mentionsBathroom = discoBathroomSourcePattern.test(sourceText)
  return mentionsKitchen && !mentionsBathroom
}

function undeterminedDiscoSuggestion(status = 'insufficient_evidence', reason = 'no_reliable_product_type') {
  return {
    category: null,
    subcategory: null,
    confidence: 'low',
    reason,
    rule: null,
    status,
    alternatives: [],
  }
}

const discoPrimaryProductRules = [
  {
    pattern: /\b(?:dog\s+chow|whiskas|temptations)\b/,
    category: 'Hogar y Otros',
    subcategory: 'Mascotas',
    rule: 'disco_pet_food_brand',
  },
  {
    pattern: /\b(?:alimento(?:s)?\s+(?:balanceado(?:s)?\s+)?(?:para\s+)?(?:perro(?:s)?|gato(?:s)?)|(?:perro(?:s)?|gato(?:s)?)\s+(?:adulto(?:s)?\s+)?(?:alimento|comida|balanceado))\b/,
    category: 'Hogar y Otros',
    subcategory: 'Mascotas',
    rule: 'disco_pet_food',
  },
  {
    pattern: /\b(?:licores?\s+(?:de\s+)?(?:crema|amarula)|amarula|baileys|irish\s+cream)\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Bebidas',
    rule: 'disco_cream_liqueur',
  },
  {
    pattern: /\blicor\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Bebidas',
    rule: 'disco_liqueur',
  },
  {
    pattern: /^(?:leches?|yogur(?:t)?|bebidas?\s+lacteas?|postres?\s+lacteos?)\b.*\bchocolate\b/,
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Lácteos',
    rule: 'disco_chocolate_dairy',
  },
  {
    pattern: /^(?:leches?|yogur(?:t)?|bebidas?\s+lacteas?|postres?\s+lacteos?)\b/,
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Lácteos',
    rule: 'disco_dairy_product_type',
  },
  {
    pattern: /\balfajor(?:es)?\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Golosinas y snacks',
    rule: 'disco_alfajor',
  },
  {
    pattern: /\bma[ií]z\s+(?:frito|tostado)\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Golosinas y snacks',
    rule: 'disco_maize_snack',
  },
  {
    pattern: /\bkombucha\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Bebidas',
    rule: 'disco_kombucha',
  },
  {
    pattern: /\b(?:pasta\s+dental|crema\s+dental|dentifrico|enjuague\s+bucal|cepillos?\s+(?:de\s+)?dentales?|hilo\s+dental|cuidado\s+bucal)\b/,
    category: 'Limpieza e Higiene',
    subcategory: 'Cuidado bucal',
    rule: 'disco_oral_care',
  },
  {
    pattern: /\b(?:shampoo|champu|acondicionador|crema\s+para\s+peinar|crema\s+capilar|tratamiento\s+capilar|mascara\s+capilar)\b/,
    category: 'Limpieza e Higiene',
    subcategory: 'Cuidado capilar',
    rule: 'disco_hair_care',
  },
  {
    pattern: /\b(?:crema\s+de\s+leche|crema\s+doble|crema\s+para\s+cocinar|crema\s+liviana)\b/,
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Lácteos',
    rule: 'disco_dairy_cream',
  },
  {
    pattern: /\bnivea\s+soft\b/,
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene personal',
    rule: 'disco_nivea_soft',
  },
  {
    pattern: /\b(?:crema\s+(?:corporal|facial|para\s+manos|de\s+manos|de\s+afeitar|hidratante)|crema\s+(?:nivea|garnier|dove|neutrogena)\b|desodorantes?\b|tonicos?\b|(?:agua|producto|productos)\s+micelar(?:es)?|jabon(?:es)?\s+de\s+tocador|perfume|cuidado\s+personal)\b/,
    category: 'Limpieza e Higiene',
    subcategory: 'Higiene personal',
    rule: 'disco_personal_care',
  },
  {
    pattern: /\b(?:jabon\s+en\s+pan(?:\s+(?:para|de)\s+(?:lavar|ropa))?|jabon\s+para\s+ropa|detergente\s+para\s+ropa|suavizantes?|lavado\s+de\s+ropa)\b/,
    category: 'Limpieza e Higiene',
    subcategory: 'Lavado de ropa',
    rule: 'disco_laundry',
  },
  {
    pattern: /\b(?:limpiador\s+en\s+crema|limpiadores?\s+de\s+superficies|limpiador(?:es)?\s+(?:multiuso|multiproposito|de\s+pisos|del\s+hogar)|lustramuebles|limpieza\s+del\s+hogar)\b/,
    category: 'Limpieza e Higiene',
    subcategory: 'Limpieza del hogar',
    rule: 'disco_home_cleaning',
  },
  {
    pattern: /\b(?:detergente(?:s)?\s+(?:lavavajillas?|para\s+(?:lavar\s+)?vajilla)|crema\s+(?:lavavajillas?|para\s+(?:lavar\s+)?vajilla)|lavavajillas?|limpiador(?:es)?\s+de\s+cocina|desengrasante(?:s)?\s+de\s+cocina|limpieza\s+de\s+cocina)\b/,
    category: 'Limpieza e Higiene',
    subcategory: 'Limpieza de cocina',
    rule: 'disco_kitchen_cleaning',
  },
  {
    pattern: /\b(?:bowl|platos?|mugs?|tazas?|azucareras?|fuentes?)\b.*\b(?:ceramic[oa]|color\s+crema|tono\s+crema)\b|\b(?:color\s+crema|tono\s+crema)\b.*\b(?:bowl|platos?|mugs?|tazas?|azucareras?|fuentes?)\b/,
    category: 'Hogar y Otros',
    subcategory: 'Cocina y bazar',
    rule: 'disco_bazar_color',
  },
  {
    pattern: /\b(?:galletitas?|galletas?)\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Galletitas y productos de panificación',
    rule: 'disco_biscuits',
  },
  {
    pattern: /\b(?:papas?\s+(?:fritas?\s+)?sabor|papas?\s+fritas?|gomitas?|pastillas?\s+(?:de\s+)?(?:goma|sabor)|caramelos?|chupetines?)\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Golosinas y snacks',
    rule: 'disco_snack_or_candy',
  },
  {
    pattern: /\bhelados?\b/,
    category: 'Alimentos Frescos y Refrigerados',
    subcategory: 'Helados',
    rule: 'disco_ice_cream',
  },
  {
    pattern: /\b(?:sopas?\s+crema)\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Conservas y alimentos preparados',
    rule: 'disco_soup',
  },
  {
    pattern: /\bpolenta\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Pastas y harinas',
    rule: 'disco_polenta',
  },
  {
    pattern: /\b(?:aderezos?|mayonesa|salsas?)\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Aceites, condimentos y aderezos',
    rule: 'disco_condiment',
  },
  {
    pattern: /^(?:chocolates?|bombones?)\b/,
    category: 'Almacén y Alimentos',
    subcategory: 'Golosinas y snacks',
    rule: 'disco_chocolate_product',
  },
]

function createDiscoSuggestion({ category, subcategory, rule }, sourceMappings = []) {
  const conflictsWithSource = sourceMappings.some((mapping) => (
    mapping.category !== category || mapping.subcategory !== subcategory
  ))
  return {
    category,
    subcategory,
    confidence: conflictsWithSource ? 'medium' : 'high',
    reason: conflictsWithSource ? 'specific_product_type_conflicts_with_source' : 'explicit_primary_product_type',
    rule,
    status: 'determined',
    alternatives: [],
  }
}

export function suggestDiscoCatalogMapping(product = {}) {
  const name = normalizeName(product.name || product.productName)
  const brand = product.brand || ''
  const sourceCategories = Array.isArray(product.sourceCategories) ? product.sourceCategories : []
  const originalCategory = product.sourceCategory || product.source_category || ''
  const originalSubcategory = product.sourceSubcategory || product.source_subcategory || ''
  const text = [name, brand].map(normalizeName).join(' ')
  const sourceText = [...sourceCategories, originalCategory, originalSubcategory].map(normalizeName).join(' ')
  const sourceMappings = suggestMapping([...sourceCategories, originalCategory, originalSubcategory])

  if (/\bfranui\b/.test(name)) {
    return undeterminedDiscoSuggestion('ambiguous', 'brand_product_type_requires_review')
  }

  const primaryProductRule = discoPrimaryProductRules.find(({ pattern }) => pattern.test(name))
  if (primaryProductRule) return createDiscoSuggestion(primaryProductRule, sourceMappings)

  if (isDiscoLightingProduct(text, sourceText)) {
    return createDiscoSuggestion({
      category: 'Hogar y Otros',
      subcategory: 'Iluminación',
      rule: 'disco_lighting_product',
    }, sourceMappings)
  }

  const canister = discoCanisterPattern.test(name)
  const kitchenCanister = isDiscoKitchenCanister(name, sourceText)
  if (canister && !kitchenCanister) {
    return undeterminedDiscoSuggestion(
      discoBathroomSourcePattern.test(sourceText) ? 'ambiguous' : 'insufficient_evidence',
      discoBathroomSourcePattern.test(sourceText) ? 'conflicting_source_context' : 'no_reliable_product_type',
    )
  }

  const explicitAccessory = explicitDiscoBazarAccessoryPattern.test(text)
    || kitchenCanister
  const mateAccessory = isDiscoMateAccessory(name)
  const consumableInfusion = isDiscoConsumableInfusion(text)
  if ((explicitAccessory || mateAccessory) && consumableInfusion) {
    return undeterminedDiscoSuggestion('ambiguous', 'conflicting_product_types')
  }
  if (explicitAccessory || mateAccessory) {
    return createDiscoSuggestion({
      category: 'Hogar y Otros',
      subcategory: 'Cocina y bazar',
      rule: 'disco_bazar_accessory',
    }, sourceMappings)
  }

  const suggestion = suggestCatalogMapping({
    ...product,
    name: product.name || product.productName,
    source_category: originalCategory,
    source_subcategory: originalSubcategory,
  })
  if (suggestion.status === 'determined' && suggestion.subcategory === 'Infusiones') {
    if (!consumableInfusion) {
      return undeterminedDiscoSuggestion()
    }
    return suggestion
  }
  if (suggestion.status === 'determined') {
    const sourceConflict = sourceMappings.some((mapping) => (
      mapping.category !== suggestion.category || mapping.subcategory !== suggestion.subcategory
    ))
    return sourceConflict
      ? undeterminedDiscoSuggestion('ambiguous', 'conflicting_source_and_product_type')
      : suggestion
  }
  if (suggestion.status !== 'insufficient_evidence') return suggestion

  const distinctSourceMappings = [...new Map(
    sourceMappings.map((mapping) => [`${mapping.category}:${mapping.subcategory}`, mapping]),
  ).values()]
  if (distinctSourceMappings.length > 1) {
    return undeterminedDiscoSuggestion('ambiguous', 'conflicting_source_categories')
  }
  const fallback = distinctSourceMappings[0]
  if (!fallback) return suggestion
  if (fallback.subcategory === 'Infusiones' && !consumableInfusion) {
    return undeterminedDiscoSuggestion()
  }
  return {
    category: fallback.category,
    subcategory: fallback.subcategory,
    confidence: 'medium',
    reason: 'disco_source_taxonomy_match',
    rule: 'disco_source_taxonomy_mapping',
    status: 'determined',
    alternatives: [],
  }
}

export function getDiscoProductClassification(product = {}, taxonomyExamples = []) {
  const manualMappingStatus = ['manual', 'manual_override'].includes(product.mappingStatus)
  const manual = manualMappingStatus
    || [product.classification_source, product.classificationSource]
      .some((source) => ['manual', 'manual_override'].includes(source))
  const ruleSuggestion = suggestDiscoCatalogMapping(product)
  const suggestion = manual
    ? ruleSuggestion
    : resolveCatalogMappingFromExamples(product, ruleSuggestion, taxonomyExamples)
  const manualConfidence = product.classificationConfidence
    ?? product.classification_confidence
  return {
    suggestion,
    isManual: manual,
    proposedCategory: manual
      ? product.proposedCategory || product.category || null
      : suggestion.status === 'determined' ? suggestion.category : null,
    proposedSubcategory: manual
      ? product.proposedSubcategory || product.subcategory || null
      : suggestion.status === 'determined' ? suggestion.subcategory : null,
    classificationSource: manual ? 'manual' : 'automatic',
    classificationConfidence: manual ? manualConfidence ?? 'manual' : suggestion.confidence,
    mappingStatus: manual
      ? manualMappingStatus ? product.mappingStatus : 'manual'
      : suggestion.status === 'ambiguous'
        ? 'revision_manual'
        : suggestion.status === 'determined' ? 'propuesta_automatica' : 'pendiente',
  }
}

export function buildDiscoProductTaxonomyFields(product = {}, classification) {
  return {
    classification_source: classification.classificationSource,
    classification_confidence: classification.classificationConfidence,
    source_category: product.sourceCategory || product.source_category || null,
    source_subcategory: product.sourceSubcategory || product.source_subcategory || null,
  }
}

function isOnlineOnly(item) {
  const text = JSON.stringify(item).toLowerCase()
  return /(exclusiv[oa]|solo|únicamente|unicamente)[^"\n]{0,30}(online|web|internet)|(online|web|internet)[^"\n]{0,30}(exclusiv[oa]|solo)/i.test(text)
}

function isLikelyProductImage(image, productName) {
  if (!image || !productName) return false
  const imageText = normalizeName(image)
  const productTokens = normalizeName(productName).split(/\s+/).filter((token) => token.length >= 5)
  return productTokens.some((token) => imageText.includes(token))
}

async function isPlaceholderRemoteImage(image) {
  if (!image || !/^https?:\/\//i.test(image)) return false
  try {
    const response = await fetch(image, { method: 'HEAD', signal: AbortSignal.timeout(8000) })
    return response.ok && response.headers.get('content-length') === '6948'
  } catch {
    return false
  }
}

function getOffer(item) {
  const sellers = (item.items || []).flatMap((catalogItem) => catalogItem.sellers || [])
  const seller = sellers.find((candidate) => candidate.commertialOffer?.IsAvailable && numeric(candidate.commertialOffer?.Price) > 0)
    || sellers.find((candidate) => numeric(candidate.commertialOffer?.Price) > 0)
  const offer = seller?.commertialOffer || {}
  const rawPrice = offer.Price ?? offer.PriceWithoutDiscount ?? offer.FullSellingPrice
  const tokenResult = getTokenPrice(offer.PriceToken)
  const tokenPrice = tokenResult.price
  // Keep the published VTEX price authoritative; the token is diagnostic only.
  const price = normalizeDiscoPrice(rawPrice)
  const listPriceCandidates = [
    { field: 'ListPrice', value: normalizeDiscoPrice(offer.ListPrice) },
    { field: 'PriceWithoutDiscount', value: normalizeDiscoPrice(offer.PriceWithoutDiscount) },
  ].filter(({ value }) => value > 0)
  const listPrice = listPriceCandidates.find(({ value }) => (
    value > price && value <= price * DISCO_MAX_LIST_PRICE_RATIO
  ))
  const rejectedListPrices = price > 0
    ? listPriceCandidates.filter(({ value }) => value > price * DISCO_MAX_LIST_PRICE_RATIO)
    : []
  return {
    price,
    listPrice: listPrice?.value || 0,
    listPriceWarning: rejectedListPrices.length
      ? {
          reason: 'list_price_ratio_exceeds_limit',
          cashPrice: price,
          maximumRatio: DISCO_MAX_LIST_PRICE_RATIO,
          rejectedPrices: rejectedListPrices.map(({ field, value }) => ({
            field,
            value,
            ratio: Number((value / price).toFixed(2)),
          })),
        }
      : null,
    available: Boolean(offer.IsAvailable),
    quantity: numeric(offer.AvailableQuantity),
    seller: seller?.sellerName || 'Disco',
    priceNormalization: {
      status: price > 0 ? 'valid' : 'invalid',
      originalValue: rawPrice ?? null,
      tokenValue: tokenPrice,
      normalizedValue: price || null,
      method: 'vtex-price',
      reason: price > 0 ? null : tokenResult.reason || 'invalid_source_price',
      tokenStatus: tokenResult.status,
      tokenReason: tokenResult.reason || null,
    },
  }
}

export function normalizeDiscoProduct(item) {
  const firstItem = item.items?.[0] || {}
  const categories = Array.isArray(item.categories) ? item.categories : []
  const sourceCategory = categories.at(-1)
    || categories[0]
    || item.sourceCategory
    || item.source_category
    || null
  const classification = getDiscoProductClassification({
    name: item.productName || firstItem.name || '',
    brand: item.brand || '',
    category: item.category || null,
    subcategory: item.subcategory || null,
    sourceCategory,
    sourceCategories: categories,
    sourceSubcategory: item.sourceSubcategory || item.source_subcategory || null,
    proposedCategory: item.proposedCategory || null,
    proposedSubcategory: item.proposedSubcategory || null,
    mappingStatus: item.mappingStatus || null,
    classificationSource: item.classificationSource || item.classification_source || null,
    classificationConfidence: item.classificationConfidence || item.classification_confidence || null,
  })
  const offer = getOffer(item)
  const product = createCommonProduct({
    source: 'disco',
    sourceProductId: String(item.productId || ''),
    sourceSku: String(firstItem.itemId || ''),
    ean: firstItem.ean || null,
    name: item.productName || firstItem.name || '',
    brand: item.brand || '',
    image: isLikelyProductImage(firstItem.images?.[0]?.imageUrl, item.productName) ? firstItem.images[0].imageUrl : '',
    price: offer.price,
    listPrice: offer.listPrice,
    available: offer.available,
    stock: offer.quantity,
    sourceCategory,
    sourceCategories: categories,
    sourceSubcategory: item.sourceSubcategory || item.source_subcategory || null,
    sourceUrl: item.link || null,
    proposedCategory: classification.proposedCategory,
    proposedSubcategory: classification.proposedSubcategory,
    mappingStatus: classification.mappingStatus,
    priceNormalization: offer.priceNormalization,
    ...(classification.isManual ? {
      classificationSource: classification.classificationSource,
      classificationConfidence: classification.classificationConfidence,
    } : {}),
    onlineOnly: isOnlineOnly(item),
    seller: offer.seller,
  }, 'disco')
  if (offer.listPriceWarning) product.listPriceWarning = offer.listPriceWarning
  return product
}

export function getDiscoProductInvalidReason(product = {}) {
  const name = String(product.name || '').trim()
  const price = numeric(product.price)
  if (!product.sourceProductId) return 'Sin identificador'
  if (!name) return 'Sin nombre'
  if (invalidProductNamePattern.test(name)) return 'Promoción, envío u oferta no válida'
  if (product.priceNormalization?.status && product.priceNormalization.status !== 'valid') {
    return product.priceNormalization.reason || 'Precio pendiente de validación'
  }
  if (price <= 0) return 'Sin precio válido'
  if (product.available === false) return 'Sin stock disponible'
  if (product.onlineOnly) return 'Exclusivo online'
  const hasImage = typeof product.image === 'string' && product.image.trim().length > 0
  const hasMeasure = productMeasurePattern.test([name, product.description, product.presentation, product.unit].filter(Boolean).join(' '))
  if (!hasImage && !hasMeasure) return 'Sin imagen ni cantidad identificable'
  return null
}

export function isValidDiscoProduct(product = {}) {
  return !getDiscoProductInvalidReason(product)
}

export function normalizeDiscoHtmlProduct(item = {}) {
  const categories = Array.isArray(item.sourceCategories) ? item.sourceCategories : []
  const sourceCategory = item.sourceCategory || categories.at(-1) || null
  const classification = getDiscoProductClassification({
    ...item,
    name: item.name,
    sourceCategory,
    sourceCategories: categories,
  })
  return createCommonProduct({
    ...item,
    source: 'disco',
    sourceCategory,
    sourceCategories: categories,
    sourceSubcategory: item.sourceSubcategory || null,
    proposedCategory: classification.proposedCategory,
    proposedSubcategory: classification.proposedSubcategory,
    mappingStatus: classification.mappingStatus,
    ...(classification.isManual ? {
      classificationSource: classification.classificationSource,
      classificationConfidence: classification.classificationConfidence,
    } : {}),
    seller: item.seller || 'Disco',
  }, 'disco')
}

export function parseDiscoProductDetailHtml(html = '') {
  return parseHtmlProductDetails(html, {
    source: 'disco',
    normalizeProduct: normalizeDiscoHtmlProduct,
    isValidProduct: isValidCommonProduct,
    getInvalidReason: getCommonInvalidReason,
    extractProfile: (value, options) => extractGenericProductProfile(value, options),
    fallbackCategory: 'Disco',
  })
}

export function parseDiscoPromotionFromHtml(html = '', ean, now = Date.now()) {
  const expectedEan = String(ean || '').replace(/\D/g, '')
  if (!/^\d{8,14}$/.test(expectedEan)) return null

  const today = new Date(now).toISOString().slice(0, 10)
  const product = extractJsonLdProductItems(html).find((item) => (
    String(item.ean || '').replace(/\D/g, '') === expectedEan
  ))
  if (!product || !Number.isFinite(product.price) || !Number.isFinite(product.listPrice)) return null

  if (product.priceValidUntil && product.priceValidUntil < today) return null
  if (product.price <= 0 || product.listPrice <= product.price) return null

  return {
    promotionPrice: product.price,
    referencePrice: product.listPrice,
    conditionsVerified: false,
    validUntil: product.priceValidUntil,
  }
}

function normalizeDiscoProductUrl(sourceUrl) {
  let url
  try {
    url = new URL(String(sourceUrl || ''))
  } catch {
    throw new InvalidDiscoPromotionRequestError('La URL de Disco no es válida')
  }

  if (
    url.protocol !== 'https:'
    || url.hostname !== 'www.disco.com.ar'
    || url.port
    || url.username
    || url.password
    || !url.pathname.endsWith('/p')
  ) {
    throw new InvalidDiscoPromotionRequestError('La URL debe corresponder a una ficha de producto de Disco')
  }

  url.search = ''
  url.hash = ''
  return url.toString()
}

export function createDiscoPromotionFetcher({
  fetchImpl = fetch,
  now = Date.now,
  cacheTtlMs = DISCO_PROMOTION_CACHE_TTL_MS,
  maxCacheEntries = DISCO_PROMOTION_CACHE_MAX_ENTRIES,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function')
  const cache = new Map()
  const inFlight = new Map()

  return async function fetchDiscoPromotion(ean) {
    const normalizedEan = String(ean || '').replace(/\D/g, '')
    if (!/^\d{8,14}$/.test(normalizedEan)) throw new InvalidDiscoPromotionRequestError('El EAN no es válido')

    const key = normalizedEan
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now()) return cached.promotion
    if (inFlight.has(key)) return inFlight.get(key)

    const request = (async () => {
      const params = new URLSearchParams({
        fq: `alternateIds_Ean:${normalizedEan}`,
        _from: '0',
        _to: '49',
      })
      const lookupResponse = await fetchImpl(`${DISCO_API_URL}?${params}`, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      })
      if (!lookupResponse.ok) throw new Error(`Disco respondió con HTTP ${lookupResponse.status}`)
      const products = await lookupResponse.json()
      const item = (Array.isArray(products) ? products : []).find((product) => (
        Array.isArray(product.items)
        && product.items.some((productItem) => (
          String(productItem.ean || '').replace(/\D/g, '') === normalizedEan
        ))
      ))
      if (!item?.link) {
        throw new InvalidDiscoPromotionRequestError('No se encontró la ficha de Disco para el EAN indicado')
      }

      const url = normalizeDiscoProductUrl(item.link)
      const response = await fetchImpl(url, {
        headers: { Accept: 'text/html' },
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error(`Disco respondió con HTTP ${response.status}`)

      const promotion = parseDiscoPromotionFromHtml(await response.text(), normalizedEan, now())
      cache.set(key, { promotion, expiresAt: now() + cacheTtlMs })
      while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value)
      return promotion
    })()
    inFlight.set(key, request)
    try {
      return await request
    } finally {
      inFlight.delete(key)
    }
  }
}

const fetchCachedDiscoPromotion = createDiscoPromotionFetcher()

export function fetchDiscoPromotion(ean) {
  return fetchCachedDiscoPromotion(ean)
}

async function fetchDiscoPage({ query = '', from = 0, to = 49 } = {}) {
  const safeFrom = Math.max(0, Number(from) || 0)
  const safeTo = Math.max(safeFrom, Number(to) || safeFrom)
  const pageSize = Math.min(50, Math.max(1, safeTo - safeFrom + 1))
  const params = new URLSearchParams({ _from: String(safeFrom), _to: String(safeFrom + pageSize - 1) })

  if (query.trim()) params.set('ft', query.trim())

  const response = await fetch(`${DISCO_API_URL}?${params}`)
  if (!response.ok) throw new Error(`Disco respondió con HTTP ${response.status}`)

  const data = await response.json()
  return Array.isArray(data) ? data : []
}

export async function fetchDiscoPreview({ query = '', from = 0, to = 49 } = {}) {
  const report = await fetchDiscoPreviewReport({ query, from, to })
  return report.products
}

export async function fetchDiscoPreviewReport({ query = '', from = 0, to = 49 } = {}) {
  const safeFrom = Math.max(0, Number(from) || 0)
  const safeTo = Math.max(safeFrom, Number(to) || safeFrom)

  const products = []
  const discarded = []
  for (let pageFrom = safeFrom; pageFrom <= safeTo; pageFrom += 50) {
    const pageTo = Math.min(pageFrom + 49, safeTo)
    const data = await fetchDiscoPage({ query, from: pageFrom, to: pageTo })
    if (!data.length) break

    const normalizedProducts = data.map(normalizeDiscoProduct)
    const imageUrls = [...new Set(normalizedProducts.map((product) => product.image).filter(Boolean))]
    const placeholderImages = new Set()
    for (let index = 0; index < imageUrls.length; index += DISCO_IMAGE_CHECK_CONCURRENCY) {
      const batch = imageUrls.slice(index, index + DISCO_IMAGE_CHECK_CONCURRENCY)
      const results = await Promise.all(batch.map(async (image) => (
        (await isPlaceholderRemoteImage(image)) ? image : null
      )))
      results.filter(Boolean).forEach((image) => placeholderImages.add(image))
    }

    for (const product of normalizedProducts) {
      if (placeholderImages.has(product.image)) product.image = ''
      const reason = getDiscoProductInvalidReason(product)
      if (reason) discarded.push({ sourceProductId: product.sourceProductId, name: product.name, reason })
      else products.push(product)
    }

    if (data.length < pageTo - pageFrom + 1) break
  }

  return { products, discarded }
}

export async function fetchDiscoProductById(sourceProductId) {
  const params = new URLSearchParams({ fq: `productId:${sourceProductId}`, _from: '0', _to: '0' })
  const response = await fetch(`${DISCO_API_URL}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(`Disco respondió con HTTP ${response.status}`)
  const data = await response.json()
  const item = Array.isArray(data) ? data[0] : null
  return item ? normalizeDiscoProduct(item) : null
}

export function findPreviewMatches(previewProducts, localProducts = []) {
  const byId = new Set(localProducts.map((product) => String(product.source_product_id || product.external_id || '')))
  const byEan = new Set(localProducts.map((product) => String(product.ean || '')).filter(Boolean))

  return previewProducts.map((product) => ({
    ...product,
    possibleDuplicate: byId.has(product.sourceProductId)
      || (product.ean && byEan.has(String(product.ean))),
  }))
}
