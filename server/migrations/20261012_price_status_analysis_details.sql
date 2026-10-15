alter table product_price_status
  add column if not exists analysis_details jsonb not null default '{}'::jsonb;
