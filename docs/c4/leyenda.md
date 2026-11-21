# Leyenda de Responsabilidades y Análisis – Modelo C4 (TEFIIS)

Este documento detalla la responsabilidad de cada componente y elemento modelado en los diagramas C4 del sistema TEFIIS en [workspace.dsl](workspace.dsl), junto con las decisiones de alcance, las observaciones arquitectónicas y las revisiones de cada nivel.

---

## 1. Nivel 1: Diagrama de Contexto (Sistema TEFIIS)

![Diagrama de Contexto](img/Contexto.svg)
*Leyenda generada:* [Contexto-key.svg](img/Contexto-key.svg)

### Qué muestra
TEFIIS como una sola caja negra de software central, los tres actores que interactúan con él a través de sus respectivos portales web (Estudiante UNI-FIIS, Miembro del tercio estudiantil y Administrador del sistema), y los cuatro servicios externos de los que depende: **Proveedores de correo** (con respaldo automático entre Brevo, Resend y Mailjet), **Gemini API** para el asistente inteligente Tefi (RAG), **Firebase Authentication** para la autenticación del panel administrativo y el **Servicio M2**, que recibe el expediente de cada reclamo registrado.

### Qué se decidió dejar afuera a propósito
* **La entrega física del correo al estudiante:** Se omitió la flecha de retorno desde los proveedores de correo hacia el estudiante (y la infraestructura de buzones como Gmail o correo institucional). El sistema cumple su responsabilidad entregando la petición a la API del proveedor de correo; modelar el rebote al estudiante generaba un ciclo visual innecesario en la vista de contexto.
* **Infraestructura de red y hosting:** No se detallan servidores de despliegue, DNS ni proxies reversos (Cloudflare Workers, Railway, Render), manteniendo el diagrama en un nivel puramente funcional y de negocio.

