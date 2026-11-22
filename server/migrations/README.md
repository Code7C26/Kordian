# Migraciones de AR-PRICE

## Visibilidad temporal de ofertas Disco agotadas

Aplicar `20261117_disco_offer_visibility.sql` antes de desplegar el backend que
usa `offers.is_catalog_visible`. La migración conserva filas y precios, pero
excluye las ofertas marcadas como no visibles de las lecturas públicas y del
resumen del catálogo. La sincronización Disco las vuelve a mostrar cuando
confirma disponibilidad y un precio válido; mientras sigan agotadas, no las
elimina ni las muestra.

Aplicar también `20261121_catalog_visibility_summary_refresh.sql` después de
esa migración. El trigger existente no observaba cambios de
`is_catalog_visible`, por lo que un resumen podía sobrevivir al ocultamiento o
no reconstruirse al reactivar una oferta. Esta migración refresca el resumen
en ambos cambios y elimina resúmenes de ofertas ya ocultas; no modifica precios,
historial ni banderas de visibilidad.

## Precios promocionales de Disco y Mami

Aplicar `20261121_catalog_promotional_price_sync.sql` antes de desplegar el
backend que usa `apply_catalog_price_promotion_sync`. La función guarda el
precio regular en `offers.list_price` solo si supera el precio actual, junto
con los cambios de `cash_price` en una única transacción. Un cambio exclusivo
del precio regular no genera una fila de historial de precios. El permiso de
ejecución se concede solo a `service_role`.

## Sincronización atómica de precios Disco y Carrefour

Aplicar `20261125_atomic_price_history_syncs.sql` después de
`20261111_catalog_write_gate_and_atomic_price_revert.sql` y
`20261029_carrefour_offer_identity.sql`, antes de desplegar el backend que usa
`apply_catalog_disco_public_search_sync` y
`apply_catalog_carrefour_price_sync`. Cada RPC valida los precios y la
identidad esperada, y confirma en una misma transacción las ofertas, el
historial, el log y, para Carrefour, el cursor. Solo `service_role` puede
ejecutarlas. Un resultado de red incierto devuelve un `operationId`; verificar
el log y las ofertas antes de reintentar.

La búsqueda pública de Disco crea los productos y marcas nuevos antes de
confirmar su oferta; si la RPC falla, puede quedar un producto sin oferta. La
oferta, su historial y el log sí se revierten juntos. La migración no se aplica
automáticamente ni autoriza su ejecución en producción.

Para corregir localmente la revisión de precios Disco, ejecutar
`../scripts/prepare_disco_price_scale_local.sql` solo después de comprobar que
la sesión apunta a Supabase local. El script aborta salvo que se habilite
explícitamente `SET LOCAL arprice.environment = 'local';`, valida IDs, EAN y
precios esperados, cambia solo la oferta Formis a $950 sin reasignar identidad y
oculta las otras 11 ofertas sin alterar sus importes. La transacción escribe el
cambio de Formis mediante `apply_catalog_price_sync`, conserva el historial y
verifica el resultado antes del `COMMIT`. Reiniciar el backend local después de
la corrección para descartar su caché en memoria. No ejecutar en producción.

## Revisión manual de taxonomía — 20261116

`20261116_catalog_taxonomy_review.sql` aplica las 1.738 reclasificaciones
manuales aprobadas. Valida los IDs, nombres y destinos esperados dentro de una
transacción, actualiza únicamente productos cuyo destino aún no coincide y
establece los marcadores de clasificación manual. La ejecución y el postflight
remoto se informaron como exitosos el 2026-11-21; conservar la migración como
registro versionado y no volver a ejecutarla para repetir la auditoría.

La migración contiene los valores de destino aprobados y valida el estado
previo/posterior dentro de su transacción. La consulta de verificación
independiente está en
[`audit_catalog_taxonomy_migration.sql`](../scripts/audit_catalog_taxonomy_migration.sql).
No usar `backfill_catalog_taxonomy.js` para reproducir estas decisiones: ese
script calcula sugerencias automáticas.

## Estado de preparación dirigido — 20261108 / 20261113

La candidata vigente de
`20261108_category_subcategory_integrity.sql` fue corregida para agregar solo
índices/constraints de integridad: no cambia las acciones de FKs simples, no
recrea RPC de migraciones posteriores, no modifica datos/RLS/grants y aborta
ante inconsistencias sin remediarlas. Consultar el preflight y postflight
independientes en
[`docs/operations/migration_execution_20261114/`](../../docs/operations/migration_execution_20261114).

