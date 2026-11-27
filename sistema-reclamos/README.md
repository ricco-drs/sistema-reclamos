# TEFIIS · Aplicación estudiantil y API

Plataforma de la FIIS-UNI para registrar y atender reclamos de matrícula. La aplicación permite al estudiante ingresar con su correo institucional, cargar documentos del SIGA y seguir su caso. Tefi responde consultas sobre reglamentos mediante RAG con Gemini File Search.

Este proyecto contiene la aplicación React y la API Express de TEFIIS. El [panel administrativo](../sistema-admin/README.md) utiliza la misma API; la documentación común está en [docs/](../docs/). Proyecto del curso SW708 Arquitectura de Soluciones de Software (2026-2), equipo 2.

## Contenido

- [Funciones](#funciones)
- [Requisitos](#requisitos)
- [Inicio rápido](#inicio-rápido)
- [Configuración](#configuración)
- [Comandos](#comandos)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Verificación](#verificación)
- [Publicación](#publicación)
- [Solución de problemas](#solución-de-problemas)
- [Contribución y documentación](#contribución-y-documentación)
- [Equipo](#equipo)

## Funciones

- **Tefi.** Responde con búsqueda en los reglamentos oficiales (Gemini con File Search) y muestra texto, tablas y fórmulas.
- **Reclamos.** El estudiante sube su ficha académica, su avance curricular y, si la tiene, su boleta de matrícula; elige los cursos y secciones del catálogo, adjunta una evidencia y recibe un número de caso único. Sigue el estado desde la aplicación.
- **Acceso.** Código de 4 dígitos por correo, solo para cuentas `@uni.pe`. El correo sale por Brevo y, si falla, por Resend o Mailjet.
- **Modos de operación.** El Tercio abre o cierra la ventana de reclamos y activa los modos de almuerzo, mantenimiento y despedida sin desplegar.
- **Panel del Tercio.** Vive en la carpeta [sistema-admin/](../sistema-admin/) de este mismo repositorio y usa esta misma API: bandeja de reclamos, cambio de estado, cursos resueltos y respuestas por correo.

## Requisitos

| Requisito | Uso |
| --- | --- |
| Git | Obtener el repositorio. |
| Node.js 22 y npm | Instalar dependencias y ejecutar la aplicación y la API. |
| Supabase | Base de datos mediante PostgREST y almacenamiento de documentos. |
| Gemini y un store de File Search | Consultas de Tefi sobre el corpus institucional. |
| Proveedor de correo | Enviar códigos de acceso, confirmaciones y respuestas. |
| Firebase Authentication | Verificar las sesiones del panel administrativo. |

Las pruebas automatizadas y la compilación pueden ejecutarse sin credenciales. Los flujos completos requieren configurar los servicios externos.

## Inicio rápido

### 1. Obtener e instalar

```bash
git clone https://github.com/ricco-drs/sistema-reclamos.git
cd sistema-reclamos/sistema-reclamos
npm ci
```

Si ya tienes el repositorio, entra a su carpeta `sistema-reclamos/` y ejecuta `npm ci`.

### 2. Configurar los servicios

Crea `.env` en esta carpeta y completa las variables de [Configuración](#configuración). Prepara las tablas de Supabase y el identificador del store de Gemini antes de utilizar los flujos completos.

### 3. Iniciar la API y la aplicación

Ejecuta cada comando en una terminal distinta, dentro de esta carpeta:

```bash
npm run server   # API: http://localhost:3005 por defecto
npm run dev      # Aplicación: abre la URL indicada por Vite
```

Para usar el panel del Tercio, sigue su [README](../sistema-admin/README.md). Se ejecuta por separado.

## Configuración

Para ejecutar los flujos completos se necesita una API con acceso a Supabase, Gemini, Firebase Authentication y al menos un proveedor de correo.

### Variables de entorno

Crea un archivo `.env` en esta carpeta (`sistema-reclamos/`):

| Variable                                                                    | Para qué                                                                | Obligatoria  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| `JWT_SECRET`                                                                | Firmar las sesiones de los estudiantes.                                 | Sí           |
| `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`                                     | Base de datos (PostgREST) y Storage.                                    | Sí           |
| `FIREBASE_SERVICE_ACCOUNT`                                                  | JSON de la cuenta de servicio, para verificar los tokens del panel.     | Sí           |
| `ADMIN_EMAILS`                                                              | Correos que pueden entrar al panel, separados por comas.                | Sí           |
| `VITE_API_KEY`                                                              | Clave de Gemini, para Tefi.                                             | Sí           |
| `FROM_EMAIL`                                                                | Remitente de los correos.                                               | Sí           |
| `BREVO_API_KEY`, `RESEND_API_KEY`, `MAILJET_API_KEY` y `MAILJET_SECRET_KEY` | Proveedores de correo, en ese orden de respaldo.                        | Al menos uno |
| `M2_URL`                                                                    | Servicio M2 que recibe el expediente de cada reclamo.                   | En Railway   |
| `EMAIL_TIMEOUT_MS`                                                          | Espera máxima por proveedor de correo, en ms. Por defecto, 3000.        | No           |
| `EMAIL_CB_ENABLED`                                                          | Activa el circuit breaker (`opossum`) por proveedor (`true` por defecto). | No           |
| `EMAIL_CB_VOLUME_THRESHOLD`                                                 | Intentos mínimos en la ventana antes de evaluar apertura (por defecto, 3). | No           |
| `EMAIL_CB_ERROR_THRESHOLD`                                                  | Porcentaje de fallos que abre el circuito (por defecto, 50).            | No           |
| `EMAIL_CB_RESET_MS`                                                         | Espera en ms antes de probar `halfOpen` (por defecto, 30000).           | No           |
| `EMAIL_CB_WINDOW_MS`                                                        | Ventana deslizante de conteo en ms (por defecto, 60000).                | No           |
| `BREVO_API_URL`, `RESEND_API_URL` y `MAILJET_API_URL`                       | Otra URL por proveedor, por ejemplo uno simulado en pruebas.            | No           |
| `ADMIN_EMAILS_SOLO_LECTURA`                                                 | Cuentas del panel que solo pueden consultar.                            | No           |
| `ALLOWED_ORIGINS`                                                           | Orígenes permitidos por CORS. Sin ella se acepta cualquiera.            | No           |
| `PORT`                                                                      | Puerto de la API. Por defecto, 3005.                                    | No           |
| `VITE_API_URL`                                                              | URL de la API para la aplicación. Por defecto, `http://localhost:3005`. | No           |

### Base de datos

En el editor SQL de Supabase, ejecuta los scripts de [sql/](sql/). Crean la secuencia que numera los reclamos y las tablas `conversaciones` y `respuestas_reclamo`, y agregan la columna `cursos_resueltos`. Las tablas base (`reclamos`, `documentos_estudiante`, `activity_log` y `app_settings`) todavía no tienen script.

### Base de conocimiento de Tefi

Los documentos se mantienen en Gemini File Search y no se incluyen en el repositorio. La API obtiene el identificador del store desde `app_settings`, clave `rag_store_name`. Para un entorno nuevo, configura el identificador de su store. No es necesario volver a cargar los documentos al iniciar la API con un store existente.

El comando `npm run seed-rag` queda como herramienta de reconstrucción: requiere aportar los PDF en una carpeta local `documentos_entrenamiento/` y sustituye el store configurado al terminar. No forma parte del arranque habitual.

## Comandos

Ejecuta estos comandos desde `sistema-reclamos/`:

| Comando | Descripción |
| --- | --- |
| `npm ci` | Instala las versiones registradas en `package-lock.json`. |
| `npm run dev` | Inicia el servidor de desarrollo de la aplicación estudiantil. |
| `npm run server` | Inicia la API Express. |
| `npm run build` | Genera la aplicación estática en `dist/`. |
| `npm run preview` | Sirve localmente una compilación ya generada. |
| `npm run lint` | Ejecuta ESLint. |
| `npm test` | Ejecuta todas las pruebas del backend con `node:test`: las de cada módulo y las que los cruzan. |
| `npm run test:modulos` | Prueba cada módulo por separado. Para uno solo: `npm test -w @tefiis/reclamos`. |
| `npm run arch:check` | Comprueba con dependency-cruiser las capas dentro de cada módulo y los límites entre módulos. |
| `npm run seed-rag` | Reconstruye el store a partir de PDF locales; no es un paso de arranque. |

## Estructura del proyecto

```text
backend/
  server.js              API Express: arranque que conecta los módulos y las rutas que aún no se movieron
  promptTefi.js          Instrucciones de sistema de Tefi
  modulos/               Módulos de negocio; cada uno es un workspace de npm con sus capas (docs/particiones.md)
    reclamos/            Registro de reclamos, evento ReclamoRegistrado y cursos resueltos
    notificaciones/      Consumidores de ReclamoRegistrado: correo de confirmación y expediente a M2
  compartido/            Piezas técnicas sin reglas de negocio: correo, bus de eventos y respuestas HTTP
  tests/                 Pruebas que cruzan módulos (node:test)
src/                     Aplicación de estudiantes (React 19, TypeScript, Vite)
  features/chat/         Conversación con Tefi
  features/admin/        Registro y seguimiento de reclamos del estudiante (el nombre de la carpeta es heredado)
  features/profile/      Perfil y documentos
  data/                  Catálogo de cursos-sección y planes de estudio
sql/                     Scripts de base de datos
scripts/                 Indexación de Tefi y utilidades de datos
laboratorio/             Laboratorio 4-5: costo del cambio (Java)
.dependency-cruiser.cjs  Reglas de capas y de límites entre módulos
```

## Verificación

```bash
npm test
npm run arch:check
npm run build
```

Las pruebas usan dobles de repositorio y no requieren red ni credenciales. Las reglas de `.dependency-cruiser.cjs` comprueban las capas dentro de cada módulo y que ningún módulo importe a otro ([particiones](../docs/particiones.md#cómo-quedó-en-el-build)). Los módulos son workspaces de npm: `npm ci` los enlaza en `node_modules/@tefiis/`, y `server.js` los importa por ese nombre. Estas comprobaciones no reemplazan las pruebas de integración con los servicios reales.

El [CI](../.github/workflows/ci.yml) ejecuta `npm ci`, `npm test` y `npm run arch:check` en cada push y pull request. La compilación de la aplicación y ESLint se ejecutan por separado; para cambios de interfaz, verifica también `npm run lint` y el flujo afectado.

## Publicación

La aplicación estudiantil y la API se ejecutan por separado:

1. Configura `VITE_API_URL` con la URL de la API de destino y ejecuta `npm run build` para generar `dist/`.
2. Publica `dist/` en el alojamiento de la aplicación web.
3. Para la API, configura las variables del entorno y utiliza `npm run server`. El archivo `railway.toml` define la instalación y el arranque del backend en Railway.
4. Incluye los orígenes de la aplicación y del panel en `ALLOWED_ORIGINS` cuando se utilice esa restricción CORS.

Vite incorpora las variables `VITE_*` durante la compilación. Mantén las claves privadas del backend fuera del código y del repositorio.

## Solución de problemas

| Problema | Qué revisar |
| --- | --- |
| Git muestra `Filename too long` en Windows | Habilita rutas largas con `git config --global core.longpaths true` y vuelve a clonar. |
| La aplicación no conecta con la API | Que la API esté iniciada y `VITE_API_URL` apunte al entorno correcto. |
| El navegador muestra un error de CORS | Que `ALLOWED_ORIGINS` incluya el origen exacto, con protocolo y puerto. |
| No llega el código por correo | Las credenciales del proveedor, el remitente y los errores registrados por la API. |
| Tefi no encuentra el store | El valor de `rag_store_name` en `app_settings` y el acceso de la cuenta de Gemini a ese store. |
| Las rutas administrativas devuelven 401 o 403 | El proyecto de `FIREBASE_SERVICE_ACCOUNT`, el token del panel y el correo en `ADMIN_EMAILS`. |

## Contribución y documentación

Trabaja en una rama por tarea y presenta una pull request para revisión de otro integrante. Describe qué cambió y cómo lo verificaste; utiliza la convención `tipo(alcance): descripción` para los commits.

| Documento                                              | Contenido                                              |
| ------------------------------------------------------ | ------------------------------------------------------ |
| [docs/arquitectura.md](../docs/arquitectura.md)           | Informe de la Entrega 1                                |
| [docs/ficha-del-sistema.md](../docs/ficha-del-sistema.md) | Ficha del sistema                                      |
| [docs/escenarios.md](../docs/escenarios.md)               | Escenarios de calidad y su priorización                |
| [docs/c4/](../docs/c4/)                                   | Modelo C4 en Structurizr DSL y sus tres diagramas      |
| [docs/adr/](../docs/adr/)                                 | Registros de decisiones de arquitectura                |
| [docs/interfaz/](../docs/interfaz/)                       | Flujos principales y frontera entre interfaz y dominio |
| [docs/bitacora-ia.md](../docs/bitacora-ia.md)             | Bitácora de uso de IA                                  |
| [docs/costo-del-cambio.md](../docs/costo-del-cambio.md)   | Cuadro del Laboratorio 4-5                             |
| [Inventario del corpus](../docs/corpus-tefi.md) | Documentos de consulta de Tefi |

## Equipo

| Integrante                                 | Código    |
| ------------------------------------------ | --------- |
| Castro Aguirre, Lenin Giomar (coordinador) | 20240243J |
| Albino Soto, Christopher Henrry            | 20231158C |
| Nuñez Villazana, Franz Pool                | 20244028F |
| Puris Ricaldi, Roy Farid                   | 20244011F |
| Rashuaman Sapallanay, Ricco Didier         | 20231242D |
