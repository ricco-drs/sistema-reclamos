# Corridas «antes» de E2

Generado por `node carga/correr.mjs --etiqueta antes` el 2026-11-25T23:18:54.120Z.

- **Commit medido:** `a3a73c2bf2a473c8b385546ddee47bea29b456fc` (rama `perf/77-carga-e2`).
- **Máquina:** 12th Gen Intel(R) Core(TM) i7-12700H, 20 núcleos lógicos, 15.6 GB, Windows_NT 10.0.26300.
- **Docker:** 29.9.3, 20 CPU y 7.6 GB asignados (Docker Desktop).
- **Carga:** `carga/escenario.js`, 10 usuarios virtuales durante 3 minutos con 1 s de pausa, dentro de la red de Compose.
- **Respuesta de la bandeja:** 930 KB.

## k6 y PostgREST

| Corrida | p95 (ms) | Mediana (ms) | Solicitudes/s | Errores | Faltantes (máx.) | PostgREST p95 (ms) | Base p95 (ms) |
|---|---|---|---|---|---|---|---|
| 1 (descartada) | 27.9 | 19.8 | 9.69 | 0.00 % | 500 | 13.0 | 11.0 |
| 2 | 28.1 | 20.1 | 9.68 | 0.00 % | 500 | 14.0 | 11.7 |
| 3 | 27.7 | 19.3 | 9.69 | 0.00 % | 500 | 13.0 | 11.2 |

«PostgREST» es lo que tardó PostgREST en responderle a la API, medido por nginx; «Base» es la transacción en PostgreSQL, según PostgREST (`Server-Timing`).

## CPU de cada contenedor durante la carga (% medio / % máximo)

100 % es un núcleo entero.

| Corrida | api | rest | postgrest | db | firebase-auth | k6 |
|---|---|---|---|---|---|---|
| 1 | 15.4 / 40.3 | 1.6 / 3.8 | 2.2 / 3.7 | 8.2 / 13.4 | 3.4 / 32.2 | 16.5 / 26.3 |
| 2 | 15.3 / 30.8 | 1.6 / 4.8 | 2.4 / 4.7 | 8.6 / 19.0 | 3.3 / 18.8 | 17.5 / 25.6 |
| 3 | 14.7 / 37.5 | 1.6 / 6.6 | 2.3 / 6.7 | 8.3 / 15.6 | 3.3 / 25.2 | 16.7 / 26.3 |