`20261108_category_subcategory_integrity.sql` fue aplicada e inspeccionada con
postflight PASS; no repetirla. La candidata `20261113` mantiene grupos
comparables explícitos, por nombres e inferidos, e implementa el cap duro
aprobado de 25.000 filas con alertas y métricas. Aún no se aplicó. La política
no incluye TTL ni borrado automático, y el worker debe permanecer apagado hasta
autorización separada. El enqueue serializa el conteo bajo `READ COMMITTED` y
rechaza otros niveles con `P7502`; una fila ya encolada se coalesce. La prueba
PostgreSQL de integración no se ejecutó, por lo que atomicidad/concurrencia aún
no están demostradas. El monitor corre independientemente del worker y ofrece
un punto opcional de despacho, pero no hay adaptador/canal/destinatario
autorizado ni recepción humana verificada.
Ver el [plan de límites](../../docs/operations/migration_execution_20261114/queue_limits.md),
el [plan de monitoreo](../../docs/operations/migration_execution_20261114/queue_monitoring.md)
y los [gates pendientes](../../docs/operations/migration_execution_20261114/05_remaining_blockers.md)
antes de cualquier ejecución.

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
`https://ar-price.netlify.app/registro-exitoso` y
`https://ar-price.netlify.app/restablecer-contrasena` a las Redirect URLs
permitidas.

Los enlaces de confirmación de registro redirigen a
`/registro-exitoso`, donde se informa si la cuenta quedó verificada. El backend
debe tener `FRONTEND_URL` configurada con la URL pública del frontend; no debe
usar una dirección `localhost` en producción. El frontend usa una regla SPA
para que las rutas de la aplicación abran correctamente.

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

Para permitir que el panel elimine cuentas y todos sus datos asociados, ejecutar
`20261027_customer_account_deletion.sql` en el SQL Editor de Supabase antes de
desplegar esa función. Al borrar una cuenta, sus reportes, favoritos, perfiles
y listas de compra asociadas se eliminan mediante claves foráneas en cascada.

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
(`https://ar-price.netlify.app` en producción). Si se prueba localmente, se
puede configurar explícitamente `http://localhost:5173`. Agregar
`<FRONTEND_URL>/restablecer-contrasena*` a las URL de redirección permitidas
en Supabase Auth. La recuperación se envía al correo asociado al perfil; para
administradores, el perfil debe tener el rol `administrator`. Las cuentas
administradoras antiguas guardadas solo en `public.admins` no tienen un correo
asociado y no pueden recuperar la clave por email hasta migrarse a un perfil
con correo. Netlify debe servir `index.html` para rutas de la aplicación para
que el enlace directo a `/restablecer-contrasena` cargue la pantalla de cambio
de contraseña.
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

## Decisiones de matching entre supermercados

Para registrar revisiones reutilizables de pares Carrefour/catálogo local, aplicar
`20261105_product_match_review_decisions.sql`. La tabla es independiente de
`cross_source_review_decisions`, que mantiene su contrato actual Mami/Disco.
Solo el backend con `service_role` puede leer o escribir decisiones.

Los endpoints administrativos son:

- `GET /review/product-match-decisions?source=carrefour&sourceProductIds=id1,id2`
- `POST /review/product-match-decisions`

El preflight consulta estas decisiones, pero no las crea ni las modifica. Una
decisión aprobada solo se reutiliza si coinciden los snapshots guardados de
identidad, incluidos GTIN, presentación, variante, marca e identificadores
específicos de cada fuente. Si la identidad cambió, el reporte la marca obsoleta
y vuelve a revisión. No se puede aprobar ni reutilizar un match si ambos
productos tienen GTIN válidos distintos, o si hay diferencias de presentación
o variante incompatibles.

La generación de candidatos no crea asociaciones, productos ni ofertas. Los
umbrales de clasificación predeterminados son 95 para confianza alta, 80 para
confianza media y 35 como piso de candidatos visibles; se pueden ajustar en la
ejecución del preflight. Una puntuación no aprueba una asociación automáticamente.

Ejemplo de preflight de solo lectura y exportación de candidatos:

```powershell
cd server
node scripts/preflight_carrefour_manifest.js "C:\ruta\captura.csv" `
  --history "C:\ruta\historico-validado.csv" `
  --output "C:\ruta\preflight.json" `
  --candidates-output "C:\ruta\candidatos.csv"
