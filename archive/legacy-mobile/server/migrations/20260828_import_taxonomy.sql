BEGIN;

-- Add taxonomy required by the external catalog importer.
insert into subcategories (category_id, name)
select categories.id, 'Bebidas'
from categories
where lower(trim(categories.name)) = lower(trim('Almacén y Alimentos'))
  and not exists (
    select 1
    from subcategories
    where subcategories.category_id = categories.id
      and lower(trim(subcategories.name)) = lower(trim('Bebidas'))
  );

-- Reassign products from duplicate brands to the canonical brand.
-- Comparison is accent-insensitive, so SERENÍSIMA and SERENISIMA are treated as the same brand.
with normalized AS (
  select
    id,
    upper(
      translate(
        trim(name),
        'ÁÉÍÓÚÜÑáéíóúüñ',
        'AEIOUUNaeiouun'
      )
    ) as canonical_name
  from brands
  where name is not null
),
ranked AS (
  select
    id,
    canonical_name,
    row_number() over (
      partition by canonical_name
      order by id
    ) as rn
  from normalized
),
canonical_map AS (
  select
    r.id,
    first_value(r.id) over (
      partition by r.canonical_name
      order by r.id
    ) as canonical_id
  from ranked r
)
update products p
set brand_id = cm.canonical_id
from canonical_map cm
where p.brand_id = cm.id
  and cm.id <> cm.canonical_id;

-- Remove duplicate brand rows after reassigning their products.
with normalized AS (
  select
    id,
    upper(
      translate(
        trim(name),
        'ÁÉÍÓÚÜÑáéíóúüñ',
        'AEIOUUNaeiouun'
      )
    ) as canonical_name
  from brands
  where name is not null
),
ranked AS (
  select
    id,
    canonical_name,
    row_number() over (
      partition by canonical_name
      order by id
    ) as rn
  from normalized
)
delete from brands b
using ranked r
where b.id = r.id
  and r.rn > 1;

-- Normalize the remaining brand names to uppercase sustained form.
update brands
set name = upper(
  translate(
    trim(name),
    'ÁÉÍÓÚÜÑáéíóúüñ',
    'AEIOUUNaeiouun'
  )
)
where upper(
  translate(
    trim(name),
    'ÁÉÍÓÚÜÑáéíóúüñ',
    'AEIOUUNaeiouun'
  )
) <> upper(
  translate(
    trim(name),
    'ÁÉÍÓÚÜÑáéíóúüñ',
    'AEIOUUNaeiouun'
  )
);

COMMIT;
