# Patrón de resiliencia y experimento antes y después (Lab11 / E5)

Este documento describe el patrón de resiliencia aplicado en `@tefiis/compartido` (`crearEnviadorCorreo` con **Timeout** por proveedor y **Circuit Breaker** usando la librería `opossum` `^10.0.0` sobre la cadena `Brevo -> Resend -> Mailjet`), su integración con los consumidores del evento `ReclamoRegistrado`, la hipótesis experimental, los riesgos/trade-offs del diseño y los resultados del experimento comparativo **antes y después** con proveedores simulados en proceso y en Docker Compose.

---

## 1. Problema identificado

En la revisión del modelo C4 ([docs/c4/leyenda.md](c4/leyenda.md)) y en la formulación del escenario de confiabilidad **E5** ([docs/escenarios.md](escenarios.md#e5-confiabilidad-falla-del-proveedor-de-correo)), el equipo identificó tres debilidades en las llamadas salientes del sistema:

1. **Ausencia de timeout por proveedor en `sendEmail` original:**
   - La función `sendEmail` original ya implementaba respaldo en cascada (`Brevo -> Resend -> Mailjet`). Cuando `Brevo` respondía rápido con `401` o `429`, conmutaba a `Resend`.
   - Sin embargo, ejecutaba `fetch` **sin `AbortSignal.timeout`**. Si `Brevo` respondía lento (*modo lento*), cada envío sufría toda la demora sin conmutar; y si dejaba la conexión abierta (*modo colgado*), la petición quedaba bloqueada indefinidamente.
2. **Ausencia de Circuit Breaker ante fallas sostenidas de un proveedor:**
   - Incluso con timeout por petición, si `Brevo` entra en degradación sostenida (caído o lento), **cada nuevo envío** vuelve a intentar contra `Brevo` y paga el costo completo del timeout (`N × timeoutMs`) antes de conmutar a `Resend`.
3. **URLs de proveedores fijas y espera secuencial en el frontend anterior:**
   - Las URLs estaban escritas en el código (impidiendo probar contra simuladores en Compose sin gastar cuota real) y el frontend esperaba `/api/reclamos/confirmar` y hacía un `fetch` directo a M2 antes de la integración del bus en `#58` y `#46`.

---

## 2. Hipótesis del experimento (Lab11, paso 5)

En las corridas iniciales (`A`–`D`), la hipótesis y los resultados se subieron en el mismo commit (`445c536` / `5d65ab7`), por lo que el historial de Git no demuestra por sí solo que la hipótesis se hubiera escrito antes de provocar la falla.

> **Hipótesis general (corridas A–D):** Cuando el proveedor principal (`Brevo`) entra en degradación sostenida (latencia mayor a `EMAIL_TIMEOUT_MS` o conexión colgada) y el servicio `M2` falla con `502`:
> 1. **Sin timeout ni circuit breaker (antes):** los envíos en modo `lento` acumulan toda la demora en `Brevo` sin conmutar a `Resend`, y en modo `colgado` el proceso queda bloqueado con `0 / 100` entregas.
> 2. **Con timeout (`AbortSignal.timeout`) pero sin circuit breaker:** el sistema corta cada intento lento/colgado en `Brevo` y entrega `100 / 100` correos por `Resend`, pero sigue haciendo `100` intentos desperdiciados contra `Brevo` (pagando `~100 × timeoutMs`).
> 3. **Con timeout + Circuit Breaker (`opossum`, `volumeThreshold = 3`, `errorThresholdPercentage = 50`, `rollingCountTimeout = 60 000 ms`) + bus de eventos `ReclamoRegistrado` (después):** una vez alcanzado el volumen mínimo de `3` intentos dentro de la ventana deslizante de `60 s` y superado el `50 %` de fallos del proveedor (excluyendo errores `400` y `422` atribuibles a la petición/destinatario mediante `errorFilter`), el circuito de `opossum` para `Brevo` pasa a estado `open`; los siguientes envíos dentro de la ventana fallan rápido en memoria sin tocar la red de `Brevo` y salen directo por `Resend`, reduciendo los intentos desperdiciados a `Brevo` a `3` (incluso con tráfico espaciado de 1 reclamo cada 6 s), mientras `POST /api/reclamos` mantiene `100 %` de respuestas `201 Created` sin verse afectado por `Brevo` ni por `M2 (502)`.

Para cumplir estrictamente con el registro previo en el historial antes de ejecutar la prueba, formulamos y publicamos por adelantado (en un comentario de la issue #33 y en un commit previo separado) la siguiente hipótesis para una **nueva corrida en Docker Compose (Corrida E — Recuperación del circuito cuando Brevo vuelve)**:

> **Hipótesis previa de la Corrida E (recuperación `open -> halfOpen -> close` en Docker Compose):**
> En un mismo contenedor `api-1` levantado con `EMAIL_TIMEOUT_MS=500`, `EMAIL_CB_ENABLED=true`, `EMAIL_CB_VOLUME_THRESHOLD=3`, `EMAIL_CB_RESET_MS=5000` y `EMAIL_CB_WINDOW_MS=60000`:
> 1. **Fase 1 (falla sostenida de Brevo: `BREVO_MODO=lento` de `2 000 ms`, `M2_MODO=502`, 5 reclamos espaciados `600 ms`):** los primeros `3` reclamos intentarán `Brevo`, sufrirán timeout a los `500 ms` y abrirán el circuito (`[EMAIL][CB] Circuito de Brevo pasó a estado: open`). Los reclamos 4 y 5 omitirán `Brevo`, resultando en **`intentosCorreo.brevo = 3`**, **`intentosCorreo.resend = 5`**, **`aceptadosCorreo.resend = 5`** y `5 / 5` respuestas `201 Created`.
> 2. **Fase 2 (recuperación de Brevo sin reiniciar `api-1`: se recrea únicamente el contenedor `simuladores` con `--no-deps` en `BREVO_MODO=ok` y `M2_MODO=ok`, se esperan `6 s > EMAIL_CB_RESET_MS=5000` y se envían 5 reclamos nuevos espaciados `600 ms`):** al cumplirse `EMAIL_CB_RESET_MS`, el circuito de `Brevo` en `api-1` pasará a **`halfOpen`** (`[EMAIL][CB] Circuito de Brevo pasó a estado: halfOpen`), probará el primer correo de la Fase 2 contra `Brevo`, recibirá `200 OK` y cerrará el circuito (`[EMAIL][CB] Circuito de Brevo pasó a estado: close`). En consecuencia, los `5` reclamos de la Fase 2 serán aceptados directamente por `Brevo` (**`intentosCorreo.brevo = 5`**, **`intentosCorreo.resend = 0`**, **`aceptadosCorreo.brevo = 5`** y `5 / 5` expedientes en M2 con código `200`).

---

## 3. Mecanismos implementados y sus trade-offs

### 3.1 `crearEnviadorCorreo` con Timeout y Circuit Breaker (`opossum`)

En [sistema-reclamos/backend/compartido/correo/enviadorCorreo.js](../sistema-reclamos/backend/compartido/correo/enviadorCorreo.js) (`@tefiis/compartido`, dependencia `opossum` `^10.0.0` declarada en `backend/compartido/package.json`) se combinan tres defensas:

- **Timeout por proveedor (`AbortSignal.timeout(timeoutMs)`):** Cada intento hacia `Brevo`, `Resend` o `Mailjet` lleva señal de corte (por defecto `3 000 ms`, configurable con `EMAIL_TIMEOUT_MS`; `0` desactiva el timeout).
- **Circuit Breaker por proveedor con `opossum`:** Cada proveedor cuenta con su propio `CircuitBreaker` (`correo-brevo`, `correo-resend`, `correo-mailjet`), activo por defecto y configurable por opciones o variables de entorno:
  - `EMAIL_CB_ENABLED` (`true` por defecto; `false` o `0` lo desactiva para comparar antes/después).
  - `EMAIL_CB_VOLUME_THRESHOLD` (`3` por defecto: mínimo de intentos dentro de la ventana deslizante antes de evaluar el porcentaje de error).
  - `EMAIL_CB_ERROR_THRESHOLD` (`50` % por defecto: porcentaje de error dentro de la ventana que abre el circuito).
  - `EMAIL_CB_WINDOW_MS` (`60 000` ms por defecto: duración de la ventana deslizante `rollingCountTimeout` con `10` cubetas, ampliada desde los `10 s` por defecto de `opossum` para que el circuito también abra ante tráfico espaciado, como 1 reclamo cada 6 s o 15 s).
  - `EMAIL_CB_RESET_MS` (`30 000` ms por defecto: tiempo antes de probar recuperación en `halfOpen`).
  - **Filtro de errores de cliente (`errorFilter`):** Los errores HTTP `400` y `422` (atribuibles a una dirección de correo mal formada o datos de la petición, y no a caída del proveedor) devuelven `true` en `errorFilter`, por lo que `opossum` **no los cuenta como fallo del proveedor**. Así, varios intentos con una dirección rechazada no abren los circuitos ni bloquean el correo para direcciones válidas. Los timeouts, `401`, `429` y `5xx` sí cuentan para abrir el circuito.
  - Cuando el circuito está `open`, `opossum` rechaza de inmediato con `EOPENBREAKER` sin ejecutar `fetch` y `sendEmail` pasa al siguiente proveedor de la cascada. Además, `sendEmail.estadoCircuitos()` expone el estado de los tres circuitos (`closed` / `open` / `halfOpen` / `disabled`) y `sendEmail.cerrar()` libera los temporizadores al finalizar pruebas.
- **URLs configurables (`BREVO_API_URL`, `RESEND_API_URL`, `MAILJET_API_URL`):** Permiten redirigir los envíos a los simuladores HTTP en pruebas unitarias y en Docker Compose (`compose.eventos.yaml`).

### 3.2 Combinación con el flujo por eventos `ReclamoRegistrado`

Conectado en `backend/server.js` (`#58`) y consumido por el frontend con `"avisos": "api"` (`#46`):

1. `POST /api/reclamos` guarda el reclamo en PostgreSQL, publica `ReclamoRegistrado` en `busEnProceso` y responde `201 Created` con cabecera `Location` sin esperar a correo ni a M2.
2. En segundo plano, los dos consumidores de `@tefiis/notificaciones` actúan aislados: `notificarReclamoRegistrado` usa `crearEnviadorCorreo` (timeout + `opossum` + cascada) y `enviarExpedienteAM2` usa `crearClienteM2Http` (timeout `60 000 ms` en producción por el arranque en frío de Render, o `crearClienteM2Memoria` si no hay `M2_URL`).

### 3.3 Riesgos y trade-offs conocidos

- **Entrega al menos una vez (*at-least-once*):** Abortar un `fetch` por timeout no garantiza que `Brevo` no haya recibido la solicitud antes de cortar la conexión, por lo que podría haber un correo duplicado si `Brevo` responde tarde y `Resend` también entrega. Para confirmaciones de reclamo esto es preferible a bloquear o perder la confirmación.
- **Estado del circuito en memoria por instancia:** `opossum` mantiene el estado del circuito en memoria del proceso Node. En TEFIIS corre una sola instancia de la API en Railway, por lo que es suficiente; si en el futuro se escalara a múltiples réplicas, cada instancia abriría su circuito de forma independiente.
- **Tráfico muy disperso fuera de `EMAIL_CB_WINDOW_MS`:** Como `opossum` decide por porcentaje de error dentro de la ventana deslizante (`60 s` por defecto), si llegaran menos de `3` correos en un lapso de `60 s`, el conteo de la ventana caducaría antes de alcanzar `volumeThreshold` y cada envío volvería a probar `Brevo` (quedando protegido por el timeout de `3 s`).
- **Ventana de `resetTimeout`:** Mientras el circuito de `Brevo` permanece abierto (`30 s` por defecto), el tráfico va por `Resend` aunque `Brevo` se haya recuperado segundos antes, consumiendo cuota de `Resend` hasta el intento de prueba en `halfOpen`.

---

## 4. Resultados medidos en proceso (Antes vs. Solo Timeout vs. Timeout + Circuit Breaker `opossum`)

### Cómo reproducir

```bash
cd sistema-reclamos
npm test
node pruebas/experimento-resiliencia.js
```

### 4.1 Parte 1: Cadena de proveedores de correo (Escenario E5 — 100 envíos)

| Corrida | Modo de Brevo | Timeout | Circuit Breaker (`opossum`) | Intentos a Brevo | Abortados por timeout | Intentos a Resend | Aceptados por Resend | Total entregados | Duración total |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1. Antes** | `401` | Sin timeout | `disabled` | 100 | 0 | 100 | 100 | 100 / 100 | 1 ms |
| **2. Solo timeout** | `401` | 10 ms | `disabled` | 100 | 0 | 100 | 100 | 100 / 100 | 1 ms |
| **3. Antes** | `429` | Sin timeout | `disabled` | 100 | 0 | 100 | 100 | 100 / 100 | 1 ms |
| **4. Solo timeout** | `429` | 10 ms | `disabled` | 100 | 0 | 100 | 100 | 100 / 100 | 1 ms |
| **5. Antes** | `lento` (50 ms) | Sin timeout | `disabled` | 100 | 0 | 0 | 0 (100 tarde en Brevo) | 100 / 100 | **6 241 ms** |
| **6. Solo timeout** | `lento` (50 ms) | 10 ms | `disabled` | 100 | 100 | 100 | 100 | 100 / 100 | **1 577 ms** |
| **7. Antes** | `colgado` ($\infty$) | Sin timeout | `disabled` | 1 | 0 | 0 | 0 | **0 / 100 (Colgado)** | Bloqueado (220 ms guardia) |
| **8. Solo timeout** | `colgado` ($\infty$) | 10 ms | `disabled` | 100 | 100 | 100 | 100 | 100 / 100 | **1 557 ms** |
| **9. Después (Timeout + CB)** | `lento` (50 ms) | 10 ms | **`open` (`volumeThreshold: 3`)** | **3** | **3** | 100 | **100** | **100 / 100** | **65 ms** |
| **10. Después (Timeout + CB)** | `colgado` ($\infty$) | 10 ms | **`open` (`volumeThreshold: 3`)** | **3** | **3** | 100 | **100** | **100 / 100** | **58 ms** |

**Validación de la hipótesis (Parte 1):**
- La hipótesis se **confirma**: con `opossum` (corridas 9 y 10), una vez alcanzados los `3` timeouts en `Brevo` dentro de la ventana deslizante (`100 % >= 50 %`), el circuito se abre (`open`) y los `97` envíos restantes van directo a `Resend` sin tocar `Brevo`, bajando los intentos a `Brevo` de `100` a `3` y reduciendo el tiempo total de `6 241 ms` (antes) / `1 577 ms` (solo timeout) a **`65 ms`** en modo lento y **`58 ms`** en modo colgado.
- En `backend/tests/resiliencia.test.js` (100 pruebas totales del backend en verde) se verifican además:
  1. La recuperación automática (`open -> halfOpen -> closed`) cuando `Brevo` vuelve a responder `200` después de `resetTimeout`.
  2. El filtro `errorFilter`: `3` envíos rechazados con `400`/`422` por una dirección inválida dejan los tres circuitos en `closed` y el siguiente envío a una dirección válida sale por `Brevo`.
  3. El efecto de `rollingCountTimeout` (`EMAIL_CB_WINDOW_MS = 60 000 ms`) frente a tráfico espaciado.

### 4.2 Parte 2: Registro de 100 reclamos por eventos (comparación en memoria)

| Métrica sobre 100 reclamos | Antes (espera en serie sin timeout ni bus) | Después (bus `ReclamoRegistrado` + timeout 10 ms + `opossum` + `crearClienteM2Memoria`) | Después con Brevo `colgado` y M2 caído (`502`) |
| :--- | :---: | :---: | :---: |
| **Respuestas `201 Created` al estudiante (`POST /api/reclamos`)** | 100 / 100 | **100 / 100** | **100 / 100** |
| **Tiempo de respuesta HTTP al estudiante** | N/A (UI bloqueada esperando `/confirmar`) | **32 ms** | **30 ms** |
| **Tiempo total incluyendo consumidores (`bus.vaciar()`)** | **4 695 ms** | **69 ms** | **66 ms** |
| **Correos entregados por Resend** | 0 (100 tarde por Brevo) | **100 / 100** | **100 / 100** |
| **Expedientes M2 / fallas aisladas en bus** | 0 | 100 / 100 en M2 memoria | 100 fallas `502` aisladas en bus |

---

## 5. Conexión en el arranque compartido (`server.js`)

Conectado en `backend/server.js` (`#58`):

```js
import { crearEnviadorCorreo } from '@tefiis/compartido';

const sendEmail = crearEnviadorCorreo({
  timeoutMs: tiempoLimiteCorreoMs(), // EMAIL_TIMEOUT_MS o 3000 ms por defecto; CB opossum activo por defecto
});
```

---

## 6. Registro real con simuladores en Docker Compose

La [configuración adicional de Compose](../compose.eventos.yaml) conecta la API a simuladores HTTP de Brevo, Resend, Mailjet y M2 sin publicar puertos para ellos. PostgreSQL, PostgREST y `POST /api/reclamos` son los del entorno de Lab11. El simulador guarda en memoria los intentos y sus resultados, que se pueden consultar en `/eventos` desde la red del proyecto.

### 6.1 Comprobación funcional e instrucciones de los simuladores (`probar-eventos-compose.mjs`)

Ejecuta ambos comandos desde la raíz del repositorio:

```bash
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml up --build --detach --wait
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-eventos-compose.mjs
```

La prueba usa una sesión sintética y la misma opción `avisos: "api"` que envía el portal desde el #46. Comprueba el `201`, el encabezado `Location`, una confirmación aceptada, el contenido del expediente y que reenviar la misma solicitud devuelve `200` con el mismo ID sin volver a notificar.

Para cambiar la respuesta de un proveedor, configura `BREVO_MODO`, `RESEND_MODO` o `MAILJET_MODO` en el entorno de Compose o en el `.env` de la raíz. Cada uno acepta `ok`, `401`, `429`, `500` y `lento`. La demora de `lento` se controla con `DEMORA_CORREO_MS`. Para simular una falla de M2, define `M2_MODO=502`. El circuit breaker se parametriza con `EMAIL_CB_ENABLED` (`true` por defecto), `EMAIL_CB_VOLUME_THRESHOLD` (`3`), `EMAIL_CB_ERROR_THRESHOLD` (`50`), `EMAIL_CB_RESET_MS` (`30000`) y `EMAIL_CB_WINDOW_MS` (`60000`).

El siguiente ejemplo reproduce el respaldo a Resend cuando Brevo demora más que el timeout y M2 responde `502`. Aplica los valores siguientes y vuelve a ejecutar el comando `up`:

```dotenv
BREVO_MODO=lento
DEMORA_CORREO_MS=2000
EMAIL_TIMEOUT_MS=500
M2_MODO=502
```

```bash
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-eventos-compose.mjs resend 502
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml logs api
```

Para comparar el timeout con el mismo proveedor lento, usa `EMAIL_TIMEOUT_MS=0` y espera un correo aceptado por `brevo`. Vuelve a aplicar cada configuración con `up` antes de ejecutar el guion. Los argumentos de `probar-eventos-compose.mjs` son el proveedor que debe aceptar la confirmación (`brevo`, `resend` o `mailjet`) y el estado esperado de M2 (`200` o `502`). Sus valores predeterminados son `brevo 200`.

### 6.2 Experimento comparativo Antes vs. Después en Compose (`probar-resiliencia-compose.mjs`)

Ejecutado sobre Docker Engine `29.5.3` / Docker Compose `v5.1.4` en la rama `feat/33-circuit-breaker-y-compose` (commits probados: [`445c536`](https://github.com/ricco-drs/sistema-reclamos/commit/445c536) para las corridas A–C con espaciado de `600 ms`, y la revisión con `EMAIL_CB_WINDOW_MS=60000` y `opossum` `^10.0.0` sobre la base `f885512` para la corrida D con 1 reclamo cada `6 000 ms`), enviando reclamos reales a `POST /api/reclamos` (`avisos: "api"`) con `BREVO_MODO=lento`, `DEMORA_CORREO_MS=2000` y `M2_MODO=502`.

Los argumentos de `probar-resiliencia-compose.mjs` son: `[cantidad=10] [proveedorEsperado=resend] [codigoM2=502] [espaciadoMs=600]`.

**Comandos ejecutados:**

```bash
# Corrida A — Antes (10 reclamos cada 600 ms, sin timeout ni Circuit Breaker)
BREVO_MODO=lento DEMORA_CORREO_MS=2000 EMAIL_TIMEOUT_MS=0 EMAIL_CB_ENABLED=false M2_MODO=502 \
  docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml up --build --detach --wait
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-resiliencia-compose.mjs 10 brevo 502 600

# Corrida B — Solo timeout (10 reclamos cada 600 ms, sin Circuit Breaker)
BREVO_MODO=lento DEMORA_CORREO_MS=2000 EMAIL_TIMEOUT_MS=500 EMAIL_CB_ENABLED=false M2_MODO=502 \
  docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml up --detach --wait
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-resiliencia-compose.mjs 10 resend 502 600

# Corrida C — Después (10 reclamos cada 600 ms, Timeout 500 ms + Circuit Breaker opossum)
BREVO_MODO=lento DEMORA_CORREO_MS=2000 EMAIL_TIMEOUT_MS=500 EMAIL_CB_ENABLED=true EMAIL_CB_VOLUME_THRESHOLD=3 M2_MODO=502 \
  docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml up --detach --wait
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-resiliencia-compose.mjs 10 resend 502 600

# Corrida D — Tráfico espaciado: 1 reclamo cada 6 segundos (8 reclamos, EMAIL_CB_WINDOW_MS=60000)
BREVO_MODO=lento DEMORA_CORREO_MS=2000 EMAIL_TIMEOUT_MS=500 EMAIL_CB_ENABLED=true EMAIL_CB_VOLUME_THRESHOLD=3 EMAIL_CB_WINDOW_MS=60000 M2_MODO=502 \
  docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml up --build --detach --wait
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-resiliencia-compose.mjs 8 resend 502 6000
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml logs api --tail=40

# Limpieza
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml down
```

**Evidencia medida en Docker Compose (`PostgreSQL` + `PostgREST` + `server.js` + simuladores HTTP):**

| Corrida en Compose | Lote | Reclamos / espaciado | `EMAIL_TIMEOUT_MS` | `EMAIL_CB_ENABLED` / ventana | Respuestas `201` | Intentos Brevo | Intentos Resend | Correos aceptados | Expedientes M2 (`502`) | Duración HTTP | Duración total | Cola tras último POST (`Total - HTTP`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **A. Antes (sin timeout ni CB)** | `5a6d29e8` | 10 (cada 600 ms) | `0` | `false` | 10 / 10 | **10** | 0 | 10 Brevo (tarde) | 10 aislados | 5 777 ms | 7 823 ms | **2 046 ms** |
| **B. Solo timeout** | `e43ad057` | 10 (cada 600 ms) | `500` | `false` | 10 / 10 | **10** | 10 | 10 Resend | 10 aislados | 5 645 ms | 6 165 ms | **520 ms** |
| **C. Después (Timeout + CB `opossum`)** | `3c4676ab` | 10 (cada 600 ms) | `500` | `true` (`threshold: 3`, `60 s`) | **10 / 10** | **3** | 10 | **10 Resend** | 10 aislados | 5 761 ms | 5 767 ms | **6 ms** |
| **D. Después con 1 reclamo cada 6 s** | `a02fdb11` | 8 (cada 6 000 ms) | `500` | `true` (`threshold: 3`, `60 s`) | **8 / 8** | **3** | 8 | **8 Resend** | 8 aislados | 42 244 ms | 42 252 ms | **8 ms** |

**Extracto real de logs de `api-1` en Compose (apertura del circuito `opossum`):**

```text
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Brevo excedió el tiempo límite de 500 ms
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Brevo excedió el tiempo límite de 500 ms
api-1  | [EMAIL][CB] Circuito de Brevo pasó a estado: open
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Brevo excedió el tiempo límite de 500 ms
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Circuito abierto para Brevo: se omite el intento y se pasa al respaldo
api-1  | [EVENTOS] m2 falló en REC-2026-0024:ReclamoRegistrado: M2 respondió 502 al registrar REC-2026-0024
```

**Conclusión en Compose (Corridas A–D):** Se confirma el comportamiento esperado tanto con ráfagas (1 reclamo cada `600 ms`, Corrida C) como con tráfico espaciado (1 reclamo cada `6 s`, Corrida D). En ambos casos, tras los `3` primeros timeouts dentro de la ventana deslizante de `60 s`, `opossum` abre el circuito de `Brevo`, omite los intentos restantes contra `Brevo`, entrega el `100 %` de confirmaciones por `Resend` y reduce la cola posterior al último `POST` de `2 046 ms` (antes) / `520 ms` (solo timeout) a **`6–8 ms`**.

### 6.3 Corrida E — Recuperación del circuito en Docker Compose cuando Brevo vuelve (`open -> halfOpen -> close`)

**Procedimiento diseñado antes de ejecutar la corrida:**

```bash
# Fase 1: Brevo lento (2 000 ms) con timeout 500 ms y resetTimeout de 5 000 ms (5 reclamos)
BREVO_MODO=lento DEMORA_CORREO_MS=2000 EMAIL_TIMEOUT_MS=500 EMAIL_CB_ENABLED=true EMAIL_CB_VOLUME_THRESHOLD=3 EMAIL_CB_RESET_MS=5000 EMAIL_CB_WINDOW_MS=60000 M2_MODO=502 \
  docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml up --build --detach --wait
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-resiliencia-compose.mjs 5 resend 502 600

# Fase 2: Brevo y M2 vuelven a 'ok' recreando solo 'simuladores' (--no-deps) sin reiniciar 'api-1'
BREVO_MODO=ok M2_MODO=ok \
  docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml up --detach --no-deps --force-recreate simuladores
# Se esperan 6 s (> EMAIL_CB_RESET_MS=5000) y se envían 5 reclamos nuevos esperando entrega por Brevo
sleep 6
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml exec -T api node scripts/probar-resiliencia-compose.mjs 5 brevo 200 600
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml logs api --tail=40
docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml down
```

*Resultados medidos de la Corrida E (ejecutada sobre el commit [`cfa4c6e`](https://github.com/ricco-drs/sistema-reclamos/commit/cfa4c6e) después de publicar la hipótesis previa en [#33 (comentario)](https://github.com/ricco-drs/sistema-reclamos/issues/33#issuecomment-7152252722)):*

| Fase de la Corrida E | Lote | Estado de Brevo / M2 | Respuestas `201` | Intentos Brevo | Intentos Resend | Correos aceptados | Expedientes M2 | Duración HTTP (5 POST) | Duración total | Cola tras último POST |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Fase 1 (falla y apertura `open`)** | `2bda0926` | Brevo `lento` (`2 000 ms`), M2 `502` | **5 / 5** | **3** | **5** | **5 Resend** (`0` Brevo) | 5 (`502` aislados) | 2 601 ms | 2 607 ms | **6 ms** |
| **Fase 2 (recuperación `halfOpen -> close`)** | `5cccc38f` | Brevo `ok`, M2 `ok` (tras `6 s > resetTimeout 5 000 ms`) | **5 / 5** | **5** | **0** | **5 Brevo** (`0` Resend) | 5 (`200 OK`) | 2 510 ms | 2 516 ms | **6 ms** |

**Extracto real de logs de `api-1` en la Corrida E (ciclo completo `open -> halfOpen -> close`):**

```text
api-1  | [EVENTOS] m2 falló en REC-2026-0039:ReclamoRegistrado: M2 respondió 502 al registrar REC-2026-0039
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Brevo excedió el tiempo límite de 500 ms
api-1  | [EVENTOS] m2 falló en REC-2026-0040:ReclamoRegistrado: M2 respondió 502 al registrar REC-2026-0040
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Brevo excedió el tiempo límite de 500 ms
api-1  | [EVENTOS] m2 falló en REC-2026-0041:ReclamoRegistrado: M2 respondió 502 al registrar REC-2026-0041
api-1  | [EMAIL][CB] Circuito de Brevo pasó a estado: open
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Brevo excedió el tiempo límite de 500 ms
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Circuito abierto para Brevo: se omite el intento y se pasa al respaldo
api-1  | [EVENTOS] m2 falló en REC-2026-0042:ReclamoRegistrado: M2 respondió 502 al registrar REC-2026-0042
api-1  | [EMAIL] Brevo falló, probando el siguiente proveedor: Circuito abierto para Brevo: se omite el intento y se pasa al respaldo
api-1  | [EVENTOS] m2 falló en REC-2026-0043:ReclamoRegistrado: M2 respondió 502 al registrar REC-2026-0043
api-1  | [EMAIL][CB] Circuito de Brevo pasó a estado: halfOpen
api-1  | [EMAIL][CB] Circuito de Brevo pasó a estado: close
```

**Validación de la hipótesis previa (Corrida E):** Los valores medidos coinciden exactamente con las predicciones publicadas antes de ejecutar la prueba (`brevo: 3, resend: 5` en la Fase 1 y `brevo: 5, resend: 0` en la Fase 2, con las transiciones `open -> halfOpen -> close` registradas en `api-1`).

Al terminar, detén el entorno con `docker compose -p tefiis-eventos -f compose.yaml -f compose.eventos.yaml down`. El volumen local queda disponible para repetir la prueba, que genera un correo sintético diferente en cada ejecución. La [evidencia de la prueba funcional](evidencias/lab10-bus-conectado.txt) incluye además la ejecución funcional de 1 reclamo con ambos servicios sanos y con timeout de Brevo y fallo de M2 (`d2977e1`).