```

La opción `--skip-decisions` omite explícitamente la lectura de la tabla de
decisiones, por ejemplo, antes de aplicar esta migración. No desactiva la
generación de candidatos ni escribe datos.

## Sincronización de ofertas Carrefour existentes

Para actualizar únicamente ofertas Carrefour ya presentes, aplicar
`20261029_carrefour_offer_identity.sql` y desplegar el servicio de backend.
La migración agrega metadatos de origen a `offers` y un cursor para recorrer
las ofertas en lotes; no importa productos nuevos.

La ruta manual `POST /admin/import/carrefour/sync` requiere autenticación de
administrador y `SUPABASE_SERVICE_ROLE_KEY` en el backend. Usa el código postal
regional `5186` por defecto. El tamaño se configura con
`CARREFOUR_SYNC_MAX_OFFERS_PER_RUN` (1-100, predeterminado 25).

La rutina programada permanece apagada salvo que
`CARREFOUR_SYNC_ENABLED=true`. Antes de habilitarla, validar la ruta manual y
revisar su registro de ejecución. La frecuencia predeterminada es diaria
(`CARREFOUR_SYNC_INTERVAL_MS=86400000`); mantener la variable de activación en
`false` o ausente durante el despliegue inicial.

## Estado de precio persistido

Ejecutar en el SQL Editor de Supabase, en este orden:

1. `20261008_product_price_status.sql`
2. `20261010_price_status_dependencies.sql`
3. `20261012_price_status_analysis_details.sql`
4. `20261124_price_status_pending_fingerprint.sql` antes de desplegar
   `PRICE_STATUS_RULES_VERSION=2026-11-24-v3`.

La API guarda la clasificación actual y una huella de los precios y comparables
usados. Solo reemplaza una fila cuando cambia esa huella o la versión de las
reglas. Hasta que se aplique `20261113`, el runtime conserva la cola anterior en
memoria, que puede perder trabajo pendiente al reiniciar.
La huella conserva los precios de oferta en una estructura JSON compatible con
el RPC del catálogo y agrega una huella de análisis para detectar cambios de
historial, comparables o taxonomía. La migración actualiza los RPC para comparar
solo versión y ofertas al marcar un estado pendiente; así, la huella de análisis
no deja todos los productos pendientes permanentemente. La interfaz oculta el
diagnóstico guardado hasta que termine el refresco; el catálogo se reintenta en
segundo plano hasta tres veces y el backend invalida su caché cuando confirma
una clasificación nueva.
La candidata vigente de `20261113_durable_price_status_outbox.sql` es la
versión descrita en la actualización de estado al inicio de este README. Esta
versión mantiene los grupos comparables inferidos mediante mappings
persistidos, instala triggers transaccionales en las tablas fuente y falla si
encuentra objetos parciales o ya aplicados. La RPC candidata guarda el estado y
confirma el evento bajo generación, token y lease en una transacción.

La secuencia es estricta: 20261108 ya tiene postflight PASS; correr un
preflight remoto nuevo de 20261113 solo después de confirmar el destino correcto
y el SHA-256 final
`D88228B4565799597A938B616F2FA52CB18AEBAE757374F950E3E9BD38EBA873`. Ese
preflight aún no se ejecutó. Consultar los archivos de ejecución en
`docs/operations/migration_execution_20261114/`.

El outbox deduplica por producto, tiene un tope físico de 25.000 filas y no
define TTL ni borrado automático. Sin capacidad, `P7501` aborta la escritura
fuente; cambios de EAN, identificador de origen, metadatos de clasificación y
`comparable_group_id` no provocan enqueue. La migración no encola todo el
catálogo para análisis, pero sí crea una fila de comparabilidad por producto y
mantiene las escrituras fuente bloqueadas durante esa transacción. Revisar
conteos y ejecutar en ventana de bajo cambio. No habilitar/iniciar el worker
como parte de la migración; la instalación SQL no es aprobación operacional.
Los dead letters requieren reconciliación antes de volver a encolarse.

El analizador durable vuelve a leer productos/ofertas/historial/logs desde la
base. Un producto reclamado sin mapping comparable falla y no se confirma. La
cola de aplicación anterior y el bootstrap histórico son mecanismos distintos;
no deben usarse como prueba de cobertura del outbox persistente.

La lógica de catálogo separa identidad de producto y referencia de precio:
`comparable_group_id` identifica el mismo artículo; los pares de precio se
buscan aparte dentro de la misma categoría/subcategoría, con unidades
compatibles y el mismo tipo cuando se conoce. Para productos nuevos, una
identidad exacta hereda taxonomía en orden revisada, manual y sugerida; los
conflictos de igual prioridad se abstienen para revisión. La importación no
crea ni asigna grupos persistidos automáticamente.

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

Los grupos comparables forman parte del contrato de análisis y deben preservarse. No ejecutar `20260824_remove_comparable_groups.sql` mientras esa capacidad siga vigente. Si la tabla o su clave foránea no están presentes, detenerse y auditar el esquema y los consumidores; no retirar el modelo ni sustituirlo por una definición que permita borrar grupos asociados.

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
6. `20261026_catalog_global_sort.sql`
7. `20261027_catalog_token_search.sql`
8. `20261104_catalog_search_timeout_fix.sql`

Si alguna ya fue aplicada, no hace falta repetirla; continuar con la primera pendiente. La migración `20261013_catalog_search_index_cache.sql` conserva el límite de 100 productos por página y agrega el índice ordenado que el servidor usa para hidratar las páginas siguientes sin repetir la búsqueda completa en Supabase. La migración `20261019_catalog_status_filters.sql` permite que los filtros rápidos usen la última clasificación guardada aunque su actualización esté pendiente. El frontend solicita una página por vez; el backend conserva hasta 10 índices de consulta en una caché LRU en memoria, reutilizada al recorrer páginas y separada por búsqueda y filtros. Se descartan al salir del conjunto LRU o al reiniciar Render. Los productos de cada página se vuelven a hidratar desde Supabase.

El endpoint `/products` incluye `X-Catalog-Cache: MISS` cuando calcula un nuevo índice y `X-Catalog-Cache: HIT` cuando reutiliza un índice reciente, incluso para repetir la misma página. Para leer este encabezado desde el navegador, el backend lo expone mediante CORS. `/taxonomy` obtiene los conteos con `catalog_taxonomy_counts`.

La migración `20261026_catalog_global_sort.sql` da prioridad al orden seleccionado sobre la relevancia de búsqueda y la marca antes de paginar. Así, precio, ahorro y nombre se ordenan sobre todo el conjunto filtrado y no solo dentro de la página actual.

La migración `20261027_catalog_token_search.sql` hace que cada palabra de la búsqueda coincida independientemente y en cualquier orden, por ejemplo, `Coca 1` encuentra `Gaseosa Cola Sabor Original 1.25 Lts Coca Cola`. Conserva los filtros, el ordenamiento, la paginación y la caché existentes; los términos se separan una sola vez por consulta.

La migración `20261104_catalog_search_timeout_fix.sql` cambia la búsqueda del nombre del comercio a la tabla `offers`, en lugar del CTE de ofertas que puede materializarse y volver a recorrerse por cada producto y término. Así aprovecha el índice existente por `product_id` sin cambiar qué productos coinciden.

La aplicacion no incluye credenciales de propietario de Supabase, por lo que las migraciones requieren un canal administrativo autorizado. Para la secuencia operativa `20261111`–`20261113`, el canal elegido es exclusivamente Supabase Dashboard → SQL Editor; no usar Supabase CLI, `psql`, passfiles ni pipelines. La clave anon del backend solo sirve para operaciones permitidas por RLS y no puede crear tablas.

### Ejecutar `20261111` desde PowerShell

> **Flujo supersedido para la secuencia operativa de 20261111–20261113:** no ejecutar el runner `psql`, no usar `pgpass.conf` ni otras fuentes libpq. La ejecución autorizada para esta secuencia es manual mediante Supabase Dashboard → SQL Editor, con autorización individual y postflight de solo lectura. El ledger y los resultados enlazados registran el estado observado el 2026-11-14; no describen necesariamente el estado actual. Confirmar el destino y el estado de cada migración con un preflight/postflight actualizado antes de cualquier ejecución.

Para esta migracion se preparo `server/scripts/run_20261111_write_gate_migration.ps1`. El modo `-StaticOnly` comprueba tamaño, SHA-256, copias, transacción e invariantes de seguridad sin conectarse a una base. Sin `-Apply`, el script solo hace un preflight de lectura; `-Apply` vuelve a comprobar el estado y ejecuta el archivo original mediante `psql --file`, con `ON_ERROR_STOP`, sin envolverlo en otra transacción ni pegar copias en el SQL Editor. Después abre una conexión separada para el postflight y guarda la salida en el ledger de ejecución.

El modo `direct` usa el host PostgreSQL fijo del proyecto; `session-pooler` requiere el host exacto copiado de **Supabase Dashboard > Connect** y usa el usuario `postgres.<project-ref>` en el puerto 5432. No componer el host del pooler. Ambos modos requieren el certificado raíz oficial descargado desde Database Settings y TLS `verify-full`, que verifica la identidad del host. `psql -w` no solicita ni imprime contraseñas; utiliza el almacenamiento libpq ya configurado. Si falta el certificado, falla la resolución DNS, no se alcanza TCP o el preflight no coincide, el archivo no se envía. Ante cualquier fallo de ejecución, no reintentar sin inspeccionar primero el estado remoto.

Verificación local del 2026-11-14 15:02 ART: el host confirmado `aws-1-sa-east-1.pooler.supabase.com` resolvió a IPv4 y TCP/5432 respondió. No estaba disponible el certificado raíz oficial en la ruta estándar ni se proporcionó otra ruta, por lo que no se inició TLS, autenticación ni `psql`. No continuar hasta obtener y proporcionar localmente el certificado raíz oficial; no desactivar `verify-full`.

Actualización 15:30 ART: se descargó desde el enlace oficial de Database Settings `Supabase Root 2021 CA` (SHA-256 `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`) y se intentó el preflight con `verify-full`. `psql -w` devolvió exit 2, `fe_sendauth: no password supplied`, antes de ejecutar la consulta. No se envió SQL. El siguiente bloqueo es que el mecanismo libpq seguro autorizado no proporcionó autenticación al proceso; no se debe incluir la contraseña en argumentos ni desactivar TLS.

Comprobación local de libpq 15:35 ART: el passfile predeterminado de Windows existe, pero no tiene una entrada que coincida con el host, puerto, base de datos y usuario del pooler. No está configurado `PGPASSFILE`, no hay `PGSERVICE` activo y no existe el archivo de servicio predeterminado. La comprobación no mostró ni registró contenido secreto y no creó o modificó credenciales. Se requiere que una fuente de autenticación libpq segura y previamente autorizada esté disponible para el proceso antes de repetir el preflight.

Preparación 15:40 ART: se añadió al passfile existente una entrada vacía exacta (sin contraseña ni duplicado) y se verificó una ACL NTFS protegida que concede lectura/escritura solo al usuario Windows actual. El usuario debe completar la entrada localmente mediante `Read-Host -AsSecureString`; no introducir la contraseña en el chat, argumentos o logs. No ejecutar el preflight hasta confirmar que la entrada se guardó.

Resultado tras la confirmación: `psql -w` obtuvo la contraseña del passfile, pero devolvió exit 2, `password authentication failed for user "postgres"`; el SQL de preflight no se ejecutó. No se usó `-Apply`. El bloque local de entrada pudo escapar incorrectamente `:` o `\` por la sintaxis de literales de PowerShell; el valor no se inspeccionó. No reintentar sin corregir la entrada y autorización expresa.

## Listas de compras compartidas

Ejecutar `20261018_shared_shopping_lists.sql` en el SQL Editor de Supabase antes de desplegar la API que ofrece `/shared-lists`. Las tablas tienen RLS habilitado sin políticas públicas; las operaciones pasan por el backend, que valida el access token del cliente y comprueba la membresía antes de leer o cambiar una lista. Por eso el servicio de Render debe tener `SUPABASE_SERVICE_ROLE_KEY` configurada solo como variable privada del servidor.

Para habilitar búsqueda de usuarios e invitaciones con notificaciones, ejecutar también `20261027_shared_list_invitations.sql`. La migración completa los perfiles faltantes de cuentas ya registradas usando su nombre existente o la parte anterior al `@` de su email, y resuelve nombres repetidos con un sufijo para que puedan aparecer en la búsqueda sin volver a registrarse. El selector lista las cuentas de cliente existentes; cada destinatario puede aceptar o rechazar la invitación desde Notificaciones. La función de aceptación se ejecuta en el backend con la clave service role.

Ejecutar `20261028_shared_list_member_management.sql` para habilitar la salida de participantes. El creador puede quitar a otros participantes; cualquier participante puede abandonar la lista. Si el creador se va, la propiedad pasa al participante más antiguo. Si no queda ningún participante, la lista se elimina. La función de salida se ejecuta desde el backend con la clave service role.

Ejecutar también `20261028_shared_list_activity_notifications.sql` para guardar notificaciones de actividad. Los demás participantes reciben avisos cuando alguien agrega, actualiza o quita un producto, se une, abandona la lista o es quitado por el creador. Las notificaciones aparecen en “Notificaciones” y se pueden marcar como leídas.

Para enviar notificaciones push al celular Android cuando otro participante agrega un producto o invita a alguien a una lista, ejecutar `20261102_shared_list_push_tokens.sql`. Configurar Firebase Cloud Messaging:

1. Crear una app Android en Firebase con el identificador `com.Arprice.app` y colocar su `google-services.json` en `android/app/` antes de compilar la APK.
2. En Firebase, crear una cuenta de servicio con permiso para enviar mensajes de Firebase Cloud Messaging. Configurar su JSON como variable privada `FIREBASE_SERVICE_ACCOUNT_JSON` en Render; no subir la clave de servicio al repositorio ni al frontend. Alternativamente, usar Application Default Credentials mediante `GOOGLE_APPLICATION_CREDENTIALS`.
3. Desplegar el backend y compilar/instalar nuevamente la app. El usuario debe iniciar sesión y aceptar el permiso de notificaciones. El backend envía push únicamente a tokens Android registrados. Las invitaciones también aparecen en “Notificaciones”, donde se pueden aceptar o rechazar; las notificaciones web existentes no cambian.

## Catálogo gestionado por comercios

Ejecutar `20261020_business_catalog_management.sql` después de crear `customer_profiles` y `supermarkets`. Desde el panel administrativo, la pestaña “Comercios” permite habilitar una cuenta comercial y asignarle un supermercado. El panel comercial solo puede publicar, actualizar o quitar las ofertas de ese supermercado; no puede modificar los productos ni las ofertas de otros comercios. El backend requiere `SUPABASE_SERVICE_ROLE_KEY` como variable privada del servidor.

Los enlaces de invitación contienen un código aleatorio privado. Para unirse, cada colaborador debe iniciar sesión en una cuenta Ar-Price. Los artículos y cantidades se guardan en Supabase y la pantalla sincroniza cambios consultando la lista cada 10 segundos.

## Backfill de productos existentes

Luego de aplicar la migracion, ejecutar `server/scripts/backfill_analysis.js` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` definidos solo en el entorno del servidor. El script es idempotente, registra el precio actual como observacion inicial (sin inventar fechas pasadas), actualiza unicamente productos con una clasificacion resoluble y deja reportados los no resueltos. Nunca colocar la service role key en `VITE_*` ni en el navegador.

