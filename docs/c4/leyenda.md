# Leyenda de Responsabilidades y Análisis – Modelo C4 (TEFIIS)

Este documento detalla la responsabilidad de cada componente y elemento modelado en los diagramas C4 del sistema TEFIIS en [workspace.dsl](workspace.dsl), junto con las decisiones de alcance, las observaciones arquitectónicas y las revisiones de cada nivel.

---

## 1. Nivel 1: Diagrama de Contexto (Sistema TEFIIS)

![Diagrama de Contexto](img/Contexto.svg)
*Leyenda generada:* [Contexto-key.svg](img/Contexto-key.svg)

### Qué muestra
TEFIIS como una sola caja negra de software central, los tres actores que interactúan con él a través de sus respectivos portales web (Estudiante UNI-FIIS, Miembro del tercio estudiantil y Administrador del sistema), y los cuatro servicios externos de los que depende: **Proveedores de correo** (con respaldo automático entre Brevo, Resend y Mailjet), **Gemini API** para el asistente inteligente Tefi (RAG), **Firebase Authentication** para la autenticación del panel administrativo y el **Servicio M2**, al que el sistema envía el expediente de cada reclamo registrado.

### Qué se decidió dejar afuera a propósito
* **La entrega física del correo al estudiante:** Se omitió la flecha de retorno desde los proveedores de correo hacia el estudiante (y la infraestructura de buzones como Gmail o correo institucional). El sistema cumple su responsabilidad entregando la petición a la API del proveedor de correo; modelar el rebote al estudiante generaba un ciclo visual innecesario en la vista de contexto.
* **Infraestructura de red y hosting:** No se detallan servidores de despliegue, DNS ni proxies reversos (Cloudflare Workers, Railway, Render), manteniendo el diagrama en un nivel puramente funcional y de negocio.

### Observación del equipo
> **Estrategia de respaldo en cascada y desacoplamiento por eventos:** Al modelar las dependencias externas, el equipo constató que Brevo **no constituye un punto único de falla ni carece de failover**: la función `sendEmail` (`backend/server.js:311-333`) implementa un mecanismo de respaldo automático en cascada que intenta el envío por `Brevo`, y si este falla (por cuotas agotadas o errores HTTP), conmuta automáticamente a `Resend`, y finalmente a `Mailjet`.
>
> Asimismo, el ejercicio de modelado permitió identificar y atender dos riesgos arquitectónicos en las integraciones externas:
> 1. **Aislamiento de efectos secundarios mediante `ReclamoRegistrado`:** Tanto la confirmación por correo al estudiante como el registro del expediente en el **Servicio M2** salen ahora como consumidores asíncronos del evento `ReclamoRegistrado` publicado por la API ([docs/api/eventos.md](../api/eventos.md)). Si los proveedores de correo o M2 fallan o demoran, el reclamo ya quedó persistido y el estudiante recibe su respuesta `200 OK` sin bloqueo.
> 2. **Timeouts en llamadas salientes:** El adaptador HTTP hacia el Servicio M2 (`crearClienteM2Http` en `backend/infraestructura/clienteM2.js`) incorpora `AbortSignal.timeout(10_000)` para cortar conexiones colgadas cuando el servicio externo en Render está dormido, y el experimento de resiliencia (Lab11) aborda el comportamiento ante respuestas lentas o fallidas de los proveedores.
>
> Por el contrario, **Google Gemini y Firebase Authentication sí representan puntos únicos de falla reales** para sus respectivas funciones (consultas a Tefi y acceso administrativo), ya que el sistema no dispone de un proveedor alternativo en caso de caída.

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
| **Servicio M2** | Sistema externo | Recibe desde la API el expediente de cada reclamo (ID, código, correo, nombre, motivo y descripción) cuando se publica el evento `ReclamoRegistrado`. |

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
> **Doble rol de Supabase, monorrepo con dos carpetas y centralización de M2 en la API:** El equipo destaca tres aspectos arquitectónicos del nivel de contenedores:
> 1. **Supabase en dos contenedores:** Opera como una base relacional transaccional (PostgreSQL vía PostgREST) y como un almacén de objetos para evidencias y PDFs oficiales (Storage mediante URLs firmadas temporales).
> 2. **Dos aplicaciones web en el mismo repositorio ([ADR-0005](../adr/0005-un-repositorio-con-dos-carpetas.md)):** El panel del Tercio (`sistema-admin/`) y el portal estudiantil (`sistema-reclamos/`) viven en carpetas del mismo repositorio y hablan con una única API.
> 3. **M2 ya no es llamado por la aplicación de estudiantes:** Antes el navegador llamaba directamente a M2 y a `/api/reclamos/confirmar` tras crear un reclamo. Ahora la `API TEFIIS` publica el evento `ReclamoRegistrado` al guardar el reclamo y es la propia API la que envía el expediente al `Servicio M2` y despacha el correo de confirmación, eliminando la llamada directa desde el frontend.

