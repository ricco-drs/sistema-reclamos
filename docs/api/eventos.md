# Flujo por eventos: ReclamoRegistrado

Este documento describe el flujo por eventos del registro de reclamos (Lab10). El contrato HTTP del endpoint está en `docs/api/openapi.yaml`.

## Qué cambia

Hoy, cuando un estudiante registra un reclamo, la aplicación de estudiantes hace dos llamadas más por su cuenta: pide el correo de confirmación a `POST /api/reclamos/confirmar` y registra el expediente en el servicio M2 con un `fetch` directo. Si alguna falla, la aplicación solo deja un aviso en la consola del navegador, y esa llamada sale del navegador del estudiante, no de la API.

Con el flujo por eventos, la API guarda el reclamo y publica un solo evento, `ReclamoRegistrado`. Dos consumidores reaccionan a él: el notificador de correo y el envío a M2. El endpoint no cambia para quien lo llama. El flujo por eventos no reintenta (ver «Limitaciones conocidas»).

```
POST /api/reclamos
   │
   ▼
presentacion/registrarReclamoHandler.js   (Express: HTTP ⇄ caso de uso)
   │
   ▼
aplicacion/registrarReclamo.js            (reglas del registro)
   │  guarda en RepositorioReclamos (puerto)
   │  publica en PublicadorEventos  (puerto)
   ▼
infraestructura/busEnProceso.js
   ├─► aplicacion/consumidores/notificarReclamoRegistrado.js  → correo de confirmación
   └─► aplicacion/consumidores/enviarExpedienteAM2.js          → POST a M2
```

## Endpoint

`POST /api/reclamos` conserva su ruta y su cuerpo. Desde el contrato acordado con el equipo consumidor (#61), la respuesta usa códigos HTTP precisos y todo error trae un `codigo` estable además del mensaje: `{ error, codigo }`.

| Código | `codigo` | Cuándo |
|---|---|---|
| 201 | | Reclamo creado: `{ success: true, id, cursos_descartados }`, con la cabecera `Location: /api/reclamos/mine/{id}`. |
| 200 | | Reenvío del mismo texto en 10 minutos: `{ success: true, id, duplicado: true }`, con `Location`. No guarda nada del segundo envío, así que no trae `cursos_descartados`. |
| 400 | `DATOS_INCOMPLETOS` | Falta `categoria` o `descripcion`. |
| 400 | `DESCRIPCION_DEMASIADO_LARGA` | La descripción pasa de 5 000 caracteres. |
| 400 | `CODIGO_UNI_INVALIDO` | `codigo_estudiante` no cumple `^\d{7,8}[A-Z]$` (se acepta en minúsculas y con espacios en los bordes; se guarda normalizado). |
| 400 | `DEMASIADAS_PRUEBAS` | Hay más de una evidencia. |
| 401 | `SESION_REQUERIDA`, `SESION_INVALIDA` | Sin sesión o sesión vencida. Lo responde `requireStudentAuth`, antes del manejador. |
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

- **Cursos.** `cursos_retirar` y `cursos_matricular` no devuelven 400 al pasarse de 30: se cortan en 30. Lo descartado se informa en `cursos_descartados` del 201, con `lista` (`cursos_retirar` o `cursos_matricular`), `codigo`, `seccion` y `motivo`: `NO_EXISTE_EN_CATALOGO`, `SECCION_NO_PERTENECE` o `EXCEDE_LIMITE`. El nombre del curso sale del catálogo, no del cliente.
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

**Notificador de correo.** Usa `id`, `email`, `nombre` y `categoria`. La plantilla y el envío se inyectan (`componerCorreo`, `enviarCorreo`); en producción son los de `/api/reclamos/confirmar` y `sendEmail`, con su cadena Brevo → Resend → Mailjet.

**Envío a M2.** Lee el reclamo por id y manda al servicio M2 el mismo cuerpo que hoy manda la aplicación:

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
| `PoliticaDeRecepcion` | `politicaDeRecepcion.js` (envuelve las tres comprobaciones de `server.js`) | una función que devuelve `null` o un mensaje |

Los puertos están descritos en `backend/dominio/puertosReclamos.js`. El dominio no conoce HTTP: sus errores llevan un `motivo`, y la traducción a 400, 403, 409 o 503 (con su `codigo`) vive en `presentacion/registrarReclamoHandler.js`.

## Conexión al arranque compartido (`server.js`)

Está conectado en `server.js` desde el #51, con los dos consumidores. El enganche es este; en el código, el repositorio se llama `repositorioReclamos`, el cliente de M2 espera hasta 60 segundos y hay un segundo caso de uso para la transición, que se explica más abajo:

```js
const bus = crearBusEnProceso({ alFallar: (ev, quien, err) => console.error(`${quien} falló en ${ev.eventoId}:`, err.message) });
const reclamos = crearRepositorioReclamosSupabase(sbRest);

bus.suscribir(RECLAMO_REGISTRADO, crearNotificadorDeReclamo({ componerCorreo: componerConfirmacion, enviarCorreo: sendEmail }), 'correo');
bus.suscribir(RECLAMO_REGISTRADO, crearEnviadorDeExpediente({
  reclamos,
  // Sin M2_URL (desarrollo y Compose) no se llama al M2 real: así la prueba E1 no le manda expedientes falsos.
  m2: process.env.M2_URL ? crearClienteM2Http({ url: process.env.M2_URL }) : crearClienteM2Memoria(),
}), 'm2');

const registrarReclamo = crearRegistrarReclamo({
  reclamos, publicador: bus, catalogoCursos: CATALOGO_CURSOS, esEvidenciaPropia, logActividad,
  politica: crearPoliticaDeRecepcion({ tefiDurmiendoActivo, despedidaActivaPara, puedeEnviarReclamo }),
  registrarError: (mensaje, err) => console.error(mensaje, err?.message ?? ''),
});
app.post('/api/reclamos', requireStudentAuth, crearRegistrarReclamoHandler(registrarReclamo));
```

`componerConfirmacion({ id, nombre, categoria, email })` ya está extraída de `/api/reclamos/confirmar` en `backend/presentacion/componerConfirmacion.js` (la plantilla HTML y `primerNombre`). `email` es opcional: solo sirve para el saludo cuando `nombre` no trae el formato «APELLIDOS, NOMBRES». `server.js` la importa, y la ruta `/api/reclamos/confirmar` también la usa mientras exista, así que las dos mandan el mismo correo. `emailTemplate`, `escaparHtml` y las tres URL de imagen están en `backend/presentacion/plantillaCorreo.js`, y `server.js` ya no tiene su propia copia: el código de verificación y la respuesta del Tercio usan la misma plantilla.

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

`backend/tests/registrarReclamo.test.js` cubre, sin base de datos ni credenciales:

- el registro y el evento publicado, sin descripción;
- reintentos, cursos fuera de catálogo, choques de id y secuencia caída;
- los errores 400, 403, 409, 500 y 503 con su `codigo`, y que un fallo al publicar no deshace el reclamo;
- el bus: aislamiento entre consumidores y que `publicar` no espera;
- el flujo completo en memoria: un POST produce el correo y el expediente de M2;
- los adaptadores de PostgREST y de M2.

```bash
cd sistema-reclamos
npm test
npm run arch:check
```