## Integridad de categorías y subcategorías v1

> **Actualización:** para la secuencia dirigida `20261108` → `20261113`, usar
> exclusivamente los archivos `20261108_preflight.sql`,
> `20261108_category_subcategory_integrity.sql` y
> `20261108_postflight.sql` preparados en
> `docs/operations/migration_execution_20261114/`. La candidata vigente de
> 20261108 ya no recrea RPC ni cambia acciones de FKs simples. No combinarla
> con la migración alternativa `20261110_category_subcategory_integrity_v1.sql`
> para los mismos constraints. El procedimiento histórico de abajo se conserva
> como referencia y no sustituye la secuencia nueva.

El estado de las migraciones ya aplicadas en Supabase no puede inferirse de
los archivos del repositorio. Antes de programar cambios, revisar el historial
real de migraciones del proyecto y no asumir que las migraciones antiguas
están pendientes.

Orden de preparación y ejecución:

1. Ejecutar `server/scripts/preflight_category_subcategory_supabase.sql` en
   Supabase SQL Editor; es una sola consulta de solo lectura. Ejecutar
   `server/scripts/audit_category_subcategory_integrity_v1_pre.sql` en SQL
   Editor o con `psql`; también es de solo lectura.
   Revisar tablas y columnas requeridas, claves únicas, duplicados, datos
   inconsistentes, FKs/acciones existentes y definiciones/permisos de RPC.
   Resolver y aprobar por separado cualquier problema de datos o esquema.
   Para este procedimiento histórico v1, no mezclar la migración alternativa
   20261108 vigente con 20261110 v1.