### Tabla de Responsabilidades – Nivel 2
| Contenedor | Tecnología | Responsabilidad (una línea) |
| :--- | :--- | :--- |
| **Aplicación de estudiantes** | React 19, TypeScript, Vite (`sistema-reclamos/`) | Proporciona la interfaz web para que el estudiante registre reclamos, adjunte evidencias, converse con Tefi y consulte el estado de sus expedientes. |
| **Panel del Tercio y Administración** | React, Vite (`sistema-admin/`) | Brinda la interfaz de gestión para que miembros del Tercio y administradores evalúen expedientes, asignen estados y resuelvan cursos. |
| **API TEFIIS** | Node.js 22, Express 5 | Centraliza las reglas de negocio, endpoints REST, validaciones de seguridad, publicación de `ReclamoRegistrado`, integración con IA y orquestación de servicios externos. |
| **Base de datos** | PostgreSQL en Supabase | Almacena y asegura de manera persistente las tablas de reclamos, respuestas, registros de auditoría, sesiones y configuraciones del sistema. |
| **Archivos** | Supabase Storage | Almacena los documentos PDF oficiales del SIGA y evidencias adjuntas por los estudiantes, sirviéndolos mediante URLs firmadas y seguras. |

---

## 3. Nivel 3: Diagrama de Componentes (API TEFIIS)

![Diagrama de Componentes](img/Componentes.svg)
*Leyenda generada:* [Componentes-key.svg](img/Componentes-key.svg)

### Qué muestra
El contenedor central (`API TEFIIS`) abierto en sus 8 componentes arquitectónicos: `Autenticación y Autorización`, `Gestión de Reclamos y Cursos` (casos de uso y dominio), `Adaptadores de Persistencia` (que implementa los puertos `RepositorioReclamos` y `RepositorioCursosResueltos` con sus adaptadores intercambiables en Supabase y en memoria), `Bus de Eventos y Consumidor M2` (que implementa `PublicadorEventos` y `ClienteM2` en HTTP y en memoria), `Notificaciones`, `Asistente Virtual Tefi (RAG)`, `Auditoría y Trazabilidad` y `Gestión de Documentos`.

### Qué se decidió dejar afuera a propósito
* **Funciones utilitarias sueltas como cajas individuales:** No se dibuja una caja por cada función auxiliar (como `sanearCursos`, `cursosValidos` o `emailTemplate`), agrupándolas en sus componentes arquitectónicos para respetar la regla C4 de 4 a 8 componentes por contenedor.
* **Configuraciones de transporte:** Se dejaron fuera los parsers de body JSON, cabeceras CORS, limitadores de tasa (`express-rate-limit`) y librerías utilitarias sin lógica de dominio.

### Observación del equipo
> **Puertos, adaptadores intercambiables y flujo por eventos `ReclamoRegistrado`:** A diferencia de la primera versión del diagrama —que solo mostraba seis fronteras lógicas dentro de `server.js`—, este nivel refleja la separación física real en `sistema-reclamos/backend/`:
> 1. **Puertos y dos adaptadores de persistencia:** `Componente de Gestión de Reclamos y Cursos` (`backend/presentacion`, `backend/aplicacion` y `backend/dominio`) no importa PostgREST; depende de los puertos `RepositorioCursosResueltos` y `RepositorioReclamos`, implementados en `Adaptadores de Persistencia` tanto para producción (`repositorioCursosSupabase.js`, `repositorioReclamosSupabase.js`) como en memoria para pruebas sin red (`repositorioCursosMemoria.js`, `repositorioReclamosMemoria.js`), vigilados en CI por la regla `dominio-limpio` de dependency-cruiser.
> 2. **Flujo por eventos (`ReclamoRegistrado`):** Al guardar un reclamo nuevo, el caso de uso `registrarReclamo` publica `ReclamoRegistrado` a través del puerto `PublicadorEventos` (`busEnProceso.js` en producción y `publicadorMemoria.js` en pruebas). Dos consumidores reaccionan de forma aislada y sin bloquear la respuesta HTTP al estudiante: `notificarReclamoRegistrado.js` (en `Notificaciones`) envía el correo de confirmación, y `enviarExpedienteAM2.js` (en `Bus de Eventos y Consumidor M2`) consulta el reclamo y envía el expediente al `Servicio M2` mediante el puerto `ClienteM2` (`crearClienteM2Http` / `crearClienteM2Memoria`).

