-- Add source categories needed by the Mami migration without changing existing IDs.
insert into subcategories (category_id, name)
select categories.id, 'Hogar textil'
from categories
where lower(trim(categories.name)) = lower(trim('Hogar y Otros'))
  and not exists (
    select 1
    from subcategories
    where subcategories.category_id = categories.id
      and lower(trim(subcategories.name)) = lower(trim('Hogar textil'))
  );-- Add source categories needed by the Mami migration without changing existing IDs.
insert into subcategories (category_id, name)
select categories.id, 'Hogar textil'
from categories
where lower(trim(categories.name)) = lower(trim('Hogar y Otros'))
  and not exists (
    select 1
    from subcategories
    where subcategories.category_id = categories.id
      and lower(trim(subcategories.name)) = lower(trim('Hogar textil'))
  );