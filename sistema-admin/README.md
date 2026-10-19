# TEFIIS · Panel administrativo

Panel del Tercio de la FIIS-UNI para revisar reclamos de matrícula y gestionar su atención. Desarrollado con React y Vite, utiliza Firebase Authentication para el inicio de sesión y la API de TEFIIS para consultar y actualizar los datos.

Este proyecto forma parte del repositorio TEFIIS: la aplicación estudiantil y la API están en [`../sistema-reclamos/`](../sistema-reclamos/), y la documentación común está en [`../docs/`](../docs/).

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

## Funciones

- Consultar reclamos y datos académicos de estudiantes.
- Revisar documentos mediante enlaces firmados proporcionados por la API.
- Registrar cursos para matricular o desmatricular y consultar las respuestas de un reclamo.
- Comunicar respuestas a estudiantes desde el flujo de atención.
- Consultar conversaciones con Tefi y registros de actividad.
- Administrar las opciones de disponibilidad y atención del sistema, según los permisos de la cuenta.

La interfaz de los cursos resueltos y sus validaciones se describen en [docs/interfaz/](../docs/interfaz/README.md).

## Requisitos

| Requisito | Uso |
| --- | --- |
| Git | Obtener el repositorio. |
| Node.js 22 y npm | Instalar dependencias y ejecutar Vite. |
| API de TEFIIS disponible | Consultar y guardar datos desde el panel. |
| Cuenta de Firebase Authentication | Iniciar sesión con correo y contraseña. |
| Correo autorizado en la API | Acceder a las operaciones administrativas. |

La instalación y compilación del panel no requieren credenciales privadas del backend. Para utilizar sus funciones se necesita la configuración web de Firebase, una API disponible y una cuenta autorizada.

## Inicio rápido

### 1. Obtener e instalar

```bash
git clone https://github.com/ricco-drs/sistema-reclamos.git
cd sistema-reclamos/sistema-admin
npm ci
```

Si ya tienes el repositorio, entra a su carpeta `sistema-admin/` y ejecuta `npm ci`.

### 2. Configurar Firebase y la API

Copia [`.env.example`](.env.example) a `.env` dentro de `sistema-admin/`. Completa las variables de Firebase con la configuración web de tu proyecto (Consola de Firebase → Configuración del proyecto → Tus apps) y define la URL de la API:

```dotenv
VITE_API_URL=http://localhost:3005
```

La dirección debe ir sin barra final. Si no se define esta variable, el panel usa `http://localhost:3005`.