### Tabla de Responsabilidades – Nivel 3
| Componente | Ubicación / Tipo | Responsabilidad (una línea) |
| :--- | :--- | :--- |
| **Componente de Autenticación y Autorización** | `server.js` (Middlewares `requireStudentAuth` y `requireAdminAuth`) | Valida JWT de estudiantes y tokens de Firebase, verifica listas de administradores autorizados y protege las rutas privadas de la API. |
| **Componente de Gestión de Reclamos y Cursos** | `backend/presentacion/`, `backend/aplicacion/` y `backend/dominio/` (y rutas aún en `server.js`) | Ejecuta las reglas de dominio y casos de uso: registra reclamos, publica `ReclamoRegistrado`, gestiona estados y resuelve cursos a través de puertos. |
| **Adaptadores de Persistencia** | `backend/infraestructura/` (`repositorioCursosSupabase`, `repositorioCursosMemoria`, `repositorioReclamosSupabase`, `repositorioReclamosMemoria`) | Implementa los puertos `RepositorioCursosResueltos` y `RepositorioReclamos` con dos adaptadores intercambiables: PostgREST en Supabase y almacenamiento en memoria. |
| **Bus de Eventos y Consumidor M2** | `backend/infraestructura/` (`busEnProceso`, `publicadorMemoria`, `clienteM2`) y `backend/aplicacion/consumidores/enviarExpedienteAM2.js` | Implementa el puerto `PublicadorEventos`, distribuye `ReclamoRegistrado` sin bloquear la petición y envía el expediente a M2 mediante el puerto `ClienteM2` (HTTP o Memoria). |
| **Componente de Notificaciones** | `backend/aplicacion/consumidores/notificarReclamoRegistrado.js` y `sendEmail` en `server.js` | Consume `ReclamoRegistrado` para enviar la confirmación del reclamo y despacha códigos y resoluciones con respaldo automático (`Brevo -> Resend -> Mailjet`). |
| **Componente de Asistente Virtual Tefi** | `promptTefi.js` y `server.js` | Procesa las consultas en lenguaje natural del estudiante consultando los reglamentos mediante búsqueda semántica (RAG) en Gemini. |
| **Componente de Auditoría y Trazabilidad** | `logActividad` en `server.js` | Registra de forma inmutable en `activity_log` cada acción administrativa, creación de reclamo y decisión de cursos. |
| **Componente de Gestión de Documentos** | `server.js` | Valida los archivos PDF del SIGA y evidencias adjuntas, gestionando su almacenamiento y URLs firmadas en Supabase Storage. |

---

## 4. Historial de Observaciones Subsanadas (Grupo 3 y Revisión Docente)

1. **Consolidación en componentes arquitectónicos (Grupo 3):** Se mantienen 8 componentes de nivel contenedor (entre 4 y 8), evitando dibujar archivos o funciones sueltas como clases UML.
2. **Verbo y protocolo en todas las relaciones (Grupo 3):** Cada flecha inicia con un verbo en tercera persona y declara entre corchetes su protocolo o puerto.
3. **Puertos y adaptadores intercambiables en el Nivel 3 (Observación docente Entrega 1):** Se incorporó explícitamente el componente `Adaptadores de Persistencia` con los dos adaptadores (`Supabase` y `Memoria`) detrás de los puertos del dominio, así como el `Bus de Eventos y Consumidor M2` con sus adaptadores (`busEnProceso` / `publicadorMemoria` y `crearClienteM2Http` / `crearClienteM2Memoria`).
4. **Flujo por eventos `ReclamoRegistrado` y centralización del Servicio M2 (Lab10 / Observación docente):** Se retiró la llamada directa `spa -> m2` y se modeló la publicación de `ReclamoRegistrado` en la API hacia los consumidores de correo y del Servicio M2 (`api -> m2` en Contenedores y `eventos -> m2` en Componentes). Además, se corrigió el pie de la Figura 3.2 para reflejar que ambas aplicaciones web conviven en carpetas del mismo repositorio (`sistema-reclamos/` y `sistema-admin/`).
