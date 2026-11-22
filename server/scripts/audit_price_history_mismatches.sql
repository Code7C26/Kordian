-- Muestra ejemplos de ofertas cuyo precio actual no coincide con su ultimo punto historico.
-- Solo lectura. Ejecutar despues de audit_price_history_sources.sql.
WITH stores(supermarket) AS (
  VALUES ('Mami'), ('Disco'), ('Carrefour')
),
latest_history AS (
  SELECT DISTINCT ON (history.offer_id)
    history.offer_id,
    history.product_id,
    history.cash_price,
    history.observed_at,
    history.source
  FROM public.price_history history
  WHERE history.offer_id IS NOT NULL
  ORDER BY history.offer_id, history.observed_at DESC, history.id DESC
),
mismatches AS (
  SELECT
    offer.supermarket,
    offer.id AS offer_id,
    product.id AS product_id,
    product.name AS product_name,
    product.source AS product_source,
    product.source_product_id,
    offer.cash_price AS current_cash_price,
    history.cash_price AS latest_history_price,
    history.source AS latest_history_source,
    history.observed_at AS latest_history_at,
    to_jsonb(offer) ->> 'updated_at' AS offer_updated_at,
    round(offer.cash_price - history.cash_price, 2) AS price_difference,
    round(offer.cash_price / nullif(history.cash_price, 0), 4) AS current_to_history_ratio
  FROM public.offers offer
  JOIN stores ON stores.supermarket = offer.supermarket
  JOIN public.products product ON product.id = offer.product_id
  JOIN latest_history history ON history.offer_id = offer.id
  WHERE offer.cash_price IS DISTINCT FROM history.cash_price
),
ranked_mismatches AS (
  SELECT
    mismatch.*,
    row_number() OVER (
      PARTITION BY mismatch.supermarket
      ORDER BY abs(mismatch.current_to_history_ratio - 1) DESC NULLS LAST, mismatch.offer_id
    ) AS sample_rank
  FROM mismatches mismatch
)
SELECT
  mismatch.*,
  recent_log.updated_at AS latest_matching_log_at,
  recent_log.source AS latest_matching_log_source,
  recent_log.previous_cash_price AS logged_previous_cash_price,
  recent_log.updated_cash_price AS logged_updated_cash_price
FROM ranked_mismatches mismatch
LEFT JOIN LATERAL (
  SELECT
    log.updated_at,
    log.filters ->> 'source' AS source,
    change_item ->> 'previousCashPrice' AS previous_cash_price,
    change_item ->> 'updatedCashPrice' AS updated_cash_price
  FROM public.price_update_log log
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(log.changes) = 'array' THEN log.changes
      ELSE '[]'::jsonb
    END
  ) AS changes(change_item)
  WHERE change_item ->> 'offerId' = mismatch.offer_id::text
  ORDER BY log.updated_at DESC, log.id DESC
  LIMIT 1
) recent_log ON true
WHERE mismatch.sample_rank <= 20
ORDER BY
  mismatch.supermarket,
  mismatch.sample_rank,
  mismatch.offer_id;
