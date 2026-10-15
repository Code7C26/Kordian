# Plan de Configuración de APK para Dispositivos Externos

Este plan detalla los pasos necesarios para que la aplicación Android (generada vía Capacitor) pueda comunicarse con el servidor backend ejecutándose en tu máquina local (`192.168.1.51`) y sincronizarse correctamente con la base de datos Supabase configurada en el `.env`.

## User Review Required

> [!IMPORTANT]
> Para que esto funcione, tanto tu computadora (servidor) como los dispositivos móviles donde instales la APK deben estar conectados a la **misma red Wi-Fi**.
> Además, debes asegurarte de que el firewall de tu computadora permita tráfico entrante en el puerto **3000**.

## Proposed Changes

### Android Configuration

#### [MODIFY] [AndroidManifest.xml](file:///C:/Users/Usuario/Desktop/Kordian/android/app/src/main/AndroidManifest.xml)
- Añadir `android:usesCleartextTraffic="true"` para permitir conexiones HTTP al servidor local (Android bloquea HTTP por defecto).

### Capacitor Configuration

#### [MODIFY] [capacitor.config.json](file:///C:/Users/Usuario/Desktop/Kordian/capacitor.config.json)
- Habilitar `cleartext` y configurar `allowNavigation` para permitir la comunicación con la IP externa.

### Frontend Configuration

#### [NEW] [.env](file:///C:/Users/Usuario/Desktop/Kordian/.env)
- Crear archivo `.env` en la raíz del proyecto para que Vite configure `VITE_API_URL` con la IP `http://192.168.1.51:3000`.

## Verification Plan

### Automated Tests
1. `npm run build`: Verificar que los activos web se generen con la nueva URL de API.
2. `npx cap sync android`: Sincronizar cambios con el proyecto nativo.
3. `gradlew assembleDebug`: Generar la APK final.

### Manual Verification
1. Instalar la APK en un dispositivo físico.
2. Verificar que la aplicación cargue datos del servidor y permita login/búsqueda.
3. Confirmar en el log del servidor que las peticiones llegan desde la IP del dispositivo móvil.
