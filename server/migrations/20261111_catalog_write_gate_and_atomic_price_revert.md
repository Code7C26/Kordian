# Gate transaccional y reversión de price updates

Esta nota describe la migración `20261111_catalog_write_gate_and_atomic_price_revert.sql`. La copia principal se aplicó en la restauración local descartable `ar_price_restore_audit_20261109`; las copias principal y móvil se comprobaron idénticas. Supabase sigue pendiente. La aplicación local no prueba que exista en el destino remoto.

## Funciones y permisos

- `set_catalog_maintenance(text[])`: activa el gate con nombres canónicos (`Mami`, `Disco`, `Carrefour`) o lo desactiva con un array vacío. Solo `service_role` y el propietario de la base pueden ejecutarla. No acepta nombres desconocidos.
- `revert_price_update(uuid)`: clasifica y valida el log, bloquea el log y sus ofertas, restaura precios, inserta historial y elimina el log en una única transacción. Es `SECURITY INVOKER`; solo `service_role` recibe `EXECUTE`.
- `apply_catalog_price_sync(text, text, jsonb, jsonb, jsonb)`: aplica el lote final de la reparación Mami o sincronización Disco (incluida la eliminación Disco) y sus filas de historial/log en una transacción. Solo permite `Mami/mami_price_repair` y `Disco/disco_sync`; solo `service_role` recibe `EXECUTE`.

Las funciones auxiliares y los triggers usan `SECURITY DEFINER` únicamente para leer/escribir el estado privado del gate o comprobar y bloquear DML. Fijan `search_path` a `pg_catalog, public`; la tabla de estado no concede acceso directo a roles API. Los triggers cubren DML de `offers`, `products`, `price_history`, `price_analysis`, `price_update_log`, `brands`, `categories`, `subcategories` y `supermarkets`, incluso si el escritor usa REST con `service_role`. Las ofertas se clasifican por su propio supermercado, no por el origen de un producto compartido. Los cambios de productos/metadatos consideran el origen conocido y todos los supermercados de sus ofertas. Si el origen no se conoce y el producto no tiene ofertas que permitan inferir el alcance, la escritura falla cerrada mientras haya algún gate activo. Las inserciones de marcas/categorías/subcategorías nuevas se permiten porque todavía no se pueden atribuir a una tienda; el DML posterior de productos relacionados sí se verifica. La inserción de un supermercado pasa por la validación del nombre y queda rechazada si no es un alcance conocido mientras el gate está activo.

## Invocación operativa del gate

La llamada de activación, desde una sesión DBA autorizada o mediante RPC de `service_role`, es:

```sql
select public.set_catalog_maintenance(array['Mami', 'Disco']::text[]);
```

Para desactivar:

```sql
select public.set_catalog_maintenance(array[]::text[]);
```

La función toma un advisory lock exclusivo de transacción. Espera a que terminen las transacciones de escritura que ya adquirieron el lock compartido; una vez confirmada la activación, los nuevos DML protegidos fallan con `catalog_maintenance`. La desactivación usa la misma barrera. Recomendación para transición: configurar primero `CATALOG_MAINTENANCE_BLOCKED_SUPERMARKETS` y luego activar la fila DB; para levantar, vaciar primero la fila DB y después quitar el valor de entorno. El entorno solo es un rechazo anticipado local, nunca la autoridad transaccional.

La barrera cubre una transacción SQL, no un proceso JavaScript que emite varias solicitudes REST. Si el gate se activa entre dos solicitudes de una importación pendiente, la solicitud actual termina antes de confirmar el gate y las solicitudes posteriores son rechazadas; las etapas anteriores no se revierten automáticamente.

## Contratos de RPC desde los backends

Ambos endpoints `DELETE /admin/price-updates/:id` invocan:

```js
supabaseAdmin.rpc('revert_price_update', { p_log_id: logId })
```

These administrative RPCs must use the backend `service_role` client. If the
service-role key is unavailable, the operation must stop rather than fall back
to the public `anon` client.

La respuesta RPC contiene `status`. `reverted` solo se produce después de restaurar todas las ofertas, insertar el historial y borrar el log. Los errores posteriores al inicio de las escrituras revierten el bloque transaccional completo, informan cero ofertas restauradas y conservan el log. Si el resultado de red no se puede confirmar, el endpoint devuelve `price_update_revert_result_unknown`; no debe repetirse a ciegas: primero hay que comprobar si el log existe y comparar las ofertas.

