# Arreglo del consumo de egress en Supabase

Hay que copiar estos archivos sobre el repo, respetando las mismas rutas.
En `cambios.diff` está el detalle línea por línea. También se puede aplicar con `git apply cambios.diff`.

## Problema principal: el arranque del servidor bajaba ~30 MB

Cada vez que arranca `server.js`, `enqueueIncompletePriceStatuses` revisaba que el
`analysis_details` de los 9.098 productos estuviera completo. Para eso lo descargaba
entero, unos 30 MB, en 91 requests de 100 productos.

Con `npm run dev`, nodemon reinicia el servidor cada vez que se guarda un archivo
en `server.js` o en `services/`. Cada guardado costaba ~30 MB, más la recarga del
catálogo. Ayer hubo 12 reinicios en 45 minutos. Hoy todas las filas están completas
y al día, así que esa revisión no encontraba nada que reprocesar.

**Qué cambió:**
- `server/services/currentPriceStatus.js`: `enqueueIncompletePriceStatuses` recibe la opción
  `{ checkDetails }`. Con `false` lee solo `product_id, rules_version`. Sigue encolando
  los productos sin status y los que tienen un `rules_version` viejo.
- `server/server.js`: en el arranque, la revisión completa queda apagada salvo que se
  configure `PRICE_STATUS_BOOTSTRAP_CHECK_DETAILS=true`. Solo hace falta prenderla una vez,
  si se cambia cómo se arma `analysis_details` sin subir `PRICE_STATUS_RULES_VERSION`.
- `server/services/currentPriceStatus.test.cjs`: nuevo test para el modo liviano.
  Los tests que ya existían quedan iguales y los 6 pasan:
  `node --test services/currentPriceStatus.test.cjs`

Resultado: cada arranque baja de ~30 MB a unos cientos de KB.

**Para desarrollo local:** se puede poner `PRICE_STATUS_BOOTSTRAP_ENABLED=false` en el `.env`
local para saltear el bootstrap por completo. Esa variable ya existía.

## Bug aparte: polling con la sesión vencida

`src/contexts/CustomerAuthContext.jsx` pide `/customer/notifications` cada 30 s. La sesión
solo se renovaba al cargar la página, así que con la pestaña abierta más de 1 h el token
vencía y el polling seguía mandándolo para siempre. En los logs de Supabase aparece como
`403 bad_jwt` en `/auth/v1/user`, una vez por minuto todo el día.

**Qué cambió:** si el polling recibe un 401, renueva la sesión con `/auth/customer-refresh`
y sigue con el token nuevo. Si no se puede renovar, cierra la sesión y deja de hacer polling.
`requestCustomerJson` ahora también adjunta `error.status`.

## Pendiente, menor

- `getAnalysisCatalog` (server.js) descarga el catálogo completo con `select('*', offers(*), ...)`,
  unos 8 MB, cada vez que se invalida la caché: cuando se edita un producto o cambia un precio en
  la sincronización con Carrefour. Pesa menos que el bootstrap, pero se podría optimizar más adelante.
- No se corrió ESLint sobre `CustomerAuthContext.jsx`, porque no estaba instalado. Conviene pasarle
  `npm run lint` antes de commitear.
