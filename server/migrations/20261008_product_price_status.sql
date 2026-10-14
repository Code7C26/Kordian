BEGIN;

CREATE TABLE IF NOT EXISTS product_price_status (
  product_id bigint PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  classification text NOT NULL CHECK (
    classification IN ('OFERTA', 'EN_PRECIO', 'PRECIO_NORMAL', 'INFLADO', 'AUMENTO_ATIPICO', 'SOBREPRECIO', 'INFORMACION_INSUFICIENTE')
  ),
  anomaly_score integer NOT NULL DEFAULT 0,
  offer_score integer NOT NULL DEFAULT 0,
  confidence text NOT NULL DEFAULT 'baja',
  confidence_percentage integer NOT NULL DEFAULT 0,
  data_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  rules_version text NOT NULL,
  price_fingerprint text NOT NULL DEFAULT '',
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_price_status
  ADD COLUMN IF NOT EXISTS price_fingerprint text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS product_price_status_classification_idx
  ON product_price_status(classification);

CREATE INDEX IF NOT EXISTS product_price_status_rules_version_idx
  ON product_price_status(rules_version);

CREATE INDEX IF NOT EXISTS product_price_status_latest_idx
  ON product_price_status(rules_version, analyzed_at DESC);

ALTER TABLE product_price_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_price_status_public_read ON product_price_status;
CREATE POLICY product_price_status_public_read ON product_price_status
  FOR SELECT TO anon, authenticated USING (true);

COMMIT;