La reversión solo acepta los formatos de precio recuperables: ajuste masivo histórico sin la clave `filters.source`, `mami_price_repair`, `disco_sync` sin ofertas eliminadas y `carrefour_sync` cuando no cambiaron identidad ni precio de lista. `admin_edit` e importaciones son informativos/no reversibles. La RPC exige la forma histórica exacta de filtros, al menos un filtro no vacío y cambios con IDs/precios válidos; las fuentes explícitas desconocidas nunca se tratan como históricas. Cada oferta debe conservar el producto, el supermercado y el precio actualizado esperado; los supermercados bloqueados se comparan sin distinguir mayúsculas antes de escribir.

Las sincronizaciones llaman:

```js
supabaseAdmin.rpc('apply_catalog_price_sync', {
  p_supermarket,
  p_source,
  p_updates: [{ offerId, productId, sourceProductId, previousCashPrice, updatedCashPrice }],
  p_removals: [{ offerId, productId, sourceProductId, previousCashPrice }],
  p_log,
})
```

`p_removals` solo es válido para Disco. La RPC vuelve a verificar identidad de producto, tienda y precio esperado bajo locks, luego escribe oferta/historial/log atómicamente. La consulta/fetch externo ocurre antes de la RPC y no modifica la base. Si el precio o la identidad cambiaron durante ese fetch, el lote falla completo.

La reversión y la RPC de sincronización bloquean primero las ofertas y luego los productos, recorriendo las ofertas por `offerId`; así evitan la inversión de orden entre esos dos flujos. Esto no sustituye pruebas de concurrencia en PostgreSQL ni descarta deadlocks con otros escritores.

## Recuperación de un resultado no confirmado

Si un endpoint devuelve `price_update_revert_result_unknown`, conservar el log y no repetir la solicitud a ciegas. Inspeccionar el log, los precios vigentes y el historial de las ofertas incluidas:

- Log presente y todas las ofertas aún en `updatedCashPrice`: la RPC atómica no se confirmó como completada; antes de reintentar, comprobar que no hubo una edición posterior.
- Log presente y precios mezclados entre el valor previo, el actualizado u otro valor: tratarlo como estado heredado parcial o ambiguo. No reejecutar automáticamente; conciliar cada oferta y conservar el log como evidencia.
- Log ausente y ofertas en `previousCashPrice`, con historial de reversión concordante: compatible con una reversión completada, pero confirmar que no hubo otra operación que eliminara el log.
- Cualquier otro patrón: estado ambiguo; detener la reversión y escalar a reconciliación manual.

`operationId` en las sincronizaciones Mami/Disco facilita correlacionar el log cuando existe; no constituye por sí solo un registro de idempotencia ni resuelve resultados de red ambiguos.

## Inventario de cobertura

### Convertido a una transacción de flujo lógico

- Reversión de `price_update_log` en backend principal y móvil.
- Reparación de precios bajos Mami en backend principal.
- Sincronización de precios Disco en backend principal y móvil, incluidos borrado de oferta, escritura del log y conservación del historial previo (la FK deja `offer_id` nulo al borrar la oferta). Los lotes que eliminan ofertas quedan informativos y la RPC de reversión los rechaza, porque el productor no guarda todos los campos necesarios para reconstruir una oferta eliminada.

La integración Disco usa la misma RPC en ambos backends, pero no los mismos criterios de recopilación: el servicio principal incluye límites de precio, detección de saltos sospechosos, normalización a dos decimales y concurrencia; el servicio móvil no. La reparación Mami solo existe en el backend principal. La transacción cubre las escrituras finales, no vuelve equivalentes esas decisiones ni garantiza idénticos lotes.

### Pendiente; bloqueado por los triggers durante mantenimiento, pero no atómico como flujo

- Importación Mami del backend principal.
- Importación Disco de ambos backends.
- Búsqueda pública Disco que escribe en segundo plano en ambos backends.
- Ajuste masivo y edición manual de ofertas.
- Scripts directos de `import_mami_batches`, `sync_disco`, `sync_disco_token_prices`, `backfill_analysis`, `backfill_catalog_taxonomy`, `dedupe_products` y `audit_catalog`, y copias existentes en el backend móvil.

Los escritores pendientes no quedan protegidos por atomicidad de flujo completo. Los triggers rechazan cada DML protegido una vez activo el gate, incluidos los requests REST posteriores a una etapa; un proceso puede, no obstante, dejar cambios de etapas previas. Algunas compensaciones REST de importación también pueden ser rechazadas durante mantenimiento. Hay que inspeccionar y reconciliar esos casos antes de reintentar.

