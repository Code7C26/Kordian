-- AR-PRICE: catalog categories and subcategories.
-- Idempotent seed: existing categories and subcategories are preserved.

with category_names(name) as (
  values
    ('Almacén y Alimentos'),
    ('Limpieza e Higiene'),
    ('Alimentos Frescos y Refrigerados'),
    ('Ropa y Calzado'),
    ('Electrónica y Electrodomésticos'),
    ('Hogar y Otros')
)
insert into categories (name)
select category_names.name
from category_names
where not exists (
  select 1
  from categories
  where lower(trim(categories.name)) = lower(trim(category_names.name))
);

with taxonomy(category_name, subcategory_name) as (
  values
    ('Almacén y Alimentos', 'Granos, cereales y legumbres'),
    ('Almacén y Alimentos', 'Pastas y harinas'),
    ('Almacén y Alimentos', 'Aceites, condimentos y aderezos'),
    ('Almacén y Alimentos', 'Conservas y alimentos preparados'),
    ('Almacén y Alimentos', 'Azúcares y dulces'),
    ('Almacén y Alimentos', 'Infusiones'),
    ('Almacén y Alimentos', 'Galletitas y productos de panificación'),
    ('Almacén y Alimentos', 'Golosinas y snacks'),

    ('Limpieza e Higiene', 'Limpieza del hogar'),
    ('Limpieza e Higiene', 'Lavado de ropa'),
    ('Limpieza e Higiene', 'Limpieza de cocina'),
    ('Limpieza e Higiene', 'Papel y descartables'),
    ('Limpieza e Higiene', 'Higiene personal'),
    ('Limpieza e Higiene', 'Cuidado capilar'),
    ('Limpieza e Higiene', 'Cuidado bucal'),
    ('Limpieza e Higiene', 'Higiene infantil'),

    ('Alimentos Frescos y Refrigerados', 'Carnes y pescados'),
    ('Alimentos Frescos y Refrigerados', 'Fiambres y embutidos'),
    ('Alimentos Frescos y Refrigerados', 'Lácteos'),
    ('Alimentos Frescos y Refrigerados', 'Huevos'),
    ('Alimentos Frescos y Refrigerados', 'Frutas y verduras'),
    ('Alimentos Frescos y Refrigerados', 'Panadería y pastelería'),
    ('Alimentos Frescos y Refrigerados', 'Congelados'),
    ('Alimentos Frescos y Refrigerados', 'Comidas preparadas'),
    ('Alimentos Frescos y Refrigerados', 'Helados'),

    ('Ropa y Calzado', 'Ropa de hombre'),
    ('Ropa y Calzado', 'Ropa de mujer'),
    ('Ropa y Calzado', 'Ropa infantil'),
    ('Ropa y Calzado', 'Ropa deportiva'),
    ('Ropa y Calzado', 'Ropa interior'),
    ('Ropa y Calzado', 'Calzado'),
    ('Ropa y Calzado', 'Accesorios'),

    ('Electrónica y Electrodomésticos', 'Computación'),
    ('Electrónica y Electrodomésticos', 'Telefonía'),
    ('Electrónica y Electrodomésticos', 'Televisores y entretenimiento'),
    ('Electrónica y Electrodomésticos', 'Audio'),
    ('Electrónica y Electrodomésticos', 'Gaming'),
    ('Electrónica y Electrodomésticos', 'Electrodomésticos grandes'),
    ('Electrónica y Electrodomésticos', 'Electrodomésticos pequeños'),
    ('Electrónica y Electrodomésticos', 'Climatización'),
    ('Electrónica y Electrodomésticos', 'Accesorios electrónicos'),

    ('Hogar y Otros', 'Muebles'),
    ('Hogar y Otros', 'Cocina y bazar'),
    ('Hogar y Otros', 'Decoración'),
    ('Hogar y Otros', 'Iluminación'),
    ('Hogar y Otros', 'Juguetes'),
    ('Hogar y Otros', 'Librería y escolar'),
    ('Hogar y Otros', 'Deportes'),
    ('Hogar y Otros', 'Herramientas'),
    ('Hogar y Otros', 'Jardinería'),
    ('Hogar y Otros', 'Automotor'),
    ('Hogar y Otros', 'Mascotas')
)
insert into subcategories (category_id, name)
select categories.id, taxonomy.subcategory_name
from taxonomy
join categories on lower(trim(categories.name)) = lower(trim(taxonomy.category_name))
where not exists (
  select 1
  from subcategories
  where subcategories.category_id = categories.id
    and lower(trim(subcategories.name)) = lower(trim(taxonomy.subcategory_name))
);