2. Si el preflight confirma que alguna de las funciones
   `update_catalog_subcategory(uuid, text, uuid)` o
   `delete_catalog_subcategory(uuid)` falta, aplicar
   `20261109_category_subcategory_admin_rpcs.sql` antes de v1. Si ambas ya son
   equivalentes, omitirla. Si existe una definición diferente, detenerse y
   revisar su comportamiento, ACL, dependencias y consumidores externos antes
   de aprobar un reemplazo. Esta migración solo crea/reemplaza esas dos
   funciones y ajusta sus permisos:
   ambas son `SECURITY INVOKER`, revocadas a `PUBLIC`, `anon` y
   `authenticated`, y ejecutables por `service_role`.
   La función de eliminación conserva la comprobación histórica de
   `public.comparable_groups`; confirmar que esa tabla y su columna
   `subcategory_id` existen antes de aplicar y usar esta RPC. Si no existen,
   detenerse: no se debe aplicar la migración antigua para recrearlas ni
   cambiar silenciosamente el comportamiento de la RPC.
3. Si se aplicó la migración de RPC, volver a ejecutar y guardar
   `audit_category_subcategory_integrity_v1_pre.sql` después de ese cambio.
   Ese resultado será la línea base inmediata de v1. Si no se aplicó ninguna
   RPC, conservar el resultado del paso 1 como línea base. Guardar los CSV de
   pre y post sin alterar sus encabezados ni combinar ejecuciones.
