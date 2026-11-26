# Corridas «despues» de E2

Generado por `node carga/correr.mjs --etiqueta despues` el 2026-11-25T23:50:18.567Z.

- **Commit medido:** `ae01f19da77fe8472cdcf703125cb986e0375598` (rama `perf/77-carga-e2`).
- **Máquina:** 12th Gen Intel(R) Core(TM) i7-12700H, 20 núcleos lógicos, 15.6 GB, Windows_NT 10.0.26300.
- **Docker:** 29.9.3, 20 CPU y 7.6 GB asignados (Docker Desktop).
- **Carga:** `carga/escenario.js`, 10 usuarios virtuales durante 3 minutos con 1 s de pausa, dentro de la red de Compose.
- **Respuesta de la bandeja:** 1394 KB de PostgREST a la API por cada apertura, en 2.00 consultas.

## k6 y PostgREST

| Corrida | p95 (ms) | Mediana (ms) | Solicitudes/s | Errores | Faltantes (máx.) | PostgREST p95 (ms) | Base p95 (ms) |
|---|---|---|---|---|---|---|---|
| 1 (descartada) | 52.1 | 31.3 | 9.49 | 0.00 % | 0 | 14.0 | 11.8 |
| 2 | 38.3 | 29.8 | 9.56 | 0.00 % | 0 | 12.0 | 10.2 |
| 3 | 41.5 | 30.1 | 9.54 | 0.00 % | 0 | 12.0 | 10.7 |

«PostgREST» es lo que tardó PostgREST en cada consulta de la bandeja, medido por nginx (si la bandeja pide por páginas, cada página es una consulta); «Base» es la transacción en PostgreSQL, según PostgREST (`Server-Timing`).

## CPU de cada contenedor durante la carga (% medio / % máximo)

100 % es un núcleo entero.

| Corrida | api | rest | postgrest | db | firebase-auth | k6 |
|---|---|---|---|---|---|---|
| 1 | 19.4 / 62.5 | 2.6 / 9.8 | 4.3 / 12.4 | 13.2 / 32.7 | 4.0 / 56.1 | 25.4 / 63.2 |
| 2 | 20.2 / 39.6 | 2.3 / 4.6 | 3.7 / 6.8 | 12.6 / 20.2 | 3.2 / 14.4 | 24.2 / 35.1 |
| 3 | 20.8 / 39.5 | 2.3 / 6.0 | 3.9 / 6.2 | 12.8 / 21.5 | 3.2 / 13.6 | 24.8 / 37.1 |
