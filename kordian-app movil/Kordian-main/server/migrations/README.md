# Migraciones de AR-PRICE

## Cargar categorías y subcategorías

1. Abrir el SQL Editor del proyecto Supabase.
2. Ejecutar el contenido de `20260824_catalog_taxonomy.sql`.
3. Verificar el resultado:

```sql
select c.name as category, count(s.id) as subcategories
from categories c
left join subcategories s on s.category_id = c.id
where c.name in (
  'Almacén y Alimentos',
  'Limpieza e Higiene',
  'Alimentos Frescos y Refrigerados',
  'Ropa y Calzado',
  'Electrónica y Electrodomésticos',
  'Hogar y Otros'
)
group by c.id, c.name
order by c.name;
```

La carga es idempotente: conserva registros existentes y no duplica nombres dentro de una categoría.

## Aplicar la migracion de analisis

1. Abrir el SQL Editor del proyecto Supabase.
2. Ejecutar el contenido de `20260822_price_analysis.sql` completo.
3. Confirmar que no haya errores de tipo o de clave foranea.
4. Ejecutar la consulta de verificacion:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('subcategories', 'price_history', 'price_analysis', 'price_update_log')
order by table_name;
```

Debe devolver las cinco tablas. La migracion es aditiva: no elimina productos, ofertas ni categorias existentes.

Si la migracion ya fue ejecutada antes de agregar la politica de lectura, ejecutar tambien este bloque en Supabase SQL Editor para que el endpoint publico pueda leer el historial:

```sql
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'price_history' and policyname = 'price_history_public_read'
  ) then
    create policy price_history_public_read on price_history for select to anon, authenticated using (true);
  end if;
end $$;
```

Para que `/taxonomy` pueda leer el arbol desde el backend, ejecutar tambien:

```sql
create policy subcategories_public_read
on subcategories for select to anon, authenticated using (true);

Las subcategorías son el único nivel lógico de comparación. Si la migración histórica creó la tabla `comparable_groups`, ejecutar también `20260824_remove_comparable_groups.sql`.
```

## Verificar columnas

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name in ('subcategory_id', 'classification_source', 'classification_confidence')
order by column_name;
```

La aplicacion no incluye credenciales de propietario de Supabase, por lo que la migracion debe ejecutarse desde el SQL Editor, Supabase CLI autenticado o un pipeline de migraciones del proyecto. La clave anon del backend solo sirve para operaciones permitidas por RLS y no puede crear tablas.

## Backfill de productos existentes

Luego de aplicar la migracion, ejecutar `server/scripts/backfill_analysis.js` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` definidos solo en el entorno del servidor. El script es idempotente, registra el precio actual como observacion inicial (sin inventar fechas pasadas), actualiza unicamente productos con una clasificacion resoluble y deja reportados los no resueltos. Nunca colocar la service role key en `VITE_*` ni en el navegador.