alter table product_price_status
  add column if not exists comparable_product_ids bigint[] not null default '{}'::bigint[];

create index if not exists product_price_status_comparable_product_ids_idx
  on product_price_status using gin (comparable_product_ids);
