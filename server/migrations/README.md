# Migraciones de AR-PRICE

## Registro e inicio de sesión de clientes

Antes de habilitar el registro en la aplicación, abrir el SQL Editor del
proyecto Supabase y ejecutar completo `20261006_customer_auth.sql`. Esta
migración crea `public.customer_profiles`, aplica RLS y agrega un trigger que
guarda automáticamente el nombre de usuario y el correo cuando Supabase Auth
crea una cuenta. La cuenta y su contraseña quedan administradas por Supabase
Auth; la contraseña no se guarda en `customer_profiles`.

Verificar que la tabla y el trigger estén instalados:

```sql
select to_regclass('public.customer_profiles') as customer_profiles,
       exists (
         select 1
         from pg_trigger
         where tgname = 'on_auth_user_created_customer_profile'
           and not tgisinternal
       ) as profile_trigger_installed;
```

El resultado debe mostrar `public.customer_profiles` y `true`. El backend
también necesita estas variables configuradas en Render: `SUPABASE_URL`,
`SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY`. La clave service role debe
permanecer únicamente en el backend; nunca configurarla como `VITE_*` ni
incluirla en el frontend.

La URL pública del frontend es `https://ar-price.netlify.app` y está configurada
como `FRONTEND_URL` en `render.yaml`. En Supabase Auth, agregar
`https://ar-price.netlify.app/ingresar?confirmation=success` y
`https://ar-price.netlify.app/restablecer-contrasena` a las Redirect URLs
permitidas.

Los enlaces de confirmación de registro redirigen a
`/ingresar?confirmation=success`. El frontend usa una regla SPA para que las
rutas de la aplicación abran correctamente.

Si la confirmación de correo está habilitada en Supabase Auth, cada usuario
debe confirmar el correo recibido antes de iniciar sesión. Si está
deshabilitada, el registro inicia la sesión inmediatamente.

## Favoritos por cuenta

Ejecutar completo `20261021_customer_favorites.sql` en el SQL Editor de
Supabase para crear la tabla de favoritos asociados al usuario autenticado.
Los favoritos se consultan y modifican mediante el backend con la sesión del
cliente; la tabla mantiene RLS habilitado y no guarda datos de favoritos en el
navegador.

## Reportes de precios

Ejecutar completo `20261022_price_reports.sql` en el SQL Editor de Supabase.
Los usuarios autenticados envían los reportes al backend; el servidor guarda
el detalle del precio y una copia del usuario/email asociado al reporte. Solo
el endpoint autenticado del panel de administración puede consultar los
reportes; la tabla no expone políticas de lectura o escritura al cliente.

## Tipos de cuenta de usuarios

Ejecutar `20261022_customer_account_roles.sql` en el SQL Editor de Supabase
para permitir los tipos `customer`, `administrator` y `business` en los
perfiles. La cuenta nueva conserva `customer` como tipo predeterminado.
Después de aplicar la migración, las cuentas se pueden buscar y clasificar
desde la sección Usuarios del panel administrativo. Una cuenta clasificada
como administrador puede iniciar sesión en el panel con su usuario y
contraseña de AR-PRICE.

## Recuperación de contraseña

Configurar `FRONTEND_URL` en el backend con la URL pública del sitio
(localmente, `http://localhost:5173`). Agregar
`<FRONTEND_URL>/restablecer-contrasena*` a las URL de redirección permitidas
en Supabase Auth. La recuperación se envía al correo asociado al perfil; para
administradores, el perfil debe tener el rol `administrator`. Las cuentas
administradoras antiguas guardadas solo en `public.admins` no tienen un correo
asociado y no pueden recuperar la clave por email hasta migrarse a un perfil
con correo.
## Importación controlada de Carrefour

Para habilitar la vista previa y la importación manual de Carrefour:

1. Aplicar primero `20260826_external_catalog.sql` si aún no se aplicó.
2. Aplicar `20261023_carrefour_price_history.sql` en Supabase.
3. Desplegar en el backend las rutas `/admin/import/carrefour/preview` y
   `/admin/import/carrefour/execute`.

La vista previa solo consulta el catálogo local y la oferta regional de
Carrefour; no modifica productos, ofertas ni historial. La importación exige
selección explícita, revalida los datos de Carrefour antes de escribir y limita
cada lote a cinco productos.

La consulta depende de resolver el código postal a una región de entrega.
Si Carrefour bloquea esa resolución o no devuelve región, la operación se
detiene sin usar precios no regionalizados. No importar en producción hasta
validar primero el flujo en un entorno de staging con base de datos aislada.

## Estado de precio persistido

Ejecutar en el SQL Editor de Supabase, en este orden:

