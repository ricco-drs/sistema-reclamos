# TEFIIS

Repositorio del portal de reclamos de estudiantes (React y Express) y del [panel del Tercio](sistema-admin/) (React y Firebase). La documentación de arquitectura está en [docs/](docs/).

## Arranque local con Docker Compose (Lab11)

Desde un clon limpio, con Docker y el complemento Compose v2:

```bash
git clone https://github.com/ricco-drs/sistema-reclamos.git
cd sistema-reclamos
docker compose up --build --detach --wait
```

Abre el [portal estudiantil](http://localhost:4173) y comprueba la [salud de la API](http://localhost:3005/health). `docker compose ps` muestra el estado de los servicios. PostgreSQL inicializa un esquema de pruebas en el volumen `datos`. La API consulta ese esquema vía PostgREST y solo el portal y la API tienen puertos publicados en el equipo.

El entorno permite registrar y consultar reclamos con sesiones sintéticas. Para parametrizarlo, copia [`.env.example`](.env.example) a `.env` en la raíz. `JWT_SECRET` se aplica tanto a la API como a las sesiones de prueba. Para usar el panel local con un proyecto Firebase de pruebas, configura también `FIREBASE_SERVICE_ACCOUNT` y `ADMIN_EMAILS` y levanta el panel con sus propias variables web. El esquema local cubre el flujo de reclamos. Las consultas de Tefi y los archivos de Supabase Storage requieren sus servicios correspondientes. El portal de Compose solo permite conexiones del navegador hacia la API local.

Para probar el correo y M2 con servicios simulados, usa [la configuración de eventos](docs/resiliencia.md#6-registro-real-con-simuladores-en-docker-compose). Ese entorno comprueba el registro y su reintento con PostgreSQL y PostgREST locales.

### Datos para los escenarios E1, E2 y E3

Ejecuta estos pasos desde la raíz. El [generador de tokens](sistema-reclamos/pruebas/generar-tokens.js) y el [script de siembra](sistema-reclamos/scripts/sembrar-reclamos.js) ya están en el repositorio.

1. Copia `.env.example` a `.env`, asigna un `JWT_SECRET` de prueba y vuelve a ejecutar `docker compose up --detach --wait` para aplicar ese valor a la API. Con Node.js 22, ejecuta `npm --prefix sistema-reclamos ci` y genera los tokens con `node --env-file=.env sistema-reclamos/pruebas/generar-tokens.js`.
2. Para sembrar E2, copia el script al contenedor y ejecútalo allí. PostgREST es accesible desde la red de Compose.

   ```bash
   docker compose cp sistema-reclamos/scripts/sembrar-reclamos.js api:/app/scripts/sembrar-reclamos.js
   docker compose exec -T api node scripts/sembrar-reclamos.js
   ```

3. Al terminar las pruebas, ejecuta `docker compose exec -T api node scripts/sembrar-reclamos.js --limpiar` para retirar los reclamos sintéticos. `docker compose down` detiene el entorno y conserva los datos locales.

## Arranque con Node.js

Desde la raíz, abre dos terminales en `sistema-reclamos/`. Con Node.js 22, ejecuta `npm ci` en esa carpeta y prepara el `.env` siguiendo la [configuración del backend](sistema-reclamos/README.md#configuración). Incluye las credenciales del entorno que corresponda para Supabase, Firebase, Gemini y el proveedor de correo.

```bash
npm run server   # API en http://localhost:3005
npm run dev      # Portal de estudiantes en la URL que muestra Vite
```

Para el panel administrativo, entra a `sistema-admin/`, instala las dependencias con `npm ci`, configura su [archivo de entorno](sistema-admin/.env.example) y ejecuta `npm run dev`. Consulta su [guía de inicio](sistema-admin/README.md#inicio-rápido) para los requisitos de Firebase y la URL de la API.
