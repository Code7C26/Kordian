# AR-PRICE analysis integration

## Current source of truth

- Products and current offers are served by `GET /products` from the existing Express/Supabase backend.
- Categories and brands remain served by their existing endpoints.
- The frontend analysis layer consumes that catalog through `src/services/catalogApi.js`.
- Historical admin updates currently remain in browser storage under `arprice_update_history`.

## Database migration for server-side analysis

The current schema does not expose persistent fields for the classification pipeline. A future migration should add, without removing existing columns:

- `subcategories(id, category_id, name)`
- `comparable_groups(id, subcategory_id, name, normalization_key)`
- `products.subcategory_id`
- `products.comparable_group_id`
- `products.classification_source` (`automatic` or `manual`)
- `products.classification_confidence`
- `price_history(id, product_id, offer_id, observed_at, cash_price, source)`
- `price_analysis(id, product_id, analyzed_at, status, anomaly_score, offer_score, confidence, indicators jsonb)`

The migration is available at `server/migrations/20260822_price_analysis.sql`. The current schema was checked: product and offer IDs are integers, while category IDs are UUIDs. The migration adds nullable classification fields and preserves current `category_id`, `offers`, and product records.

## Integration rule

Until that migration is applied, the client must not pretend that browser history is a durable backend history. It may use the existing catalog fallback and display its data quality. Once the migration is applied, `GET /analysis/products` returns a structured analysis object and the client consumes it:

```js
{
  classification,
  score,
  confidence,
  indicators,
  references,
  dataQuality,
  analyzedAt
}
```

This keeps CRUD endpoints compatible while providing a clear path to one server-side source of truth.

The public product card opens `src/components/PriceExplanationModal.jsx` through the `ⓘ` action. This component only renders classification, confidence, scores, indicators, data quality, signals, and comparable references received from the backend.

Administrative mutations require the temporary Bearer token returned by `POST /login`; public catalog reads remain unauthenticated.

When `SUPABASE_SERVICE_ROLE_KEY` is configured on the server, each analysis response is also persisted in `price_analysis`. The service role key is never sent to the browser.
