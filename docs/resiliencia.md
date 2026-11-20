# Patrón de resiliencia y experimento antes y después (Lab11 / E5)

Este documento describe el adaptador `crearEnviadorCorreo` con timeout por proveedor y URLs configurables sobre la cadena de respaldo existente (`Brevo -> Resend -> Mailjet`), su integración con los consumidores del evento `ReclamoRegistrado`, los riesgos y trade-offs del diseño y los resultados del experimento comparativo **antes y después** ejecutado con proveedores simulados locales.

---

## 1. Problema identificado

En la revisión del modelo C4 ([docs/c4/leyenda.md](c4/leyenda.md)) y en la formulación del escenario de confiabilidad **E5** ([docs/escenarios.md](escenarios.md#e5-confiabilidad-falla-del-proveedor-de-correo)), el equipo identificó tres debilidades en las llamadas salientes del sistema:

1. **Ausencia de timeout por proveedor en `sendEmail` (`backend/server.js:246-334`):**
   - La función `sendEmail` de `server.js` ya implementa el respaldo en cascada (`Brevo -> Resend -> Mailjet`). Cuando `Brevo` responde rápido con un error HTTP (`401` por clave inválida o `429` por cuota diaria agotada), el ciclo `for` captura la excepción y conmuta a `Resend`.
   - Sin embargo, las tres funciones (`sendViaBrevo`, `sendViaResend`, `sendViaMailjet`) ejecutan `fetch` **sin `AbortSignal.timeout`**. Si `Brevo` responde con alta latencia (*modo lento*), cada envío sufre toda la demora sin conmutar a `Resend`; y si `Brevo` deja la conexión abierta sin responder (*modo colgado*), la petición queda bloqueada indefinidamente y nunca pasa a `Resend`.
2. **URLs de proveedores escritas directamente en `server.js`:**
   - Las direcciones de `Brevo`, `Resend` y `Mailjet` estaban fijas en el código, impidiendo redirigir los envíos a un servidor falso en pruebas o en Docker Compose sin tocar producción ni gastar cuota real.
3. **Espera secuencial de la confirmación en la interfaz de estudiantes:**
   - En el flujo actual (`useReclamos.ts:898-946`), aunque `POST /api/reclamos` no espera al correo, la pantalla del estudiante espera el término de una segunda llamada (`POST /api/reclamos/confirmar`) antes de mostrar la etapa `'enviado'`, y luego ejecuta un `fetch` directo a `https://tefiis-m2.onrender.com/api/v1/m2/expedientes`.

---

## 2. Mecanismos implementados y sus trade-offs

### 2.1 `crearEnviadorCorreo` con Timeout por proveedor y URLs configurables (`enviadorCorreo.js`)

En [sistema-reclamos/backend/infraestructura/enviadorCorreo.js](../sistema-reclamos/backend/infraestructura/enviadorCorreo.js) se agregó `crearEnviadorCorreo` (que se activa en el servidor cuando se conecta en `backend/server.js` en reemplazo de `sendViaBrevo`, `sendViaResend`, `sendViaMailjet` y `sendEmail`):

- **Timeout por proveedor (`AbortSignal.timeout(timeoutMs)`):** Cada intento hacia `Brevo`, `Resend` o `Mailjet` lleva una señal de corte (por defecto `3 000 ms`, configurable por opciones o mediante `EMAIL_TIMEOUT_MS`; el valor `0` desactiva el timeout). Si el proveedor no responde dentro de ese límite, la petición se aborta con `TimeoutError`, se registra en `registrarError` y se conmuta al siguiente proveedor disponible.
- **URLs y credenciales leídas al momento del envío (`BREVO_API_URL`, `RESEND_API_URL`, `MAILJET_API_URL`):** Se consultan en cada envío desde las opciones inyectadas o desde `process.env` (sin inventar un `FROM_EMAIL` por defecto si falta la variable), de modo que no dependen del orden de carga de `dotenv` y permiten redirigir el tráfico a un proveedor simulado.
- **Doble de pruebas separado del código de producción:** El proveedor simulado (`crearProveedorCorreoSimulado`) vive en [sistema-reclamos/pruebas/proveedorCorreoSimulado.js](../sistema-reclamos/pruebas/proveedorCorreoSimulado.js), fuera de `backend/infraestructura/`.

### 2.2 Combinación con el flujo por eventos `ReclamoRegistrado` (#27)

Al combinarse con el flujo por eventos de [docs/api/eventos.md](api/eventos.md) (`registrarReclamo` + `busEnProceso`):

1. `POST /api/reclamos` guarda el reclamo, publica `ReclamoRegistrado` en `busEnProceso` y devuelve `200 OK` al estudiante sin esperar a los consumidores.
2. En segundo plano, `notificarReclamoRegistrado` envía el correo mediante `crearEnviadorCorreo` y `enviarExpedienteAM2` envía el expediente mediante `ClienteM2` (`crearClienteM2Http` con `AbortSignal.timeout(10_000)`). Si cualquiera de los dos falla o da timeout, el bus registra el error en `alFallar` sin afectar al estudiante ni al otro consumidor.

### 2.3 Riesgos y trade-offs conocidos

- **Entrega al menos una vez (*at-least-once*) y posibles correos duplicados:** Abortar la petición HTTP local con `AbortSignal.timeout` cuando vence el umbral corta la espera de nuestra API, pero no garantiza que el servidor remoto de `Brevo` no haya recibido ya la orden y termine enviando el correo segundos después. Si `Brevo` lo procesa tarde y además el fallback envía por `Resend`, el estudiante puede recibir dos correos de confirmación. Para códigos y confirmaciones de reclamo este trade-off es aceptable (es preferible un acuse duplicado ante lentitud extrema que dejar al estudiante bloqueado o sin confirmación).
- **Peor caso de latencia en serie (`3 × timeoutMs`):** Como los tres proveedores se intentan en serie, si `Brevo`, `Resend` y `Mailjet` estuvieran colgados simultáneamente, el envío agotaría hasta `3 × 3 000 ms = 9 000 ms` antes de fallar. Por ello es importante que en el registro de reclamos el envío corra en segundo plano detrás de `busEnProceso` y no dentro de la respuesta HTTP al estudiante.

---

## 3. Alcance de la medición: cuál de los dos caminos se midió hoy

> **Estado actual en `develop`:** Los módulos del flujo por eventos (#27) y `crearEnviadorCorreo` (#34) no modifican `backend/server.js`. Por tanto, hasta que quien integra el arranque compartido los conecte en `server.js` (y quite las llamadas de `useReclamos.ts`), el servidor levantado sigue usando el `sendEmail` original sin timeout, `POST /api/reclamos/confirmar` y el `fetch` del frontend a M2.

En [pruebas/experimento-resiliencia.js](../sistema-reclamos/pruebas/experimento-resiliencia.js) se midieron de forma explícita dos partes con `100` destinatarios (`estudiante-001@prueba.test` .. `estudiante-100@prueba.test`):

1. **Parte 1 (`crearEnviadorCorreo` con `crearProveedorCorreoSimulado`):** Evalúa 100 envíos sobre la cadena `Brevo -> Resend -> Mailjet` en cuatro modos de falla de `Brevo` (`401`, `429`, `lento` de 50 ms y `colgado` que nunca resuelve), comparando `timeoutMs: 0` (comportamiento actual de `sendEmail` en `server.js`) contra `timeoutMs: 10` (`crearEnviadorCorreo` con `AbortSignal.timeout`).
2. **Parte 2 (comparación indicativa en memoria del trámite de 100 reclamos):**
   - **Antes (espera secuencial de confirmación sin timeout):** Mide el tiempo de 100 confirmaciones en serie contra `Brevo` en modo `lento` (`40 ms`) sin timeout, representando la espera que hoy sufre la interfaz en `POST /api/reclamos/confirmar` (`useReclamos.ts:898`) antes de mostrar el reclamo como enviado.
   - **Después (flujo por eventos `ReclamoRegistrado` de #27 compuesto en proceso):** Ensambla directamente `crearRegistrarReclamoHandler` + `crearRegistrarReclamo` + `crearBusEnProceso` + `crearNotificadorDeReclamo` (con `crearEnviadorCorreo`, timeout `10 ms`) + `crearEnviadorDeExpediente` (con `crearClienteM2Memoria` o `crearClienteM2Http` caído con `502`), en memoria y sin latencia de base de datos, midiendo por separado el tiempo hasta devolver los 100 `200 OK` al estudiante y el tiempo total hasta vaciar los consumidores (`bus.vaciar()`).

### Cómo reproducir el experimento

```bash
cd sistema-reclamos
npm test
npm run arch:check
node pruebas/experimento-resiliencia.js
```

---

## 4. Resultados medidos: Antes vs. Después

### 4.1 Parte 1: Cadena de proveedores de correo (Escenario E5 — 100 envíos)

| Corrida | Modo de Brevo | Timeout por proveedor | Intentos a Brevo | Abortados por timeout | Intentos a Resend | Intentos a Mailjet | Aceptados por Brevo | Aceptados por Resend | Total entregados | Estado final | Duración total |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Antes** | `401` | Sin timeout | 100 | 0 | 100 | 0 | 0 | 100 | 100 / 100 | Completado | 2 ms |
| **2. Después** | `401` | 10 ms | 100 | 0 | 100 | 0 | 0 | 100 | 100 / 100 | Completado | 2 ms |
| **3. Antes** | `429` | Sin timeout | 100 | 0 | 100 | 0 | 0 | 100 | 100 / 100 | Completado | 1 ms |
| **4. Después** | `429` | 10 ms | 100 | 0 | 100 | 0 | 0 | 100 | 100 / 100 | Completado | 2 ms |
| **5. Antes** | `lento` (50 ms) | **Sin timeout** | 100 | **0** | **0** | 0 | **100 (tarde)** | **0** | 100 / 100 | Completado con alta latencia | **6 239 ms** |
| **6. Después** | `lento` (50 ms) | **10 ms** | 100 | **100** | **100** | 0 | **0** | **100** | 100 / 100 | Conmutado a Resend | **1 577 ms** |
| **7. Antes** | `colgado` ($\infty$) | **Sin timeout** | 1 | **0** | **0** | 0 | **0** | **0** | **0 / 100** | **Colgado en el 1.º envío** | **Bloqueado** (cortado por guardia a los 201 ms) |
| **8. Después** | `colgado` ($\infty$) | **10 ms** | 100 | **100** | **100** | 0 | **0** | **100** | **100 / 100** | Conmutado a Resend | **1 586 ms** |

**Lectura de la Tabla 4.1:**
- **Modos `401` y `429`:** Tanto antes como después se cumple la medida de E5 (`100` intentos a Brevo, `100` aceptados por Resend y `0` a Mailjet) porque el rechazo HTTP es inmediato.
- **Modo `lento` (50 ms):** Sin timeout (corrida 5), `Brevo` sí termina entregando los 100 correos (`aceptadosBrevo: 100`), pero nunca conmuta a `Resend` y acumula toda la latencia (`6 239 ms`). Con timeout de `10 ms` (corrida 6), `AbortSignal.timeout` aborta cada espera lenta en `Brevo` y `Resend` entrega los 100 correos en `1 577 ms`.
- **Modo `colgado` (promesa que no resuelve):** Es el caso que justifica el timeout. Sin timeout (corrida 7), el primer envío se queda esperando indefinidamente a `Brevo`, no conmuta nunca a `Resend` y se entregan `0` correos. Con timeout de `10 ms` (corrida 8), los 100 intentos a `Brevo` se abortan al vencer los `10 ms` y los `100` correos salen por `Resend`.

### 4.2 Parte 2: Registro de 100 reclamos (comparación indicativa en memoria)

| Métrica sobre 100 reclamos | Antes (espera en serie de confirmación con Brevo lento 40 ms sin timeout) | Después (flujo `ReclamoRegistrado` en proceso + Brevo lento 40 ms con timeout 10 ms + `crearClienteM2Memoria`) | Después con Brevo `colgado` y Servicio M2 caído (`502`) |
| :--- | :---: | :---: | :---: |
| **Respuestas `200 OK` al estudiante (`POST /api/reclamos`)** | 100 / 100 | **100 / 100** | **100 / 100** |
| **Tiempo de respuesta HTTP al estudiante (sin esperar consumidores)** | N/A (la UI espera `/api/reclamos/confirmar` antes de mostrar `'enviado'`) | **15 ms** (para los 100 reclamos en memoria) | **12 ms** (para los 100 reclamos en memoria) |
| **Tiempo total incluyendo consumidores (`bus.vaciar()`) / espera de confirmación** | **4 823 ms** (100 correos lentos en serie por Brevo) | **37 ms** (consumidores en paralelo tras abortar Brevo a los 10 ms) | **34 ms** (consumidores en paralelo tras abortar Brevo a los 10 ms) |
| **Eventos `ReclamoRegistrado` publicados (`publicadorMemoria`)** | 0 | **100** | **100** |
| **Proveedor que entrega los 100 correos** | Brevo (100 con demora, 0 conmutados a Resend) | **Resend (100 conmutados tras timeout)** | **Resend (100 conmutados tras timeout)** |
| **Expedientes registrados en M2 desde el backend** | 0 (dependía del `fetch` del navegador) | **100 / 100** (en `crearClienteM2Memoria`) | **0 / 100** (100 errores `502` aislados y registrados en el bus) |

---

## 5. Conexión en el arranque compartido (`server.js`)

Al integrar este adaptador en `backend/server.js`, se deben **eliminar** las funciones locales `sendViaBrevo`, `sendViaResend`, `sendViaMailjet` y `sendEmail` de `server.js` (para no dejar dos copias del envío de correo) y reemplazarlas por:

```js
import { crearEnviadorCorreo } from './infraestructura/enviadorCorreo.js';

const sendEmail = crearEnviadorCorreo({
  timeoutMs: process.env.EMAIL_TIMEOUT_MS !== undefined
    ? Number(process.env.EMAIL_TIMEOUT_MS)
    : 3000,
});
```