Además, la cobertura por triggers no reemplaza permisos/grants PostgreSQL ni cubre automáticamente nuevos procesos/esquemas. Cada operación pendiente requiere revisar sus tablas y detener/reconciliar sus escrituras ante un error; los backfills y scripts directos no se deben considerar bloqueados hasta verificar que realmente apuntan a las tablas con triggers instalados.

La tabla compartida `brands` no identifica por sí sola el supermercado de una inserción. Las inserciones nuevas se permiten; modificaciones y eliminaciones se contrastan con el origen del producto y las ofertas que ya usan la marca. Las escrituras de ofertas, historial y logs clasificables como Carrefour no quedan bloqueadas cuando el gate solo contiene Mami/Disco. Una modificación de producto compartido sí puede quedar bloqueada si está asociado con Mami o Disco; por ello no se garantiza que toda importación Carrefour permanezca operativa si intenta modificar metadatos compartidos.

## Límites y verificación pendiente

- El DDL base completo de `products`, `offers`, `brands` y sus restricciones no está en las migraciones locales inspeccionadas. El preflight remoto compartido confirmó las nueve tablas y columnas requeridas, pero hay que repetir el preflight actualizado antes de aplicar.
- Aunque las copias de esta migración se mantienen iguales, no se verificó si ambas instalaciones usan la misma base ni qué ruta de migraciones consume cada despliegue.
- El preflight remoto compartido reportó PostgreSQL 17.6; `products.id`, `offers.id` y `offers.product_id` son `integer`, mientras que `price_analysis.product_id`, `price_history.product_id` y `price_history.offer_id` son `bigint`. La prueba local ampliada pasó las rutas probadas con ese perfil; no convertir columnas automáticamente. `offers.supermarket` se reportó como `character varying(100)`.
- La auditoría remota compartida informó grants de tabla para `anon`, `authenticated` y `service_role`, `USAGE` en `public` y `BYPASSRLS` para `service_role`. RLS está habilitado en las nueve tablas y `FORCE RLS` deshabilitado. El resultado compartido no incluía las definiciones de políticas RLS ni privilegios de secuencias; ejecutar el preflight actualizado y revisarlos.
- Se reportaron siete triggers preexistentes de resumen de precios en `offers`, `price_history` y `products`. Deben permanecer y no son por sí solos conflictos con los triggers `BEFORE` que instala el gate.
- La auditoría remota reportó `migration_history_tables: []` y objetos del gate ausentes. La ausencia de los objetos del gate es normal antes de aplicar; confirmar el mecanismo oficial de historial de Supabase y registrar manualmente el resultado si se aplica por SQL Editor.
- En la base local `service_role` no tiene `USAGE` en `products_id_seq` ni `offers_id_seq`. Esto no afectó las RPC probadas, pero los importadores que creen productos u ofertas pueden requerirlo. Revisar el resultado remoto antes de modificar permisos.
- Hay productores legacy que insertan logs informativos sin fuente reconocida, con cambios de forma arbitraria o vacíos. Bajo un gate activo de cualquier tienda, la política fail-closed puede rechazar esos logs, incluso si pertenecen a una operación legítima no atribuible. Clasificar y migrar esos productores antes de activar el gate; no asignarles Carrefour por defecto.
- El DDL de `price_history` confirma `offer_id ON DELETE SET NULL`; el comportamiento de otras FK y triggers en la base destino debe verificarse.
- No se verificaron permisos/grants efectivos de `service_role`, propiedad de funciones, privilegios del dueño, políticas RLS desplegadas, triggers instalados ni caché de esquema PostgREST.
- En la restauración local se ejecutó el smoke test PostgreSQL ampliado: sincronización y reversión válidas Mami, rollback por log inconsistente y eliminación Disco que conserva historial; la prueba termina con `ROLLBACK`. No cubre fallo de historial, reversiones concurrentes, activación frente a transacciones en curso, límites de acceso completos ni despliegue remoto.
- La sincronización Carrefour sigue fuera de la RPC transaccional; el gate no garantiza atomicidad de su proceso ni de los demás flujos multi-REST. Supabase no se modificó y la compatibilidad de producción no está aprobada.
- La sincronización Carrefour solo se encontró en el backend principal. Actualiza ofertas e inserta historial por solicitudes REST, luego avanza el estado y escribe el log del lote; un fallo intermedio puede dejar cambios parciales sin un log completo. No se modificó ese flujo para evitar cambiar el comportamiento normal de sincronización.