4. Aplicar `20261110_category_subcategory_integrity_v1.sql` una sola vez,
   únicamente después de revisar los prerrequisitos y autorizar explícitamente
   el cambio. La migración agrega índices y restricciones `NOT VALID`; no
   corrige datos ni cambia las acciones de las FKs existentes.
5. Inmediatamente después, ejecutar
   `server/scripts/audit_category_subcategory_integrity_v1_post.sql` y
   comparar sus resultados con la línea base inmediata de v1 usando
   `server/scripts/compare_category_subcategory_integrity_v1_audits.ps1`.
   El script post usa el comando `\ir` de `psql` para incluir el pre-audit,
   por lo que debe ejecutarse con `psql` (no pegarse directamente en SQL
   Editor); usar la salida CSV de `psql -q --csv` para ambos snapshots antes de
   ejecutar el comparador.
   La comparación atribuye objetos solo como candidatos creados por v1 si no
   hubo otros cambios de esquema entre las capturas.
6. Solo después de que la auditoría de datos no muestre inconsistencias y la
   comparación no encuentre cambios inesperados, ejecutar
   `server/scripts/validate_category_subcategory_integrity.sql`. Este script
   valida exclusivamente `products_subcategory_category_integrity_fkey` y
   `products_subcategory_requires_category_check`; nunca valida FKs
   históricas. Si v1 reutilizó una restricción equivalente preexistente que ya
   está validada, el script solo comprueba su definición/estado; si está
   `NOT VALID`, aborta y requiere revisión explícita en vez de validarla como
   si fuera creada por v1. Puede ejecutarse nuevamente para comprobar el
   estado validado.

