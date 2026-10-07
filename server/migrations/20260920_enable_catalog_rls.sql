BEGIN;

-- The API uses the service-role client for all backend reads and writes.
-- Public clients may read catalog and analysis data, but cannot mutate it.

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcategories ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarkets ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_update_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS offers_public_read ON offers;
CREATE POLICY offers_public_read ON offers
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS brands_public_read ON brands;
CREATE POLICY brands_public_read ON brands
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS subcategories_public_read ON subcategories;
CREATE POLICY subcategories_public_read ON subcategories
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS supermarkets_read ON supermarkets;
CREATE POLICY supermarkets_read ON supermarkets
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS price_history_public_read ON price_history;
CREATE POLICY price_history_public_read ON price_history
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS price_analysis_public_read ON price_analysis;
CREATE POLICY price_analysis_public_read ON price_analysis
  FOR SELECT TO anon, authenticated USING (true);

-- Logs are server-side audit data and must not be readable through the public API.
DROP POLICY IF EXISTS price_update_log_read ON price_update_log;
DROP POLICY IF EXISTS price_update_log_insert ON price_update_log;
DROP POLICY IF EXISTS price_update_log_delete ON price_update_log;

-- Admin credentials are only accessed by the authenticated backend.
DROP POLICY IF EXISTS admins_public_read ON admins;
DROP POLICY IF EXISTS admins_public_insert ON admins;
DROP POLICY IF EXISTS admins_public_update ON admins;
DROP POLICY IF EXISTS admins_public_delete ON admins;

-- Remove legacy public write policies. The service-role backend bypasses RLS.
DROP POLICY IF EXISTS supermarkets_insert ON supermarkets;
DROP POLICY IF EXISTS supermarkets_update ON supermarkets;
DROP POLICY IF EXISTS supermarkets_delete ON supermarkets;
DROP POLICY IF EXISTS price_history_admin_insert ON price_history;

COMMIT;
