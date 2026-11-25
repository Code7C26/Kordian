# AR-PRICE analysis integration

## Current source of truth

- Products and current offers are served by `GET /products` from the existing Express/Supabase backend.
- Categories and brands remain served by their existing endpoints.
- The frontend analysis layer consumes that catalog through `src/services/catalogApi.js`.
- Historical admin updates currently remain in browser storage under `arprice_update_history`.

## Current persistence

`GET /analysis/products` reads the latest persisted rows from `product_price_status`. The server builds or refreshes those rows from current offers, `price_history`, and `price_update_log`; detailed indicators, comparable references, and price periods are stored in `analysis_details`.

The older `price_analysis` migration and the archived `archive/legacy-mobile/` copy describe a historical implementation. They are not used by the active `server/server.js` entry point. The current-status migration is `server/migrations/20261008_product_price_status.sql`, with additional detail fields in `server/migrations/20261012_price_status_analysis_details.sql`.

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

Analysis filters known scale artifacts from `priceHistory` without modifying raw `price_history` records. For `price_token_normalization`, it allows for 10% drift around a 100x scale mismatch and also compares against same-offer `disco_public_search` history within 30 days; other history sources retain the existing 5% tolerance. The `20261117_disco_price_scale_artifact_review.sql` migration keeps the matched source-row IDs and price snapshots in a service-role-only review table; it does not rewrite prices, offers, or history. The read-only `server/scripts/preflight_disco_price_scale_artifacts.sql` reports candidates and identity conflicts before applying it.

The analysis rules version advances with this filter change so the normal startup refresh queue recalculates persisted `product_price_status` rows. The migration itself does not pause writers or directly update those status rows.

Administrative mutations require the temporary Bearer token returned by `POST /login`; public catalog reads remain unauthenticated.

Missing analysis details are represented as unavailable; they must not be rendered as zero counts or empty evidence. Current status and the old `price_analysis` snapshots are not equivalent: the current tables cannot reconstruct the deleted historical snapshots. The service role key is used only by the server and is never sent to the browser.
