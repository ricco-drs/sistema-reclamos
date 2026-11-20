# Patrón de resiliencia y experimento antes y después (Lab11 / E5)

Este documento describe los mecanismos de resiliencia aplicados sobre las integraciones externas de la API TEFIIS (proveedores de correo y Servicio M2), así como el diseño y los resultados del experimento comparativo **antes y después** ejecutado con proveedores simulados locales.

---

## 1. Problema identificado

En la revisión del modelo C4 ([docs/c4/leyenda.md](c4/leyenda.md)) y en la formulación del escenario de confiabilidad **E5** ([docs/escenarios.md](escenarios.md#e5-confiabilidad-falla-del-proveedor-de-correo)), el equipo identificó tres debilidades en las llamadas salientes del sistema:

1. **Ausencia de timeout por proveedor en `sendEmail` (`backend/server.js:246-334`):**
   - La función `sendEmail` encadena tres proveedores (`Brevo -> Resend -> Mailjet`). Cuando `Brevo` responde de inmediato con un error HTTP (`401` por clave inválida o `429` por cuota diaria agotada), el ciclo `for` captura la excepción y conmuta a `Resend`.
   - Sin embargo, las tres funciones (`sendViaBrevo`, `sendViaResend`, `sendViaMailjet`) invocaban `fetch` **sin `AbortSignal.timeout`**. Si `Brevo` experimenta alta latencia o deja la conexión colgada (*modo lento*), la petición permanece bloqueada esperando a `Brevo` en lugar de abortar y pasar a `Resend`.
2. **URLs de proveedores escritas directamente en el código:**
   - Las direcciones de `Brevo`, `Resend` y `Mailjet` estaban fijas en `server.js`, impidiendo redirigir los envíos a un servidor falso en pruebas o en Docker Compose sin tocar producción ni gastar cuota real.
3. **Acoplamiento del registro de reclamos con efectos secundarios externos:**
   - Antes del flujo por eventos ([docs/api/eventos.md](api/eventos.md)), la aplicación de estudiantes tenía que hacer dos llamadas adicionales tras `POST /api/reclamos`: pedir el correo de confirmación (`POST /api/reclamos/confirmar`) y enviar el expediente directo a `https://tefiis-m2.onrender.com/api/v1/m2/expedientes`. Si M2 estaba dormido en Render o el proveedor de correo tardaba, el flujo del estudiante quedaba expuesto a la demora o a pérdidas silenciosas en el navegador.

---

## 2. Patrones de resiliencia aplicados

Se combinaron dos mecanismos complementarios:

### 2.1 Timeout + Fallback en cascada con URLs configurables (`enviadorCorreo.js`)

En [sistema-reclamos/backend/infraestructura/enviadorCorreo.js](../sistema-reclamos/backend/infraestructura/enviadorCorreo.js) se encapsuló el envío de correo en `crearEnviadorCorreo`:

- **Timeout por proveedor (`AbortSignal.timeout(timeoutMs)`):** Cada intento hacia `Brevo`, `Resend` o `Mailjet` lleva una señal de corte (por defecto `3 000 ms` en producción, parametrizable en pruebas). Si el proveedor primario no responde dentro de ese umbral, la petición se aborta con `TimeoutError`, se registra el incidente en `registrarError` y el ciclo conmuta de inmediato al siguiente proveedor disponible.
- **Fallback automático en cascada (`Brevo -> Resend -> Mailjet`):** Conserva el orden de prioridad y solo falla si todos los proveedores configurados fallan o agotan su tiempo límite (garantizando en `POST /api/admin/reclamos/:id/responder` que una respuesta del Tercio no se guarde como comunicada en `respuestas_reclamo` si ningún proveedor aceptó el correo).
- **URLs configurables por entorno o inyección (`BREVO_API_URL`, `RESEND_API_URL`, `MAILJET_API_URL`):** Permite apuntar la API a un proveedor simulado local o de Docker Compose sin cambiar código.

### 2.2 Desacoplamiento por eventos y aislamiento de consumidores (`ReclamoRegistrado`)

Tal como se detalla en [docs/api/eventos.md](api/eventos.md), al registrar un reclamo en `POST /api/reclamos`:

1. El caso de uso `registrarReclamo` guarda el reclamo en `RepositorioReclamos` y publica el evento `ReclamoRegistrado` en `PublicadorEventos` ([busEnProceso.js](../sistema-reclamos/backend/infraestructura/busEnProceso.js)).
2. `bus.publicar(evento)` despacha los consumidores en segundo plano **sin bloquear la respuesta HTTP `200 OK` al estudiante**.
3. Dos consumidores independientes procesan el evento con aislamiento de fallas (*Bulkhead* por consumidor):
   - **Consumidor de correo ([notificarReclamoRegistrado.js](../sistema-reclamos/backend/aplicacion/consumidores/notificarReclamoRegistrado.js)):** envía la confirmación a través de `crearEnviadorCorreo` (con Timeout + Fallback `Brevo -> Resend -> Mailjet`).
   - **Consumidor de M2 ([enviarExpedienteAM2.js](../sistema-reclamos/backend/aplicacion/consumidores/enviarExpedienteAM2.js)):** lee el reclamo y envía el expediente mediante el puerto `ClienteM2` ([clienteM2.js](../sistema-reclamos/backend/infraestructura/clienteM2.js), donde `crearClienteM2Http` aplica `AbortSignal.timeout(10_000)`). Si M2 falla o da timeout, el bus registra el error en `alFallar` sin afectar al estudiante ni al consumidor de correo.

```
POST /api/reclamos ──► registrarReclamo ──► 200 OK inmediato al estudiante
                             │
                             ▼ publica ReclamoRegistrado (busEnProceso)
              ┌──────────────┴──────────────┐
              ▼                             ▼
   notificarReclamoRegistrado      enviarExpedienteAM2
   (crearEnviadorCorreo:           (ClienteM2 con timeout 10 s
    Timeout + Fallback              o crearClienteM2Memoria;
    Brevo -> Resend -> Mailjet)     si falla, se aísla en el bus)
```

---

## 3. Diseño del experimento (proveedores simulados locales)

Para medir el comportamiento **antes y después** sin gastar cuota de proveedores reales ni tocar producción:

- **Destinatarios de prueba:** Se envían **100 peticiones** a correos distintos con el formato `estudiante-001@prueba.test` a `estudiante-100@prueba.test` (dominio reservado RFC 2606, compatible con `pruebas/generar-tokens.js` y `scripts/sembrar-reclamos.js`, evitando además chocar con el limitador `limiteEnvioCodigo` de 5 envíos por correo cada 15 minutos).
- **Proveedor simulado de correo (`crearProveedorCorreoSimulado` en [enviadorCorreo.js](../sistema-reclamos/backend/infraestructura/enviadorCorreo.js)):** Imita las tres APIs (`Brevo`, `Resend` y `Mailjet`), permite poner cada proveedor en modo `'ok'`, `'401'`, `'429'`, `'500'` o `'lento'`, respeta la señal de aborto `AbortSignal` y contabiliza las llamadas y abortos por proveedor (`conteos` y `abortadosPorTimeout`).
- **Adaptadores falsos de eventos y M2 ([publicadorMemoria.js](../sistema-reclamos/backend/infraestructura/publicadorMemoria.js) y `crearClienteM2Memoria` en [clienteM2.js](../sistema-reclamos/backend/infraestructura/clienteM2.js)):** Permiten inspeccionar los 100 eventos `ReclamoRegistrado` publicados y los 100 expedientes entregados a M2, así como inyectar respuestas `502 Bad Gateway` en `crearClienteM2Http` para comprobar el aislamiento de fallas.

### Cómo reproducir el experimento

Desde la carpeta `sistema-reclamos/`:

```bash
cd sistema-reclamos
npm test
node pruebas/experimento-resiliencia.js
```

---

## 4. Resultados medidos: Antes vs. Después

### 4.1 Parte 1: Cadena de proveedores de correo (Escenario E5 — 100 envíos)

En el experimento del modo `lento`, `Brevo` se configura con una demora de `50 ms` por envío y el timeout por proveedor del estado **Después** se fija en `10 ms` (a escala proporcional del timeout de `3 000 ms` de producción frente a un proveedor colgado):

| Corrida (100 envíos a `estudiante-NNN@prueba.test`) | Modo de Brevo | Timeout por proveedor | Intentos a Brevo | Abortados por timeout | Intentos a Resend | Intentos a Mailjet | Aceptados por Resend | Entregados a tiempo | Duración total (100 envíos) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Antes** | `401` (clave inválida) | Sin timeout | 100 | 0 | 100 | 0 | 100 | 100 / 100 | 1 ms |
| **2. Después** | `401` (clave inválida) | 10 ms | 100 | 0 | 100 | 0 | 100 | 100 / 100 | 2 ms |
| **3. Antes** | `429` (cuota agotada) | Sin timeout | 100 | 0 | 100 | 0 | 100 | 100 / 100 | 1 ms |
| **4. Después** | `429` (cuota agotada) | 10 ms | 100 | 0 | 100 | 0 | 100 | 100 / 100 | 1 ms |
| **5. Antes** | `lento` (50 ms) | **Sin timeout** | 100 | **0** | **0** | 0 | **0** | **0 / 100** | **6 223 ms** |
| **6. Después** | `lento` (50 ms) | **10 ms** | 100 | **100** | **100** | 0 | **100** | **100 / 100** | **1 573 ms** |

**Hallazgo comprobado:**
- Para `401` y `429`, tanto antes como después se cumple la medida de E5 (`100` intentos a Brevo, `100` aceptados por Resend y `0` a Mailjet) porque Brevo rechaza de inmediato.
- Para el modo **`lento`**, en el estado **Antes** `sendEmail` carece de timeout: ninguna de las 100 llamadas conmuta a `Resend` (`0` intentos a Resend) y las 100 peticiones quedan retenidas esperando a Brevo (`6 223 ms`). En el estado **Después**, `AbortSignal.timeout` corta cada intento lento en Brevo (`100` abortados por timeout) y conmuta automáticamente a `Resend`, que entrega los `100` correos dentro del umbral esperado.

### 4.2 Parte 2: Registro de 100 reclamos con consumidores por eventos (`ReclamoRegistrado`)

Comparación al registrar 100 reclamos cuando `Brevo` está en modo `lento` (`40 ms`) y `M2` recibe los expedientes por evento (o falla con `502`):

| Métrica sobre 100 reclamos registrados | Antes (sin bus de eventos ni timeout en correo) | Después (evento `ReclamoRegistrado` + Timeout/Fallback + `crearClienteM2Memoria`) | Después con Brevo en `429` y Servicio M2 caído (`502`) |
| :--- | :---: | :---: | :---: |
| **Respuestas HTTP `200 OK` al estudiante** | 100 / 100 | **100 / 100** | **100 / 100** |
| **Tiempo total de respuesta HTTP para los 100 estudiantes** | **4 679 ms** (bloqueado por correo lento) | **33 ms** (no espera a consumidores) | **< 35 ms** (no espera a consumidores) |
| **Eventos `ReclamoRegistrado` publicados (`publicadorMemoria`)** | 0 | **100** | **100** |
| **Correos conmutados y entregados por `Resend`** | **0 / 100** (retenidos en Brevo) | **100 / 100** | **100 / 100** |
| **Expedientes registrados en M2 (`crearClienteM2Memoria`)** | 0 en backend (llamada suelta desde navegador) | **100 / 100** | **0 / 100** (100 fallas aisladas y registradas en el bus) |

**Conclusión del experimento:**
1. El estudiante recibe la confirmación `200 OK` con su código `REC-2026-NNNN` en **33 ms** para los 100 reclamos (~0,33 ms por reclamo en memoria), sin verse afectado por la lentitud de Brevo ni por el estado del Servicio M2.
2. En segundo plano, el consumidor de correo aborta a Brevo por timeout y entrega los 100 correos por `Resend`, mientras que si el Servicio M2 cae (`502`), sus 100 fallas quedan registradas en el callback `alFallar` del bus sin cancelar el reclamo ni interferir con el envío del correo.

---

## 5. Conexión en el arranque compartido (`server.js`) y repetición en Compose

Para respetar la división de responsabilidades del equipo, este módulo no modifica `backend/server.js`. Quien integra el arranque compartido reemplaza la definición interna de `sendEmail` en `server.js` por:

```js
import { crearEnviadorCorreo } from './infraestructura/enviadorCorreo.js';

const sendEmail = crearEnviadorCorreo({
  timeoutMs: Number(process.env.EMAIL_TIMEOUT_MS || 3000),
});
```

Al integrar los PRs en el entorno de Docker Compose (Lab11), el mismo experimento se repite apuntando `BREVO_API_URL`, `RESEND_API_URL` y `MAILJET_API_URL` al contenedor del proveedor simulado.
