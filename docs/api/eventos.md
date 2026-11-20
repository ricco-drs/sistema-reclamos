# Flujo por eventos: ReclamoRegistrado

Este documento describe el flujo por eventos del registro de reclamos (Lab10). El contrato HTTP del endpoint está en `docs/api/openapi.yaml`.

## Qué cambia

Hoy, cuando un estudiante registra un reclamo, la aplicación de estudiantes hace dos llamadas más por su cuenta: pide el correo de confirmación a `POST /api/reclamos/confirmar` y registra el expediente en el servicio M2 con un `fetch` directo. Si alguna falla, el estudiante no se entera y nadie reintenta.

Con el flujo por eventos, la API guarda el reclamo y publica un solo evento, `ReclamoRegistrado`. Dos consumidores reaccionan a él: el notificador de correo y el envío a M2. El endpoint no cambia para quien lo llama.

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

`POST /api/reclamos` conserva su ruta, su cuerpo y su respuesta. Solo se movió su lógica fuera de `server.js`.

| Código | Cuándo |
|---|---|
| 200 | Reclamo registrado: `{ success: true, id }`. Si es un reintento del mismo texto en 10 minutos: `{ success: true, id, duplicado: true }`. |
| 400 | Falta `categoria` o `descripcion`, o hay más de una prueba. |
| 401 | Sin sesión o sesión vencida. Lo responde `requireStudentAuth`, antes del manejador. |
| 403 | Una prueba (`evidencias`) no pertenece al estudiante. |
| 500 | Falla real de la base al insertar, o una excepción. |
| 503 | Tefi durmiendo, ciclo cerrado, ventana cerrada, o 10 choques de id seguidos. |

Dos detalles que el contrato debe reflejar tal como son:

- **Cursos.** `cursos_retirar` y `cursos_matricular` no devuelven 400 al pasarse de 30: se cortan en 30 y se descartan sin avisar los cursos o secciones que no están en el catálogo. El nombre del curso sale del catálogo, no del cliente.
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
    "categoria": "Cruce de horarios",
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

`motivoReclamo` es el texto de la categoría. No hay contrato escrito de M2; esto es lo que hace hoy `useReclamos.ts`. A diferencia de la aplicación, que solo deja un `console.warn`, el adaptador falla con error y corta a los 10 segundos, para que el bus lo registre.

## Puertos y adaptadores

| Puerto | Adaptador de producción | Adaptador para pruebas |
|---|---|---|
| `RepositorioReclamos` | `repositorioReclamosSupabase.js` (PostgREST) | `repositorioReclamosMemoria.js` |
| `PublicadorEventos` | `busEnProceso.js` | `publicadorMemoria.js` |
| `ClienteM2` | `clienteM2.js` → `crearClienteM2Http` | `clienteM2.js` → `crearClienteM2Memoria` |
| `PoliticaDeRecepcion` | `politicaDeRecepcion.js` (envuelve las tres comprobaciones de `server.js`) | una función que devuelve `null` o un mensaje |

Los puertos están descritos en `backend/dominio/puertosReclamos.js`. El dominio no conoce HTTP: sus errores llevan un `motivo`, y la traducción a 400, 403 o 503 vive en `presentacion/registrarReclamoHandler.js`.

## Conexión al arranque compartido (pendiente, `server.js`)

Esto lo hace quien modifica el arranque del backend. El punto de enganche es este:

```js
const bus = crearBusEnProceso({ alFallar: (ev, quien, err) => console.error(`${quien} falló en ${ev.eventoId}:`, err.message) });
const reclamos = crearRepositorioReclamosSupabase(sbRest);

bus.suscribir(RECLAMO_REGISTRADO, crearNotificadorDeReclamo({ componerCorreo: componerConfirmacion, enviarCorreo: sendEmail }), 'correo');
bus.suscribir(RECLAMO_REGISTRADO, crearEnviadorDeExpediente({
  reclamos, m2: crearClienteM2Http({ url: process.env.M2_URL }),
}), 'm2');

const registrarReclamo = crearRegistrarReclamo({
  reclamos, publicador: bus, catalogoCursos: CATALOGO_CURSOS, esEvidenciaPropia, logActividad,
  politica: crearPoliticaDeRecepcion({ tefiDurmiendoActivo, despedidaActivaPara, puedeEnviarReclamo }),
  registrarError: (mensaje, err) => console.error(mensaje, err?.message ?? ''),
});
app.post('/api/reclamos', requireStudentAuth, crearRegistrarReclamoHandler(registrarReclamo));
```

Falta extraer `componerConfirmacion({ id, nombre, categoria })` de `/api/reclamos/confirmar` (la plantilla HTML y `primerNombre`), para que el consumidor y la ruta antigua usen la misma.

**Cuidado al activarlo.** Mientras la aplicación de estudiantes siga llamando a `/api/reclamos/confirmar` y a M2, el estudiante recibiría dos correos y M2 dos expedientes. Hay que quitar esas dos llamadas de `useReclamos.ts` en el mismo cambio que conecta el bus. Hasta entonces, `/api/reclamos/confirmar` se mantiene.

## Pruebas

`backend/tests/registrarReclamo.test.js` cubre, sin base de datos ni credenciales:

- el registro y el evento publicado, sin descripción;
- reintentos, cursos fuera de catálogo, choques de id y secuencia caída;
- los errores 400, 403, 500 y 503, y que un fallo al publicar no deshace el reclamo;
- el bus: aislamiento entre consumidores y que `publicar` no espera;
- el flujo completo en memoria: un POST produce el correo y el expediente de M2;
- los adaptadores de PostgREST y de M2.

```bash
cd sistema-reclamos
npm test
npm run arch:check
```
