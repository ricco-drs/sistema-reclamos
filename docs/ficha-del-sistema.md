# Ficha del sistema

SW708 Arquitectura de Soluciones de Software, equipo 2. Opción A: el sistema del equipo.

## 1. Nombre

**TEFIIS**: sistema de gestión de reclamos estudiantiles de la FIIS, con el asistente Tefi.

## 2. Origen

Se desarrolló para el curso de Diseño de Software. El repositorio original empezó el 15/04/2026. La versión que usamos en este curso entró a este repositorio el 16/09/2026 (commit `9e1c20f`).

No es un prototipo: lo usan los estudiantes de la FIIS para sus reclamos de matrícula desde el ciclo 2026-II. Cuando se creó la secuencia que numera los reclamos, la numeración de 2026 ya iba en `REC-2026-0366`.

## 3. Quiénes lo hicieron

Del equipo actual:

| Integrante | Qué hizo antes de este curso |
|---|---|
| Rashuaman Sapallanay, Ricco Didier | Desarrollo principal de la API y de la aplicación de estudiantes, y despliegue. |
| Albino Soto, Christopher Henrry | Creó el repositorio original y la primera versión del chat con Tefi; documentación del módulo M3 (requisitos, atributos de calidad y bosquejo C4). |

Castro Aguirre, Lenin Giomar; Nuñez Villazana, Franz Pool, y Puris Ricaldi, Roy Farid, se suman en este curso.

## 4. Qué hace

El estudiante entra con su correo `@uni.pe`, sube sus documentos del SIGA y registra un reclamo de matrícula, que recibe un número `REC-2026-NNNN` y se sigue desde la misma aplicación.
El Tercio revisa los reclamos en un panel propio, cambia su estado, decide qué cursos-sección se matriculan o se retiran y responde al estudiante por correo.
Tefi, un asistente con IA, responde dudas sobre reglamentos y trámites buscando en los documentos oficiales de la facultad.

## 5. Lenguaje y stack

| Parte | Tecnología |
|---|---|
| API | JavaScript, Node.js 22 y Express 5. Desplegada en Railway. |
| Aplicación de estudiantes | TypeScript, React 19, Vite y Tailwind. Servida desde Cloudflare Workers. |
| Panel del Tercio | React, en la carpeta `sistema-admin/`. |
| Base de datos y archivos | PostgreSQL y Storage en Supabase. La API usa PostgREST. |
| Autenticación | JWT propio para estudiantes (código de 4 dígitos por correo) y Firebase Authentication para el panel. |
| Servicios externos | Gemini con File Search para Tefi; Brevo, Resend y Mailjet para el correo. |
| Construcción y pruebas | npm (`npm ci`), `node:test`, dependency-cruiser y GitHub Actions. |

## 6. Repositorio

https://github.com/ricco-drs/sistema-reclamos

El repositorio tiene dos carpetas: `sistema-reclamos/`, con la API y la aplicación de estudiantes, y `sistema-admin/`, con el panel del Tercio. La documentación está en `docs/`, en la raíz. [Confirmar que el profesor ya es colaborador.]

## 7. Tres reglas de negocio

1. **Solo se reciben reclamos con la ventana abierta.** El Tercio abre y cierra la ventana desde el panel. Con la ventana cerrada, la API rechaza el reclamo con 503, aunque alguien la llame sin pasar por la pantalla.
2. **Los cursos de un reclamo salen del catálogo.** Cada curso tiene que existir en el catálogo de cursos-sección y la sección tiene que pertenecerle. El nombre del curso lo pone el servidor, no el estudiante.
3. **`MATRICULADO` es un estado final.** Un reclamo pasa por seis estados (`PENDIENTE`, `EN_REVISION`, `ACEPTADO`, `ACEPTADO_PARCIALMENTE`, `RECHAZADO` y `MATRICULADO`). Una vez matriculado, ya no puede cambiar de estado: la API responde 409.

## 8. Cómo se levanta hoy

Sin credenciales solo corren las pruebas y la regla de arquitectura:

```bash
git clone https://github.com/ricco-drs/sistema-reclamos.git
cd sistema-reclamos/sistema-reclamos
npm ci
npm test && npm run arch:check
```

Para levantar el sistema completo hacen falta cuentas en cinco servicios:

1. Crear un `.env` dentro de `sistema-reclamos/` con `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `FIREBASE_SERVICE_ACCOUNT` (el JSON de la cuenta de servicio), `ADMIN_EMAILS`, `VITE_API_KEY` (Gemini), `FROM_EMAIL` y la clave de al menos un proveedor de correo (`BREVO_API_KEY`, `RESEND_API_KEY` o `MAILJET_API_KEY` con `MAILJET_SECRET_KEY`). Opcionales: `PORT`, `ALLOWED_ORIGINS`, `ADMIN_EMAILS_SOLO_LECTURA` y `VITE_API_URL`.
2. En el editor SQL de Supabase, ejecutar los scripts de `sql/`. Ojo: no crean las tablas base (`reclamos`, `documentos_estudiante`, `activity_log`, `app_settings`), que se crearon a mano en producción.
3. `npm run seed-rag` para subir a Gemini los PDF de `documentos_entrenamiento/`.
4. `npm run server` para la API (puerto 3005) y, en otra terminal, `npm run dev` para la aplicación (puerto 5173).

## 9. Qué le falta o le duele

- **Un solo archivo concentra la API.** `backend/server.js` tiene 2 351 líneas y 41 rutas, con HTTP, consultas, correo y reglas mezclados. Solo la rodaja de cursos resueltos está separada en capas.
- **Casi no hay pruebas.** Las 12 que existen son de la rodaja; la creación de reclamos, la autenticación y los cambios de estado no tienen ninguna.
- **No se puede levantar sin la nube.** No hay Docker y el esquema base no está en el repositorio, así que nadie puede correr el sistema completo sin las credenciales de producción.
- **Los códigos de verificación viven en la memoria del proceso.** Un reinicio de la API los borra, y con dos instancias el código pedido en una no sirve en la otra.
- **Fallas silenciosas.** La bandeja del panel no pagina y PostgREST corta en 1 000 filas; `logActividad` no espera ni reintenta; `sendEmail` no tiene timeout, así que un proveedor lento deja la petición colgada en lugar de pasar al siguiente.
- **Reglas que solo valida la interfaz.** El formato del código UNI no se comprueba en el servidor, y dos reenvíos simultáneos del mismo reclamo pueden crear dos reclamos.
