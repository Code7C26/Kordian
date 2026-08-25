-- AR-PRICE: persistent taxonomy, history, and analysis results.
-- Products and offers use integer IDs in the current Supabase schema.

create extension if not exists pgcrypto;

create table if not exists supermarkets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  image text
);

insert into supermarkets (name)
select distinct supermarket
from offers
where supermarket is not null and trim(supermarket) <> ''
on conflict (name) do nothing;

alter table supermarkets enable row level security;

drop policy if exists supermarkets_read on supermarkets;
create policy supermarkets_read on supermarkets for select to anon, authenticated using (true);

drop policy if exists supermarkets_insert on supermarkets;
create policy supermarkets_insert on supermarkets for insert to anon, authenticated with check (true);

drop policy if exists supermarkets_update on supermarkets;
create policy supermarkets_update on supermarkets for update to anon, authenticated using (true) with check (true);

drop policy if exists supermarkets_delete on supermarkets;
create policy supermarkets_delete on supermarkets for delete to anon, authenticated using (true);

create table if not exists subcategories (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  unique (category_id, name)
);

create table if not exists comparable_groups (
  id uuid primary key default gen_random_uuid(),
  subcategory_id uuid not null references subcategories(id) on delete cascade,
  name text not null,
  normalization_key text not null,
  unique (subcategory_id, normalization_key)
);

alter table products add column if not exists subcategory_id uuid references subcategories(id) on delete set null;
alter table products add column if not exists comparable_group_id uuid references comparable_groups(id) on delete set null;
alter table products add column if not exists classification_source text check (classification_source in ('automatic', 'manual'));
alter table products add column if not exists classification_confidence text;

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references products(id) on delete cascade,
  offer_id bigint references offers(id) on delete set null,
  observed_at timestamptz not null default now(),
  cash_price numeric not null check (cash_price > 0),
  source text not null default 'admin'
);

create index if not exists price_history_product_date_idx on price_history(product_id, observed_at desc);

create table if not exists price_update_log (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  admin_username text not null,
  filters jsonb not null default '{}'::jsonb,
  percentage numeric not null,
  products_updated integer not null default 0,
  changes jsonb not null default '[]'::jsonb
);

alter table price_update_log add column if not exists changes jsonb not null default '[]'::jsonb;

create index if not exists price_update_log_date_idx on price_update_log(updated_at desc);

-- The API authenticates admins with its own token before using Supabase's anon client.
alter table price_update_log enable row level security;

drop policy if exists price_update_log_read on price_update_log;
create policy price_update_log_read on price_update_log for select to anon, authenticated using (true);

drop policy if exists price_update_log_insert on price_update_log;
create policy price_update_log_insert on price_update_log for insert to anon, authenticated with check (true);

drop policy if exists price_update_log_delete on price_update_log;
create policy price_update_log_delete on price_update_log for delete to anon, authenticated using (true);

create table if not exists price_analysis (
  id uuid primary key default gen_random_uuid(),
  product_id bigint not null references products(id) on delete cascade,
  analyzed_at timestamptz not null default now(),
  status text not null,
  anomaly_score numeric not null default 0,
  offer_score numeric not null default 0,
  confidence text not null,
  indicators jsonb not null default '{}'::jsonb,
  unique (product_id, analyzed_at)
);

create index if not exists price_analysis_product_date_idx on price_analysis(product_id, analyzed_at desc);

-- Price history is public catalog data and must be readable by the API's anon role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'price_history' and policyname = 'price_history_public_read'
  ) then
    create policy price_history_public_read on price_history for select to anon, authenticated using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'subcategories' and policyname = 'subcategories_public_read'
  ) then
    create policy subcategories_public_read on subcategories for select to anon, authenticated using (true);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'comparable_groups' and policyname = 'comparable_groups_public_read'
  ) then
    create policy comparable_groups_public_read on comparable_groups for select to anon, authenticated using (true);
  end if;
end $$;