Para iniciar la API local, sigue [Levantar el sistema completo](../sistema-reclamos/README.md#levantar-el-sistema-completo). Se ejecuta en otra terminal, desde `sistema-reclamos/`, con `npm run server`.

### 3. Iniciar el panel

```bash
npm run dev
```

Abre la dirección que indique Vite e inicia sesión con una cuenta autorizada. Si el puerto está ocupado, Vite elige otro disponible; el panel y la aplicación estudiantil son procesos separados.

## Configuración

### Panel

| Configuración | Ubicación | Descripción |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | `.env` | Clave web del proyecto Firebase. Obligatoria. |
| `VITE_FIREBASE_AUTH_DOMAIN` | `.env` | Dominio de autenticación. Obligatoria. |
| `VITE_FIREBASE_PROJECT_ID` | `.env` | Identificador del proyecto. Obligatoria. |
| `VITE_FIREBASE_APP_ID` | `.env` | Identificador de la aplicación web. Obligatoria. |
| `VITE_FIREBASE_STORAGE_BUCKET` y `VITE_FIREBASE_MESSAGING_SENDER_ID` | `.env` | Parámetros adicionales de la configuración web. |
| `VITE_FIREBASE_MEASUREMENT_ID` | `.env` | Opcional; activa Analytics cuando está definido. |
| `VITE_API_URL` | `.env` | URL base de la API. Valor predeterminado: `http://localhost:3005`. |
| `VITE_SUPABASE_URL` | `.env` | URL de Supabase para construir las rutas de documentos del bucket. |

`src/firebase.js` lee estas variables y muestra un error si falta alguna de las cuatro obligatorias. Para usar otro proyecto, cambia los valores de `.env` y utiliza una cuenta de servicio del mismo proyecto en el backend. Reinicia Vite después de cambiar las variables. La configuración web se incluye en el navegador y no contiene claves privadas.

### API

Estas variables corresponden al backend, no al archivo de configuración del panel:

| Variable | Descripción |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | Cuenta de servicio con la que la API verifica los tokens de Firebase. |
| `ADMIN_EMAILS` | Correos autorizados para acceder al panel, separados por comas. |
| `ADMIN_EMAILS_SOLO_LECTURA` | Cuentas con acceso de consulta, según la autorización del backend. |
| `ALLOWED_ORIGINS` | Si se define, debe incluir el origen desde el que se ejecuta el panel. |

Consulta los demás requisitos de la API en su [README](../sistema-reclamos/README.md#levantar-el-sistema-completo).

El panel envía el token de Firebase en las solicitudes administrativas. La API verifica la identidad y los permisos antes de acceder a Supabase. Las credenciales privadas de Firebase y Supabase permanecen en el backend y no deben agregarse al código del panel.

## Comandos

Ejecuta estos comandos desde `sistema-admin/`:

| Comando | Descripción |
| --- | --- |
| `npm ci` | Instala las versiones registradas en `package-lock.json`. |
| `npm run dev` | Inicia el servidor de desarrollo. |
| `npm run build` | Genera los archivos estáticos en `dist/`. |
| `npm run preview` | Sirve localmente una compilación ya generada. |
| `npm run lint` | Ejecuta ESLint sobre el proyecto. |

## Estructura del proyecto

```text
sistema-admin/
├── src/
│   ├── assets/          # Recursos gráficos
│   ├── components/      # Mallas y horarios de cursos
│   ├── data/            # Datos de apoyo de la interfaz
│   ├── hooks/           # Hooks de React
│   ├── utils/           # Utilidades
│   ├── App.jsx          # Vistas y flujos del panel
│   ├── firebase.js      # Inicialización de Firebase
│   └── main.jsx         # Entrada de React
├── firebase.json       # Configuración de Firebase Hosting
├── package.json        # Dependencias y comandos
└── vite.config.js      # Configuración de Vite
```

## Verificación

Antes de proponer un cambio en el panel:

```bash
npm run lint
npm run build
```

Comprueba además el flujo afectado con una cuenta y una API de pruebas. Compilar no verifica el inicio de sesión, los permisos ni las operaciones sobre los reclamos.

El panel no tiene un script de pruebas automatizadas propio. Las pruebas de la API, incluida la operación de cursos resueltos, se ejecutan desde `sistema-reclamos/` con `npm test`. El CI actual ejecuta las pruebas y la comprobación de dependencias del backend; no valida automáticamente este panel.

## Publicación

El proyecto incluye una configuración de Firebase Hosting que sirve `dist/` y redirige las rutas a `index.html`.

1. Define `VITE_API_URL` con la dirección de la API del entorno de destino.
2. Ejecuta `npm run build`.
3. Revisa el resultado con `npm run preview`.
4. Publica `dist/` mediante la configuración de Hosting del proyecto correspondiente.

Vite incorpora `VITE_API_URL` durante la compilación: cambiarla después requiere volver a compilar. La API también debe permitir el origen publicado si utiliza una lista de orígenes CORS.

## Solución de problemas

| Problema | Qué revisar |
| --- | --- |
| El panel abre, pero no carga los datos | Que la API esté disponible y que `VITE_API_URL` apunte al entorno correcto. |
| El inicio de sesión falla | Que la cuenta exista en el proyecto Firebase configurado y que el correo y contraseña sean correctos. |
| La API devuelve 401 o 403 | Que el token pertenezca al proyecto esperado y que el correo esté autorizado en el backend. |
| El navegador muestra un error de CORS | Que `ALLOWED_ORIGINS` incluya el origen exacto del panel, con protocolo y puerto. |
| Un cambio de URL no tiene efecto | Reinicia Vite en desarrollo o vuelve a compilar para publicación. |

## Contribución y documentación

Trabaja en una rama por tarea y presenta los cambios mediante una pull request para revisión de otro integrante. Describe qué cambió y cómo lo verificaste; utiliza la convención `tipo(alcance): descripción` para los commits.

- [Descripción general de TEFIIS](../README.md).
- [API y aplicación estudiantil](../sistema-reclamos/README.md).
- [Interfaz del panel](../docs/interfaz/README.md).
- [Escenarios de calidad](../docs/escenarios.md).
- [Decisiones de arquitectura](../docs/adr/).
