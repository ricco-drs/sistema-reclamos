# TEFIIS: sistema de gestión de reclamos estudiantiles

**TEFIIS** es la plataforma web con la que la Facultad de Ingeniería Industrial y de Sistemas (FIIS) de la UNI recibe y resuelve los reclamos de matrícula de sus estudiantes. El estudiante entra con su correo `@uni.pe`, sube sus documentos del SIGA, registra su reclamo y lo sigue con un número `REC-AAAA-NNNN`. El Tercio lo revisa desde un panel propio y le responde por correo. **Tefi**, un asistente con IA, responde dudas sobre reglamentos y trámites buscando en los documentos oficiales de la facultad.

Proyecto del curso SW708 Arquitectura de Soluciones de Software (2026-2), equipo 2. La documentación de arquitectura está en [docs/](#documentación).

## Construir y probar

Requisitos: Git, Node.js 22 y npm. No hacen falta credenciales.

```bash
git clone https://github.com/ricco-drs/sistema-reclamos.git
cd sistema-reclamos/sistema-reclamos
npm ci
npm test
npm run arch:check
npm run build
```

| Comando              | Qué hace                                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`             | Instala las dependencias exactas de `package-lock.json`.                                                                          |
| `npm test`           | Corre las 12 pruebas de `backend/tests/` con `node:test`. No usan red, base de datos ni credenciales.                             |
| `npm run arch:check` | Comprueba con dependency-cruiser la regla `dominio-limpio`: `backend/dominio/` no puede importar infraestructura ni presentación. |
| `npm run build`      | Compila la aplicación de estudiantes en `dist/`.                                                                                  |

En un clon limpio, los seis comandos tardaron 3 min 10 s en total (Windows 11, Node 22.16), y 1 min 44 s sin `npm run build`. La integración continua ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) corre `npm ci`, `npm test` y `npm run arch:check` en cada push y en cada pull request.

**En Windows**, si `git clone` falla con `Filename too long`, activa las rutas largas y vuelve a clonar:

```bash
git config --global core.longpaths true
```

## Levantar el sistema completo

La API depende de cinco servicios en la nube, así que para levantarla hacen falta cuentas propias en cada uno.

**1. Variables de entorno.** Crea un archivo `.env` en esta carpeta (`sistema-reclamos/`):

| Variable                                                                    | Para qué                                                                | Obligatoria  |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------ |
| `JWT_SECRET`                                                                | Firmar las sesiones de los estudiantes.                                 | Sí           |
| `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`                                     | Base de datos (PostgREST) y Storage.                                    | Sí           |
| `FIREBASE_SERVICE_ACCOUNT`                                                  | JSON de la cuenta de servicio, para verificar los tokens del panel.     | Sí           |
| `ADMIN_EMAILS`                                                              | Correos que pueden entrar al panel, separados por comas.                | Sí           |
| `VITE_API_KEY`                                                              | Clave de Gemini, para Tefi.                                             | Sí           |
| `FROM_EMAIL`                                                                | Remitente de los correos.                                               | Sí           |
| `BREVO_API_KEY`, `RESEND_API_KEY`, `MAILJET_API_KEY` y `MAILJET_SECRET_KEY` | Proveedores de correo, en ese orden de respaldo.                        | Al menos uno |
| `ADMIN_EMAILS_SOLO_LECTURA`                                                 | Cuentas del panel que solo pueden consultar.                            | No           |
| `ALLOWED_ORIGINS`                                                           | Orígenes permitidos por CORS. Sin ella se acepta cualquiera.            | No           |
| `PORT`                                                                      | Puerto de la API. Por defecto, 3005.                                    | No           |
| `VITE_API_URL`                                                              | URL de la API para la aplicación. Por defecto, `http://localhost:3005`. | No           |

**2. Base de datos.** En el editor SQL de Supabase, ejecuta los scripts de [sql/](sql/). Crean la secuencia que numera los reclamos y las tablas `conversaciones` y `respuestas_reclamo`, y agregan la columna `cursos_resueltos`. Las tablas base (`reclamos`, `documentos_estudiante`, `activity_log` y `app_settings`) todavía no tienen script.

**3. Base de conocimiento de Tefi.** Sube a Gemini los PDF de `documentos_entrenamiento/`:

```bash
npm run seed-rag
```

**4. Arrancar.** La API y la aplicación, cada una en su terminal:

```bash
npm run server   # API en http://localhost:3005
npm run dev      # aplicación en http://localhost:5173
```

## Qué hace

- **Tefi.** Responde con búsqueda en los reglamentos oficiales (Gemini con File Search) y muestra texto, tablas y fórmulas.
- **Reclamos.** El estudiante sube su ficha académica, su avance curricular y, si la tiene, su boleta de matrícula; elige los cursos y secciones del catálogo, adjunta una evidencia y recibe un número de caso único. Sigue el estado desde la aplicación.
- **Acceso.** Código de 4 dígitos por correo, solo para cuentas `@uni.pe`. El correo sale por Brevo y, si falla, por Resend o Mailjet.
- **Modos de operación.** El Tercio abre o cierra la ventana de reclamos y activa los modos de almuerzo, mantenimiento y despedida sin desplegar.
- **Panel del Tercio.** Vive en la carpeta [sistema-admin/](../sistema-admin/) de este mismo repositorio y usa esta misma API: bandeja de reclamos, cambio de estado, cursos resueltos y respuestas por correo.

## Estructura

```text
backend/
  server.js              API Express: rutas, autenticación, correo, Tefi y composición de la rodaja
  promptTefi.js          Instrucciones de sistema de Tefi
  presentacion/          Rodaja «registrar cursos resueltos»: adaptador HTTP
  aplicacion/            Caso de uso
  dominio/               Reglas y puerto de persistencia
  infraestructura/       Adaptadores de Supabase y en memoria
  tests/                 Pruebas con node:test
src/                     Aplicación de estudiantes (React 19, TypeScript, Vite)
  features/chat/         Conversación con Tefi
  features/admin/        Registro y seguimiento de reclamos del estudiante (el nombre de la carpeta es heredado)
  features/profile/      Perfil y documentos
  data/                  Catálogo de cursos-sección y planes de estudio
documentos_entrenamiento/  Reglamentos oficiales que consulta Tefi
sql/                     Scripts de base de datos
scripts/                 Indexación de Tefi y utilidades de datos
laboratorio/             Laboratorio 4-5: costo del cambio (Java)
.dependency-cruiser.cjs  Regla de arquitectura dominio-limpio
```

## Documentación

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

## Equipo

| Integrante                                 | Código    |
| ------------------------------------------ | --------- |
| Castro Aguirre, Lenin Giomar (coordinador) | 20240243J |
| Albino Soto, Christopher Henrry            | 20231158C |
| Nuñez Villazana, Franz Pool                | 20244028F |
| Puris Ricaldi, Roy Farid                   | 20244011F |
| Rashuaman Sapallanay, Ricco Didier         | 20231242D |