### Observación del equipo
> **Estrategia de respaldo en cascada y análisis de resiliencia en correos:** Al modelar las dependencias externas, el equipo constató que Brevo **no constituye un punto único de falla ni carece de failover**: la función `sendEmail` (`backend/server.js:311-333`) implementa un mecanismo de respaldo automático en cascada que intenta el envío por `Brevo`, y si este falla (por cuotas agotadas o errores HTTP), conmuta automáticamente a `Resend`, y finalmente a `Mailjet`.
>
> Sin embargo, el ejercicio de modelado permitió identificar dos riesgos arquitectónicos importantes en la implementación actual de `server.js`:
> 1. **Ausencia de timeout por proveedor en `server.js`:** Las funciones de envío (`sendViaBrevo`, `sendViaResend`, `sendViaMailjet`) en `server.js` ejecutan `fetch` sin un `AbortController` ni tiempo límite de espera. Si Brevo experimenta alta latencia o una conexión colgada, la petición permanece bloqueada antes de pasar al siguiente proveedor *(mitigado en el adaptador `crearEnviadorCorreo` con `AbortSignal.timeout` de #34 y en `crearClienteM2Http` de #27, pendientes de conectar en `server.js`)*.
> 2. **Falla simultánea de la cascada y bloqueo síncrono:** Si los tres proveedores fallan a la vez (por agotamiento acumulado de sus cuotas gratuitas diarias o caída general), `sendEmail` lanza una excepción síncrona al no disponer de una cola de reintentos en diferido *(en el registro de reclamos, el flujo por eventos `ReclamoRegistrado` de #27 desacopla el envío de confirmación y de M2 mediante `busEnProceso` para que una falla externa no aborte ni demore el `200 OK` al estudiante, pendiente de conectar en `server.js`)*.
>
> Por el contrario, **Google Gemini y Firebase Authentication sí representan puntos únicos de falla reales**, ya que el sistema no dispone de ningún servicio alternativo en caso de que fallen o queden inaccesibles.

### Tabla de Responsabilidades – Nivel 1
| Elemento | Tipo | Responsabilidad (una línea) |
| :--- | :--- | :--- |
| **Estudiante UNI-FIIS** | Persona | Ingresa al portal de estudiantes para registrar solicitudes de reclamo de matrícula y consultar reglamentos mediante Tefi. |
| **Miembro del tercio estudiantil** | Persona | Utiliza el panel de gestión para revisar expedientes de reclamos, proponer soluciones y emitir respuestas a los alumnos. |
| **Administrador del sistema** | Persona | Accede al panel administrativo para gestionar cuentas de usuario, permisos y parámetros operativos del sistema. |
| **Sistema TEFIIS** | Software System | Registra, gestiona, automatiza y resuelve integralmente el ciclo de vida de los reclamos de matrícula estudiantiles. |
| **Proveedores de correo** | Sistema externo | Despacha correos electrónicos transaccionales con códigos de verificación, confirmaciones y resoluciones con fallback automático (Brevo $\rightarrow$ Resend $\rightarrow$ Mailjet). |
| **Servicio LLM Externo (Gemini API)** | Sistema externo | Ejecuta la búsqueda semántica sobre los reglamentos universitarios indexados (RAG) para generar las respuestas del asistente Tefi. |
| **Firebase Authentication** | Sistema externo | Gestiona la autenticación, emisión y validación de tokens de identidad para el acceso seguro al panel administrativo. |
| **Servicio M2** | Sistema externo | Recibe el expediente de cada reclamo (ID, código, correo, nombre, motivo y descripción) al registrarse en el sistema. |

---

## 2. Nivel 2: Diagrama de Contenedores (Sistema TEFIIS)

![Diagrama de Contenedores](img/Contenedores.svg)
*Leyenda generada:* [Contenedores-key.svg](img/Contenedores-key.svg)

### Qué muestra
La arquitectura de ejecución del sistema dividida en sus 5 contenedores desplegables o almacenes de datos: dos aplicaciones cliente en React que viven en carpetas del mismo repositorio (`Aplicación de estudiantes` en `sistema-reclamos/` y `Panel del Tercio y Administración` en `sistema-admin/`), una API backend central en `Node.js 22 / Express 5` que concentra las reglas de negocio y la publicación de eventos, y dos contenedores de almacenamiento en Supabase (`Base de datos PostgreSQL` y `Storage de Archivos`), detallando los protocolos reales de comunicación entre ellos (`HTTPS`, `JSON/HTTPS con JWT/Bearer` y `PostgREST/HTTPS`).

### Qué se decidió dejar afuera a propósito
* **Estructura interna de la base de datos:** No se detallan tablas individuales (`reclamos`, `respuestas_reclamo`, `activity_log`, `conversaciones`) ni esquemas relacionales, tratándose la base de datos como una sola unidad transaccional.
* **Acceso directo Cliente-Supabase:** Aunque Supabase permite consultar datos directamente desde el frontend mediante su SDK cliente, se dejó fuera deliberadamente porque la arquitectura de TEFIIS obliga a que toda petición pase por la API Express para garantizar auditoría, validaciones y reglas de negocio.
* **Herramientas de construcción:** Se omitieron herramientas de compilación y empaquetado (Vite, TypeScript compiler, ESLint, dependency-cruiser).

### Observación del equipo
> **Doble rol de Supabase, monorrepo con dos carpetas y transición del Servicio M2 a la API:** El equipo destaca tres aspectos arquitectónicos del nivel de contenedores:
> 1. **Supabase en dos contenedores:** Opera como una base relacional transaccional (PostgreSQL vía PostgREST) y como un almacén de objetos para evidencias y PDFs oficiales (Storage mediante URLs firmadas temporales).
> 2. **Dos aplicaciones web en el mismo repositorio ([ADR-0005](../adr/0005-un-repositorio-con-dos-carpetas.md)):** El panel del Tercio (`sistema-admin/`) y el portal estudiantil (`sistema-reclamos/`) viven en carpetas del mismo repositorio y hablan con una única API.
> 3. **Publicación de `ReclamoRegistrado` hacia M2 (`objetivo #27`):** En el flujo por eventos implementado en `backend/` ([docs/api/eventos.md](../api/eventos.md), integrado en `develop` en #27), la `API TEFIIS` publica `ReclamoRegistrado` al guardar el reclamo y tiene como consumidores al notificador de correo y al envío del expediente a `Servicio M2` (`api -> m2`). Mientras el bus en proceso no se conecte al arranque compartido de `server.js` y se retiren las llamadas de `useReclamos.ts:898-946`, el código en ejecución mantiene temporalmente `POST /api/reclamos/confirmar` y el `fetch` directo desde la aplicación de estudiantes a M2.

### Tabla de Responsabilidades – Nivel 2
| Contenedor | Tecnología | Responsabilidad (una línea) |
| :--- | :--- | :--- |
| **Aplicación de estudiantes** | React 19, TypeScript, Vite (`sistema-reclamos/`) | Proporciona la interfaz web para que el estudiante registre reclamos, adjunte evidencias, converse con Tefi y consulte el estado de sus expedientes. |
| **Panel del Tercio y Administración** | React, Vite (`sistema-admin/`) | Brinda la interfaz de gestión para que miembros del Tercio y administradores evalúen expedientes, asignen estados y resuelvan cursos. |
| **API TEFIIS** | Node.js 22, Express 5 | Centraliza las reglas de negocio, endpoints REST, validaciones de seguridad, publicación de `ReclamoRegistrado` (#27), integración con IA y orquestación de servicios externos. |
| **Base de datos** | PostgreSQL en Supabase | Almacena y asegura de manera persistente las tablas de reclamos, respuestas, registros de auditoría, sesiones y configuraciones del sistema. |
| **Archivos** | Supabase Storage | Almacena los documentos PDF oficiales del SIGA y evidencias adjuntas por los estudiantes, sirviéndolos mediante URLs firmadas y seguras. |

---

## 3. Nivel 3: Diagrama de Componentes (API TEFIIS)

![Diagrama de Componentes](img/Componentes.svg)
*Leyenda generada:* [Componentes-key.svg](img/Componentes-key.svg)

### Qué muestra
El contenedor central (`API TEFIIS`) abierto en sus 8 componentes arquitectónicos: `Autenticación y Autorización`, `Gestión de Reclamos y Cursos` (casos de uso, dominio y rutas aún en `server.js`), `Adaptadores de Persistencia` (que implementa los puertos `RepositorioReclamos` y `RepositorioCursosResueltos` con sus adaptadores intercambiables en Supabase y en memoria), `Bus de Eventos y Consumidor M2` (que implementa `PublicadorEventos` y `ClienteM2` en HTTP y en memoria), `Notificaciones`, `Asistente Virtual Tefi (RAG)`, `Auditoría y Trazabilidad` y `Gestión de Documentos`.

### Qué se decidió dejar afuera a propósito
* **Funciones utilitarias sueltas como cajas individuales:** No se dibuja una caja por cada función auxiliar (como `sanearCursos`, `cursosValidos` o `emailTemplate`), agrupándolas en sus componentes arquitectónicos para respetar la regla C4 de 4 a 8 componentes por contenedor.
* **Configuraciones de transporte:** Se dejaron fuera los parsers de body JSON, cabeceras CORS, limitadores de tasa (`express-rate-limit`) y librerías utilitarias sin lógica de dominio.

### Estado en el código (`develop`): conectado en `server.js` vs. implementado en `backend/`

| Capacidad / Relación en el diagrama | Estado en `develop` | Dónde vive en el código |
| :--- | :--- | :--- |
| **Rodaja de cursos resueltos** (`reclamos -> persistencia -> bd` vía `RepositorioCursosResueltos`) | **Ya conectado en `server.js`** | `backend/presentacion/guardarCursosHandler.js`, `backend/aplicacion/guardarCursosResueltos.js`, `backend/dominio/cursosResueltos.js`, `backend/infraestructura/repositorioCursosSupabase.js` y `repositorioCursosMemoria.js` (`server.js:1207-1209`). |
| **Resto de rutas de reclamos, panel, Tefi, documentos y auditoría** | **Activo en `server.js` (usa `sbRest` directo)** | `backend/server.js` (líneas 1–2351) y `backend/promptTefi.js`. |
| **Flujo por eventos `ReclamoRegistrado` y consumidores de correo y M2** (`reclamos -> eventos -> notificaciones / m2`, rotulado `objetivo #27`) | **Implementado y probado en `backend/` (#27), pendiente de conectar en `server.js`** | `backend/aplicacion/registrarReclamo.js`, `backend/aplicacion/consumidores/`, `backend/infraestructura/busEnProceso.js`, `publicadorMemoria.js`, `clienteM2.js`, `repositorioReclamosSupabase.js` y `repositorioReclamosMemoria.js`. Mientras no se conecte en `server.js`, la app sigue usando `POST /api/reclamos/confirmar` y el `fetch` de `useReclamos.ts:935`. |
| **Adaptador de correo con Timeout (`AbortSignal.timeout`) y URLs configurables** | **Implementado y probado en `backend/` (#34), pendiente de conectar en `server.js`** | `backend/infraestructura/enviadorCorreo.js` y `pruebas/proveedorCorreoSimulado.js` ([docs/resiliencia.md](../resiliencia.md)). |

### Tabla de Responsabilidades – Nivel 3
| Componente | Ubicación / Tipo | Responsabilidad (una línea) |
| :--- | :--- | :--- |
| **Componente de Autenticación y Autorización** | `server.js` (Middlewares `requireStudentAuth` y `requireAdminAuth`) | Valida JWT de estudiantes y tokens de Firebase, verifica listas de administradores autorizados y protege las rutas privadas de la API. |
| **Componente de Gestión de Reclamos y Cursos** | `backend/presentacion/`, `backend/aplicacion/` y `backend/dominio/` (y rutas aún en `server.js`) | Ejecuta las reglas de dominio y casos de uso: registra reclamos, publica `ReclamoRegistrado` (#27), gestiona estados y resuelve cursos a través de puertos. |
| **Adaptadores de Persistencia** | `backend/infraestructura/` (`repositorioCursosSupabase`, `repositorioCursosMemoria`, `repositorioReclamosSupabase`, `repositorioReclamosMemoria`) | Implementa los puertos `RepositorioCursosResueltos` y `RepositorioReclamos` con adaptadores en Supabase y en memoria (las rutas de `server.js` aún no migradas siguen usando `sbRest` directo). |
| **Bus de Eventos y Consumidor M2** | `backend/infraestructura/` (`busEnProceso`, `publicadorMemoria`, `clienteM2`) y `backend/aplicacion/consumidores/enviarExpedienteAM2.js` | Implementa el puerto `PublicadorEventos`, distribuye `ReclamoRegistrado` sin bloquear la petición y envía el expediente a M2 mediante el puerto `ClienteM2` (HTTP o Memoria, `objetivo #27`). |
| **Componente de Notificaciones** | `backend/aplicacion/consumidores/notificarReclamoRegistrado.js`, `enviadorCorreo.js` y `sendEmail` en `server.js` | Consume `ReclamoRegistrado` (`objetivo #27`) para confirmar reclamos y despacha códigos y resoluciones con respaldo automático (`Brevo -> Resend -> Mailjet`). |
| **Componente de Asistente Virtual Tefi** | `promptTefi.js` y `server.js` | Procesa las consultas en lenguaje natural del estudiante consultando los reglamentos mediante búsqueda semántica (RAG) en Gemini. |
| **Componente de Auditoría y Trazabilidad** | `logActividad` en `server.js` | Registra de forma inmutable en `activity_log` cada acción administrativa, creación de reclamo y decisión de cursos. |
| **Componente de Gestión de Documentos** | `server.js` | Valida los archivos PDF del SIGA y evidencias adjuntas, gestionando su almacenamiento y URLs firmadas en Supabase Storage. |

---

## 4. Observaciones del Equipo Revisor: Grupo 3

Tras cotejar el archivo [workspace.dsl](workspace.dsl) contra el código fuente del repositorio (`sistema-reclamos` y `sistema-admin`), el **Grupo 3** anota las siguientes observaciones:

1. **Componentes modelados como clases o archivos individuales (Nivel 3):**
   * En la versión inicial de la API TEFIIS se dibujaron funciones, interfaces y archivos de una sola operación (`guardarCursosHandler`, `cursosResueltos`, `RepositorioCursosResueltos`, `repositorioCursosSupabase`, etc.) en lugar de componentes arquitectónicos que agrupen responsabilidades de negocio. Se debe consolidar en componentes de negocio de nivel contenedor (entre 4 y 8 componentes).

2. **Flechas sin verbo o sin protocolo:**
   * **Sin verbo:** La relación `spa -> api` iniciaba con sustantivos (`"Reclamos, documentos y preguntas a Tefi"`), faltando un verbo de acción al inicio.
   * **Sin protocolo:** Las flechas internas entre componentes (`auth -> reclamos`, `reclamos -> notificaciones`, `reclamos -> auditoria`) no tenían protocolo de comunicación declarado (aparecían sin corchetes en el diagrama).

3. **Caja con ruta de repositorio en lugar de tecnología:**
   * El contenedor `panel` tenía declarado `"React, repositorio sistema-admin"`, utilizando la ubicación del repositorio en vez de su tecnología de ejecución pura (`"React, Vite"`).

4. **Discrepancias entre el repositorio y el diagrama:**
   * **Servicio M2 (observación corregida por el equipo):** El Grupo 3 anotó que el `Servicio M2` del modelo no tenía ninguna llamada en el código, y el equipo lo retiró. Al comprobarlo de nuevo, la aplicación de estudiantes sí lo llama: `useReclamos.ts` hace un `POST` a `https://tefiis-m2.onrender.com/api/v1/m2/expedientes` al enviar cada reclamo. Por eso se restituyó al modelo, en el contexto y en los contenedores.
   * **Proveedores de correo y protocolo:** El código cuenta con una cadena de fallback (`Brevo -> Resend -> Mailjet`) por llamadas HTTPS seguras; el DSL original reducía esto a un solo proveedor con protocolo `HTTP` inexacto. Se debe modelar como `Proveedores de correo` con protocolo `JSON/HTTPS`.

### Respuesta del equipo y actualizaciones posteriores (Entrega 1 y Lab10)

* **Atención a la observación 2 del docente sobre la Entrega 1 (#14):** Se incorporaron en el Nivel 3 los componentes `Adaptadores de Persistencia` y `Bus de Eventos y Consumidor M2` para mostrar explícitamente los puertos (`RepositorioCursosResueltos`, `RepositorioReclamos`, `PublicadorEventos`, `ClienteM2`) y sus dos adaptadores intercambiables (`Supabase/HTTP` y `Memoria`), diferenciándolos de las rutas que aún permanecen en `server.js`.Asimismo, se corrigió el pie de la Figura 3.2 para reflejar que las dos aplicaciones web viven en carpetas del mismo repositorio (`sistema-reclamos/` y `sistema-admin/`, ADR-0005).
* **Evolución del Servicio M2 con el flujo por eventos (#27):** Con la implementación de `ReclamoRegistrado` en `backend/`, el envío a M2 pasa a ser responsabilidad de un consumidor de la API (`api -> m2` y `eventos -> m2`), rotulado como `(objetivo #27)` en el DSL hasta que el bus se conecte en `server.js` y se retire el `fetch` directo de `useReclamos.ts:935`.