1. `20261008_product_price_status.sql`
2. `20261010_price_status_dependencies.sql`
3. `20261012_price_status_analysis_details.sql`

La API guarda la clasificación actual y una huella de los precios y comparables
usados. Solo reemplaza una fila cuando cambia esa huella o la versión de las
reglas. Ante cambios de precio, producto, clasificación u oferta, se encolan
en segundo plano los productos afectados y sus comparables. Al iniciar, la API
también programa el alta de filas faltantes y la actualización de las guardadas
con reglas antiguas.
`/analysis/products` devuelve ese estado guardado en lugar de recalcular todo el
catálogo durante cada solicitud. La primera carga de productos puede tardar
mientras la cola inicial completa los registros.

La API requiere `SUPABASE_SERVICE_ROLE_KEY` para escribir en esta tabla; la
política pública es únicamente de lectura.

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
```

Las subcategorías son el único nivel lógico de comparación. Si la migración histórica creó la tabla `comparable_groups`, ejecutar también `20260824_remove_comparable_groups.sql`.

## Verificar columnas

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'products'
  and column_name in ('subcategory_id', 'classification_source', 'classification_confidence')
order by column_name;
```

## Paginación y caché del catálogo

Para desplegar el backend que usa las RPC de paginación, hidratación por IDs, conteos de taxonomía y caché en memoria, ejecutar en el SQL Editor de Supabase, en este orden:

1. `20261008_product_price_status.sql`
2. `20261012_catalog_pagination.sql`
3. `20261013_catalog_page_cache_limit.sql`
4. `20261013_catalog_search_index_cache.sql`
5. `20261019_catalog_status_filters.sql`

Si alguna ya fue aplicada, no hace falta repetirla; continuar con la primera pendiente. La migración `20261013_catalog_search_index_cache.sql` conserva el límite de 100 productos por página y agrega el índice ordenado que el servidor usa para hidratar las páginas siguientes sin repetir la búsqueda completa en Supabase. La migración `20261019_catalog_status_filters.sql` permite que los filtros rápidos usen la última clasificación guardada aunque su actualización esté pendiente. El frontend solicita una página por vez; el backend conserva hasta 10 índices de consulta en una caché LRU en memoria, reutilizada al recorrer páginas y separada por búsqueda y filtros. Se descartan al salir del conjunto LRU o al reiniciar Render. Los productos de cada página se vuelven a hidratar desde Supabase.

El endpoint `/products` incluye `X-Catalog-Cache: MISS` cuando calcula un nuevo índice y `X-Catalog-Cache: HIT` cuando reutiliza un índice reciente, incluso para repetir la misma página. Para leer este encabezado desde el navegador, el backend lo expone mediante CORS. `/taxonomy` obtiene los conteos con `catalog_taxonomy_counts`.

La aplicacion no incluye credenciales de propietario de Supabase, por lo que la migracion debe ejecutarse desde el SQL Editor, Supabase CLI autenticado o un pipeline de migraciones del proyecto. La clave anon del backend solo sirve para operaciones permitidas por RLS y no puede crear tablas.

## Listas de compras compartidas

Ejecutar `20261018_shared_shopping_lists.sql` en el SQL Editor de Supabase antes de desplegar la API que ofrece `/shared-lists`. Las tablas tienen RLS habilitado sin políticas públicas; las operaciones pasan por el backend, que valida el access token del cliente y comprueba la membresía antes de leer o cambiar una lista. Por eso el servicio de Render debe tener `SUPABASE_SERVICE_ROLE_KEY` configurada solo como variable privada del servidor.

## Catálogo gestionado por comercios

Ejecutar `20261020_business_catalog_management.sql` después de crear `customer_profiles` y `supermarkets`. Desde el panel administrativo, la pestaña “Comercios” permite habilitar una cuenta comercial y asignarle un supermercado. El panel comercial solo puede publicar, actualizar o quitar las ofertas de ese supermercado; no puede modificar los productos ni las ofertas de otros comercios. El backend requiere `SUPABASE_SERVICE_ROLE_KEY` como variable privada del servidor.

Los enlaces de invitación contienen un código aleatorio privado. Para unirse, cada colaborador debe iniciar sesión en una cuenta Ar-Price. Los artículos y cantidades se guardan en Supabase y la pantalla sincroniza cambios consultando la lista cada 10 segundos.

## Backfill de productos existentes

Luego de aplicar la migracion, ejecutar `server/scripts/backfill_analysis.js` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` definidos solo en el entorno del servidor. El script es idempotente, registra el precio actual como observacion inicial (sin inventar fechas pasadas), actualiza unicamente productos con una clasificacion resoluble y deja reportados los no resueltos. Nunca colocar la service role key en `VITE_*` ni en el navegador.