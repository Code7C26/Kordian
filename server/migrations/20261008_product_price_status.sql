create table if not exists product_price_status (
  product_id bigint primary key references products(id) on delete cascade,
  classification text not null,
  anomaly_score numeric not null default 0,
  offer_score numeric not null default 0,
  confidence text not null,
  confidence_percentage numeric not null default 0,
  data_quality jsonb not null default '{}'::jsonb,
  rules_version text not null,
  price_fingerprint text not null,
  comparable_product_ids bigint[] not null default '{}'::bigint[],
  analyzed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_price_status_rules_version_idx
  on product_price_status(rules_version);

alter table product_price_status enable row level security;

drop policy if exists product_price_status_service_write on product_price_status;
create policy product_price_status_service_write
  on product_price_status for all to service_role using (true) with check (true);

drop policy if exists product_price_status_public_read on product_price_status;
create policy product_price_status_public_read
  on product_price_status for select to anon, authenticated using (true);