Los archivos de auditoría pre/post comienzan una transacción `READ ONLY`; el
comparador solo lee los CSV locales. El preflight de Supabase también es de
solo lectura. No se debe ejecutar la migración v1, la migración RPC ni el
validador hasta completar la revisión y aprobación de producción.

### RPC de clasificación de productos

`20261110_product_classification_rpc.sql` separa la función
`public.update_catalog_product_classification(integer, uuid)` de la migración
histórica `20261108_category_subcategory_integrity.sql`. No crea la sobrecarga
`(bigint, uuid)` y no modifica las RPC de subcategorías ni las restricciones
de integridad.

Contrato conservado:

- Parámetros: `p_product_id integer` y `p_subcategory_id uuid`.
- Retorno: `jsonb`; los estados son `subcategory_not_found`, `not_found` y
  `updated` (este último incluye el producto completo).
- Seguridad: `SECURITY INVOKER`, con `search_path = pg_catalog, public`.
- Valida la existencia de la subcategoría y del producto. Bloquea la fila de
  subcategoría con `FOR KEY SHARE` y la fila de producto con `FOR UPDATE`.
- Consulta `public.subcategories.id` y `public.subcategories.category_id`.
  Actualiza `public.products.category_id`, `subcategory_id`,
  `classification_source` y `classification_confidence`; devuelve la fila
  actualizada como JSON.
- Permisos originales: revoca todos los privilegios de la función para
  `PUBLIC`, `anon` y `authenticated`, y concede `EXECUTE` a `service_role`.

