# Flujo por eventos: ReclamoRegistrado

El [contrato HTTP](openapi.yaml) describe el registro de reclamos.

## Qué cambia

La API guarda el reclamo y publica `ReclamoRegistrado` cuando el portal le delega los avisos. Un consumidor envía el correo de confirmación y otro envía el expediente a M2. El portal conserva las llamadas directas como respaldo durante la transición.

```
POST /api/reclamos
   │
   ▼
reclamos: presentacion/rutas.js y registrarReclamoHandler.js   (Express: HTTP ⇄ caso de uso)
   │
   ▼
reclamos: aplicacion/registrarReclamo.js                       (reglas del registro)
   │  guarda en RepositorioReclamos (puerto)
   │  publica en PublicadorEventos  (puerto)
   ▼
compartido: eventos/busEnProceso.js
   ├─► notificaciones: aplicacion/notificarReclamoRegistrado.js  → correo de confirmación
   └─► notificaciones: aplicacion/enviarExpedienteAM2.js          → POST a M2
```

Desde el #50, quien publica y quienes consumen viven en módulos distintos ([particiones](../particiones.md)): `reclamos` publica, `notificaciones` consume, y ninguno importa al otro. `server.js` los conecta.

## Endpoint

`POST /api/reclamos` conserva su ruta y su cuerpo. Desde el contrato acordado con el equipo consumidor (#61), la respuesta usa códigos HTTP precisos y todo error trae un `codigo` estable además del mensaje: `{ error, codigo }`.

| Código | `codigo` | Cuándo |
|---|---|---|
| 201 | | Reclamo creado: `{ success: true, id, estado: "PENDIENTE", creado_en, cursos_descartados }`, con la cabecera `Location: /api/reclamos/mine/{id}`. `creado_en` es la fecha que se guarda en la fila. |
| 200 | | Reenvío del mismo texto en 10 minutos: `{ success: true, id, duplicado: true, creado_en }`, con `Location`. `creado_en` es el del reclamo que ya existía. No guarda nada del segundo envío, así que no trae `estado` ni `cursos_descartados`. |
| 400 | `DATOS_INCOMPLETOS` | Falta `categoria` o `descripcion`. |
| 400 | `DESCRIPCION_DEMASIADO_LARGA` | La descripción pasa de 5 000 caracteres. |
| 400 | `CODIGO_UNI_INVALIDO` | `codigo_estudiante` no cumple `^\d{7,8}[A-Z]$` (se acepta en minúsculas y con espacios en los bordes; se guarda normalizado). |
| 400 | `DEMASIADAS_PRUEBAS` | Hay más de una evidencia. |
| 401 | `SESION_REQUERIDA` | Sin token. Lo responde `requireStudentAuth`, antes del manejador. |
| 401 | `SESION_INVALIDA` | Token vencido o falsificado. Igual que el anterior: el `codigo` lo agrega `requireStudentAuth`, y vale para todas las rutas del estudiante. |
| 403 | `PRUEBA_AJENA` | Una evidencia no pertenece al estudiante. |
| 403 | `DOCUMENTO_AJENO` | Una referencia de `documentos` (ficha, avance, boleta) no está en la carpeta del estudiante. |
| 409 | `CICLO_CERRADO` | El proceso de matrícula terminó. |
| 409 | `VENTANA_CERRADA` | La ventana de reclamos está cerrada. |
| 500 | `ERROR_INTERNO` | Falla real de la base al insertar, o una excepción. |
| 503 | `SISTEMA_EN_PAUSA` | Tefi está durmiendo. Sin `Retry-After`: no se sabe cuándo despierta. |
| 503 | `SIN_NUMERO_DISPONIBLE` | 10 choques de id seguidos. Con `Retry-After: 5`. |

(`CUERPO_INVALIDO`, para un JSON malformado, lo agrega el #40.)

**Orden de las comprobaciones:** sesión (401), pausa (503), ciclo y ventana (409) y después los campos, en este orden: categoría y descripción, largo de la descripción, código UNI, número de pruebas, prueba ajena y documento ajeno. Se responde el primer problema.

Detalles que el contrato debe reflejar tal como son:

- **Cursos.** `cursos_retirar` y `cursos_matricular` no devuelven 400 al pasarse de 30: se cortan en 30. Lo descartado se informa en `cursos_descartados` del 201, con `lista` (`retirar` o `matricular`, los nombres acordados con el equipo consumidor), `codigo`, `seccion` y `motivo`: `NO_EXISTE_EN_CATALOGO`, `SECCION_NO_PERTENECE` o `EXCEDE_LIMITE`. El nombre del curso sale del catálogo, no del cliente.
- **Reenvío.** Se reconoce solo por la descripción (misma descripción del mismo estudiante en los últimos 10 minutos), porque un estudiante puede mandar dos reclamos distintos seguidos.
- **Evidencias dentro de `documentos`.** Una clave `evidencias` que el cliente ponga dentro de `documentos` se ignora: solo valen las que llegan por el campo `evidencias`, que se revalidan.
- **Numeración.** El número `REC-AAAA-NNNN` sale de la secuencia de PostgreSQL (ADR-0003). Si la secuencia no responde, se numera con el método anterior (último id del año más uno).

## El evento

```json
{
  "eventoId": "REC-2026-0042:ReclamoRegistrado",
  "tipo": "ReclamoRegistrado",
  "version": 1,
  "ocurridoEn": "2026-11-21T15:04:05.000Z",
  "reclamo": {
    "id": "REC-2026-0042",
    "email": "ana.perez@uni.pe",
    "nombre": "PEREZ, ANA",
    "codigoEstudiante": "20240001A",
    "categoria": "Matrícula",
    "cursosRetirar": [{ "codigo": "SW708", "seccion": "U" }],
    "cursosMatricular": [],
    "tieneEvidencia": true
  }
}
```

| Campo | Significado |
|---|---|
| `eventoId` | Id del reclamo más el tipo. Un consumidor puede guardarlo para descartar repetidos. |
| `version` | Sube si cambia la forma del evento. |
| `categoria` | El texto de la categoría (la aplicación manda el rótulo, no un código). |
| `tieneEvidencia` | Solo dice si hay prueba adjunta; el PDF no viaja. |

El evento **no lleva la descripción**. Es texto libre del estudiante y no tiene por qué circular por el bus. El consumidor que la necesite (M2) lee el reclamo por id.

## Reglas del flujo

1. **Se publica después de guardar.** Si el reclamo no se guardó (400, 403, 500, 503), no hay evento.
2. **Un reintento no publica.** Si la respuesta es `duplicado: true`, el reclamo ya existía y su evento ya salió.
3. **Un consumidor que falla no deshace el reclamo ni la respuesta.** El error se registra con `registrarError` y el estudiante recibe su 200.
4. **Los consumidores no se esperan entre sí ni a la petición.** `publicar` devuelve sin esperar: un M2 dormido en Render no demora la respuesta al estudiante. Un consumidor que falla no afecta al otro.

## Consumidores

Los dos viven en el módulo `notificaciones` (#50), no en el que publica: no importan nada de `reclamos`, el nombre del evento se lo da `server.js` y de cada evento leen solo los campos que se indican abajo. `backend/tests/flujoReclamoRegistrado.test.js` comprueba que el evento de `reclamos` los trae.

**Notificador de correo.** Usa `id`, `email`, `nombre` y `categoria`. La plantilla y el envío se inyectan (`componerCorreo`, `enviarCorreo`); en producción son los de `/api/reclamos/confirmar` y `sendEmail`, con su cadena Brevo → Resend → Mailjet.

**Envío a M2.** Lee el reclamo por id, por el puerto `FuenteDeExpedientes` (lo implementa el repositorio de reclamos y se lo pasa `server.js`), y manda al servicio M2 el mismo cuerpo que hoy manda la aplicación:

```
POST {M2_URL}   (hoy https://tefiis-m2.onrender.com/api/v1/m2/expedientes)
Content-Type: application/json, sin Authorization
{ id, codigoEstudiante, email, nombre, motivoReclamo, descripcion }
```

`motivoReclamo` es el texto de la categoría. No hay contrato escrito de M2; esto es lo que hace hoy `useReclamos.ts`. A diferencia de la aplicación, que solo deja un `console.warn`, el adaptador falla con error para que el bus lo registre. Corta a los 10 segundos por defecto, pero `server.js` le da 60, porque M2 está en Render, que lo duerme cuando no tiene tráfico, y despertarlo tarda más de 25 segundos. El 20/11/2026 M2 no respondía: mientras siga así, cada reclamo deja un error en el registro, sin afectar al estudiante.

Hay dos diferencias con lo que manda hoy la aplicación:

- `codigoEstudiante` sale del reclamo guardado (el código UNI que escribió el estudiante). La aplicación manda el leído del SIGA. Casi siempre coinciden, pero no siempre.
- La URL ya no está escrita en el código: sale de `M2_URL` (ver más abajo).

## Puertos y adaptadores

| Puerto | Adaptador de producción | Adaptador para pruebas |
|---|---|---|
| `RepositorioReclamos` | `repositorioReclamosSupabase.js` (PostgREST) | `repositorioReclamosMemoria.js` |
| `PublicadorEventos` | `busEnProceso.js` | `publicadorMemoria.js` |
| `ClienteM2` | `clienteM2.js` → `crearClienteM2Http` | `clienteM2.js` → `crearClienteM2Memoria` |
| `FuenteDeExpedientes` | `obtenerParaExpediente` del repositorio de reclamos, que `server.js` le pasa a `notificaciones` | un objeto con `obtenerParaExpediente` |
| `PoliticaDeRecepcion` | `politicaDeRecepcion.js` (envuelve las tres comprobaciones de `server.js`) | una función que devuelve `null` o un mensaje |

Los puertos de `reclamos` están descritos en `backend/modulos/reclamos/dominio/puertosReclamos.js`, y los de `notificaciones` (`ClienteM2` y `FuenteDeExpedientes`), en `backend/modulos/notificaciones/dominio/puertos.js`. El dominio no conoce HTTP: sus errores llevan un `motivo`, y la traducción a 400, 403, 409 o 503 (con su `codigo`) vive en `presentacion/registrarReclamoHandler.js`, dentro del módulo `reclamos`.

## Conexión al arranque compartido (`server.js`)

Está conectado en `server.js` desde el #51, con los dos consumidores. Desde el #50, `server.js` arma los módulos y los conecta. El cliente de M2 espera hasta 60 segundos, y el segundo caso de uso de la transición, que se explica más abajo, vive dentro del módulo `reclamos`:

```js
const bus = crearBusEnProceso({ alFallar: (ev, quien, err) => console.error(`${quien} falló en ${ev.eventoId}:`, err.message) });

const reclamos = crearModuloReclamos({
  sbRest, publicador: bus, catalogoCursos: CATALOGO_CURSOS, esEvidenciaPropia, esDocumentoPropio, logActividad, registrarError,
  interruptores: { tefiDurmiendoActivo, despedidaActivaPara, puedeEnviarReclamo },
  exigirEstudiante: requireStudentAuth, exigirAdmin: requireAdminAuth,
});

const consumidores = crearConsumidoresDeReclamoRegistrado({
  enviarCorreo: sendEmail,
  fuenteDeExpedientes: reclamos.fuenteDeExpedientes,
  // Sin M2_URL (desarrollo y Compose) no se llama al M2 real: así la prueba E1 no le manda expedientes falsos.
  m2: process.env.M2_URL ? crearClienteM2Http({ url: process.env.M2_URL, timeoutMs: 60_000 }) : crearClienteM2Memoria(),
});
bus.suscribir(RECLAMO_REGISTRADO, consumidores.correo, 'correo');
bus.suscribir(RECLAMO_REGISTRADO, consumidores.m2, 'm2');

app.use(reclamos.rutas);
```

`componerConfirmacion({ id, nombre, categoria, email })` ya está extraída de `/api/reclamos/confirmar` en `backend/modulos/notificaciones/presentacion/componerConfirmacion.js` (la plantilla HTML y `primerNombre`). `email` es opcional: solo sirve para el saludo cuando `nombre` no trae el formato «APELLIDOS, NOMBRES». `server.js` la importa de `@tefiis/notificaciones`, y la ruta `/api/reclamos/confirmar` también la usa mientras exista, así que las dos mandan el mismo correo. `emailTemplate`, `escaparHtml` y las tres URL de imagen están en `backend/compartido/correo/plantillaCorreo.js`, y `server.js` ya no tiene su propia copia: el código de verificación y la respuesta del Tercio usan la misma plantilla.

**Transición entre el front anterior y el nuevo.** El front anterior envía él mismo el correo (`/api/reclamos/confirmar`) y el expediente a M2, y el nuevo (#46) se los deja a la API. La API (Railway) y el front (Cloudflare) se despliegan por separado, y un estudiante puede seguir con la página anterior abierta, así que durante un tiempo conviven los dos. Para que cada reclamo siga un solo camino:

1. **El front nuevo manda `"avisos": "api"`** en el cuerpo de `POST /api/reclamos`. Con ese campo, la API registra el reclamo, publica `ReclamoRegistrado` y responde con `"avisos": "api"`.
2. **Sin ese campo** (front anterior), la API registra el reclamo con un segundo caso de uso que no publica el evento, y el front envía el correo y el expediente como siempre.
3. **Si el front nuevo no recibe `"avisos": "api"`** en la respuesta, está hablando con una API anterior, y envía él mismo el correo y el expediente.

| | Front anterior | Front nuevo |
|---|---|---|
| **API anterior** | Envía el front | Envía el front (no recibió `avisos`) |
| **API nueva** | Envía el front (no pidió `avisos`) | Envía la API |

En los cuatro casos sale un correo y un expediente por reclamo, sin importar qué se despliega primero. El campo es opcional y la API anterior lo ignora, así que el cambio es compatible. Cuando ya no quede el front anterior, se quitan el caso de uso sin avisos, `/api/reclamos/confirmar` y el envío de respaldo del front.

`M2_URL` va definida en Railway. En Compose se deja vacía a propósito: el expediente queda en memoria y el servidor lo avisa al arrancar.

## Limitaciones conocidas

- **Sin reintentos.** Si un consumidor falla, el error se registra y no se vuelve a intentar. El estudiante no recibe el correo o M2 no recibe el expediente hasta que alguien lo detecte en los registros.
- **Se pierde lo que está en curso al reiniciar.** El bus vive en el proceso: si Railway reinicia el servicio (un despliegue, por ejemplo) mientras un consumidor trabaja, ese evento no se retoma. Resolverlo pide una cola o una tabla de eventos pendientes, y no está en este alcance.
- **Sin límite de envíos en la confirmación.** `/api/reclamos/confirmar` tenía `limiteEnvioCodigo`; con el evento, el correo sale sin ese límite. El riesgo es bajo porque el correo va al propio estudiante, pero consume cuota de los proveedores (escenario E5).

## Pruebas

Sin base de datos ni credenciales:

- `backend/modulos/reclamos/tests/registrarReclamo.test.js`: el registro y el evento publicado, sin descripción; reintentos, cursos fuera de catálogo, choques de id y secuencia caída; los errores 400, 403, 409, 500 y 503 con su `codigo`; que un fallo al publicar no deshace el reclamo; y el adaptador de PostgREST.
- `backend/modulos/reclamos/tests/modulo.test.js`: el módulo montado solo en un Express aparte, con sesiones falsas.
- `backend/modulos/notificaciones/tests/`: los dos consumidores y el cliente de M2, sin el módulo `reclamos`.
- `backend/compartido/tests/busEnProceso.test.js`: el bus, el aislamiento entre consumidores y que `publicar` no espera.
- `backend/tests/flujoReclamoRegistrado.test.js`: el contrato entre los dos módulos (el evento trae lo que lee `notificaciones`, y el repositorio de `reclamos` cumple su fuente de expedientes) y el flujo completo en memoria: un POST produce un solo correo y un solo expediente.

```bash
cd sistema-reclamos
npm test
npm run arch:check
```
