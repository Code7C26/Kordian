-- Metadata used to identify products imported from external catalogs.
alter table products add column if not exists source text;
alter table products add column if not exists source_product_id text;
alter table products add column if not exists source_sku text;
alter table products add column if not exists ean text;
alter table products add column if not exists source_url text;
alter table products add column if not exists source_category text;
alter table products add column if not exists source_subcategory text;

create unique index if not exists products_source_product_idx
  on products(source, source_product_id)
  where source is not null and source_product_id is not null;

create index if not exists products_ean_idx on products(ean) where ean is not null;
