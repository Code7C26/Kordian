# AR-PRICE analysis integration

## Current source of truth

- Products and current offers are served by `GET /products` from the existing Express/Supabase backend.
- Categories and brands remain served by their existing endpoints.
- The frontend analysis layer consumes that catalog through `src/services/catalogApi.js`.
- Historical admin updates currently remain in browser storage under `arprice_update_history`.

## Current persistence

`GET /analysis/products` reads the latest persisted rows from `product_price_status`. The server builds or refreshes those rows from current offers, `price_history`, and `price_update_log`; detailed indicators, comparable references, and price periods are stored in `analysis_details`.

The older `price_analysis` migration and the nested `kordian-app movil/Kordian-main/` copy describe a historical implementation. They are not used by the active `server/server.js` entry point. The current-status migration is `server/migrations/20261008_product_price_status.sql`, with additional detail fields in `server/migrations/20261012_price_status_analysis_details.sql`.

## Integration rule

`GET /analysis/products` returns the persisted current analysis object and the client consumes it:

```js
{
  classification,
  score,
  confidence,
  indicators,
  references,
  priceHistory,
  dataQuality,
  analyzedAt
}
```

This keeps CRUD endpoints compatible while providing a clear path to one server-side source of truth.

The public product card opens `src/components/PriceExplanationModal.jsx` through the `ⓘ` action. This component only renders classification, confidence, scores, indicators, data quality, signals, and comparable references received from the backend.

Administrative mutations require the temporary Bearer token returned by `POST /login`; public catalog reads remain unauthenticated.

Missing analysis details are represented as unavailable; they must not be rendered as zero counts or empty evidence. Current status and the old `price_analysis` snapshots are not equivalent: the current tables cannot reconstruct the deleted historical snapshots. The service role key is used only by the server and is never sent to the browser.