El backend principal invoca la firma con `Number(id)` desde
`PUT /products/:id/classification`. El preflight remoto más reciente
compartido informa que la firma `(integer, uuid)` está presente y
`(bigint, uuid)` está ausente; `public.products.id` es `integer`. Por lo
tanto, no aplicar automáticamente esta migración ni crear una sobrecarga
`bigint`. La auditoría compartida muestra `EXECUTE` para `postgres` y
`service_role`, sin concesiones a `PUBLIC`, `anon` ni `authenticated`.
Antes de declarar equivalencia, comparar la definición instalada con la
migración aprobada. La ausencia de una tabla de historial de migraciones no
permite determinar cómo se instaló la función.

La definición del cuerpo y los permisos de la migración separada coinciden
con la función y los grants originales en
`20261108_category_subcategory_integrity.sql`; no se introdujeron cambios de
comportamiento. No hay evidencia de que esta migración separada se haya
ejecutado.

### Estado observado en los preflights remotos compartidos

Los resultados compartidos informan que las restricciones de integridad v1
están ausentes y que sus auditorías de datos no encontraron inconsistencias
en las categorías/subcategorías inspeccionadas (9.098 productos, 6 categorías
y 54 subcategorías). La RPC de borrado conserva la comprobación de
`comparable_groups`; no sustituirla por la variante del 12/11 que omite esa
protección. El preflight del gate encontró sus funciones, tabla y triggers
ausentes, con las dependencias estructurales presentes. Esto indica que los
objetos del gate faltan en ese snapshot, pero no demuestra el estado de todas
las migraciones históricas.

El resultado de conexión compartido identifica la base `postgres` y el rol
`postgres`, no el project ref. La confirmación del usuario de que corresponde
a staging no sustituye la comprobación de destino vinculada a la conexión y
de `SUPABASE_URL` efectiva de Render. Estos resultados no autorizan escrituras.

El inventario reporta 3.702 filas con `classification_source` nulo. La
migración `20260822_price_analysis.sql` agrega esa columna nullable sin valor
por defecto; además, el alta administrativa local deja el campo nulo cuando
no se asigna subcategoría. Los backfills existentes escriben `automatic`
solo cuando resuelven la clasificación, mientras que la protección de
clasificaciones manuales reconoce explícitamente `manual`/`manual_override`;
por ello, un nulo no debe asumirse como manual y podría ser recalculado por
un backfill. El recuento no prueba por sí solo pérdida de categoría ni
identifica el proceso de origen. Antes de ejecutar cualquier backfill, usar
`server/scripts/audit_null_classification_source.sql` para desglosar los
nulos por fuente, presencia de categoría/subcategoría y confianza. La consulta
es de solo lectura y no repara datos.

### Contrato de borrado de subcategorías

`20261112_delete_catalog_subcategory_rpc.sql` y su copia móvil deben ser
idénticas. La migración conserva `comparable_groups`: antes de instalar la RPC,
comprueba las tablas y columnas usadas y que no haya grupos huérfanos. Si la FK
simple `comparable_groups.subcategory_id -> subcategories.id` tiene
`ON DELETE CASCADE`, la migra a `ON DELETE RESTRICT` en la misma transacción;
una FK validada `RESTRICT` o `NO ACTION` ya cumple el contrato. La migración
valida la FK y no elimina filas. Aborta ante una relación ambigua, acción
distinta, configuración de actualización/deferrability no esperada o si no
obtiene locks en tres segundos; el rollback revierte también el cambio de FK.
Si se confirma la transacción, no restaurar `CASCADE` como rollback: no se
eliminan filas y una corrección posterior debe ser forward-only para conservar
la protección frente a borrados indirectos.

La RPC `public.delete_catalog_subcategory(uuid)` es `SECURITY INVOKER`, usa
`search_path = pg_catalog, public`, bloquea la subcategoría y rechaza el borrado
si hay productos o grupos asociados. Elimina solo una subcategoría sin
asociaciones y concede `EXECUTE` a `service_role`, revocándolo de `PUBLIC`,
`anon` y `authenticated`.

Antes de ejecutar la migración en cualquier destino, ejecutar en SQL Editor el
script de solo lectura
`server/scripts/preflight_category_subcategory_supabase.sql` y revisar las
definiciones de RPC, permisos, FKs, sus acciones/validación, dependencias y
datos huérfanos. Volver a ejecutar el mismo preflight después para comprobar
el estado final. `20261112` no se ha aplicado remotamente como parte de esta
verificación.
