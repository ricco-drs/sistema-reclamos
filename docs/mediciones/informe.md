# Informe de medición: E2, bandeja del panel del Tercio

Lab12. La hipótesis está en [`hipotesis.md`](https://github.com/ricco-drs/sistema-reclamos/blob/d06db90bc0c425839ad9d8100922f4ec86d58cfa/docs/mediciones/hipotesis.md) y entró a `main` antes del script y de cualquier medición (#80). Este informe reúne la línea base (#77), el diagnóstico y la única mejora aplicada (#78), y la segunda medición con la decisión final (#79).

## Escenario, carga y umbral

Tomados de E2 en [`docs/escenarios.md`](../escenarios.md), sin cambios.

- **Escenario:** hasta 10 miembros del Tercio abren o recargan a la vez la bandeja de reclamos (`GET /api/admin/reclamos`).
- **Carga:** 10 usuarios virtuales durante 3 minutos. Cada uno recarga como máximo una vez por segundo (`sleep(1)`), así que el throughput no puede pasar de 10 solicitudes por segundo: es la carga de E2, no la capacidad del sistema.
- **Umbral:** p95 menor a 1,5 s y 0 reclamos faltantes. En cada respuesta, k6 cuenta los `id` distintos y los compara con `count(*)` de la tabla, que pide directo a PostgREST y no a la API medida.

## Cómo se midió

| Qué | Valor |
|---|---|
| Script | [`carga/escenario.js`](../../carga/escenario.js), con k6 1.8.2 (imagen `grafana/k6:1.8.2`) dentro de la red de Compose |
| Entorno | Compose del Lab11 (`compose.yaml`) más [`carga/compose.yaml`](../../carga/compose.yaml): la sesión de admin con el emulador de Firebase y los tiempos de PostgREST. La API, PostgreSQL 16, PostgREST y nginx no cambian. |
| Datos | Base vacía (`down --volumes`), con los 1 500 reclamos de `scripts/sembrar-reclamos.js` (REC-2026-1001 a REC-2026-2500, 1,5 MB de tabla) |
| Commit medido | Antes: `a3a73c2` (`develop` con el #74, sin cambios en el código). Después: `ae01f19` (única mejora: lectura paginada de la bandeja en #78) |
| Máquina | Intel Core i7-12700H (20 hilos), 15,6 GB, Windows 11. Docker Desktop 29.9.3 con 20 CPU y 7,6 GB asignados |
| Comando | `node carga/correr.mjs --etiqueta antes` y `node carga/correr.mjs --etiqueta despues` (pasos en [`carga/README.md`](../../carga/README.md)) |
| Cuándo | 25 de noviembre de 2026 (hora de Lima): tres corridas «antes» de 18:18 a 18:28 y tres corridas «después» de 18:50 a 18:59 |
| Datos crudos | [`corridas/`](corridas/): `{antes,despues}-<n>-k6.*`, `{antes,despues}-<n>-docker-stats.csv`, `{antes,despues}-<n>-postgrest.csv`, `{antes,despues}-entorno.json` y `{antes,despues}-resumen.md` |

## Antes: línea base

| Corrida | p95 | Mediana | Solicitudes/s | Errores HTTP | Reclamos faltantes |
|---|---|---|---|---|---|
| 1 (descartada, en frío) | 27,9 ms | 19,8 ms | 9,69 | 0 % | 500 en cada respuesta |
| 2 | **28,1 ms** | 20,1 ms | **9,68** | **0 %** | **500** en las 1 750 respuestas |
| 3 | **27,7 ms** | 19,3 ms | **9,69** | **0 %** | **500** en las 1 750 respuestas |

Las corridas 2 y 3 difieren en 0,4 ms de p95, así que la línea base es estable.

**E2 no se cumple.** La latencia cumple de sobra: 28 ms contra 1 500 ms. Pero ninguna de las 3 500 respuestas trae todos los reclamos: la bandeja lista 1 000 de 1 500. Faltan los 500 más antiguos, de REC-2026-1001 a REC-2026-1500, porque la bandeja ordena del más nuevo al más antiguo y llega hasta REC-2026-1501.

## Dónde está el cuello de botella

Datos de las corridas 2 y 3, más un `EXPLAIN ANALYZE` hecho después de las corridas.

**Por qué faltan reclamos.** La ruta ([`modulos/reclamos/presentacion/rutas.js`](../../sistema-reclamos/backend/modulos/reclamos/presentacion/rutas.js), `GET /api/admin/reclamos`) pide `sbRest('/reclamos?select=*&order=created_at.desc')` en una sola petición, sin paginar. PostgREST devuelve como máximo `PGRST_DB_MAX_ROWS` = 1 000 filas y corta el resto sin error. En nginx cada respuesta de PostgREST a la bandeja mide 929 502 bytes, siempre los mismos: el tamaño de 1 000 filas.

**Dónde se va el tiempo de cada petición:**

| Tramo | Mediana | p95 | Fuente |
|---|---|---|---|
| Petición completa, vista por k6 | 19,7 ms | 27,9 ms | k6 |
| PostgREST, base incluida | 10 ms | 13 a 14 ms | nginx (`$upstream_response_time`) |
| Transacción en PostgreSQL | 8,7 ms | 11,2 a 11,7 ms | PostgREST (`Server-Timing`) |
| La API: verificar la sesión, decodificar los 930 KB y volver a codificarlos | ≈ 10 ms | — | Diferencia entre las medianas de k6 y PostgREST |

Los p95 de distintos tramos no se restan entre sí; las medianas sí, aproximadamente.

**La consulta no es lo que cuesta; lo que cuesta es convertir las filas en JSON.** Con el `EXPLAIN ANALYZE` de la consulta que arma PostgREST:

| Qué | Tiempo |
|---|---|
| Leer los 1 500 reclamos, ordenarlos por fecha y quedarse con 1 000 (`Seq Scan` + `Sort`) | 1,3 ms |
| Lo mismo, convertido a JSON (`json_agg`), como lo pide PostgREST | 6,7 ms |

Cuatro quintos del tiempo de la base se van en armar el JSON. El índice por fecha no haría diferencia: ordenar 1 500 filas en memoria tarda 1 ms.

**Ningún contenedor está saturado.** CPU media y máxima durante las corridas 2 y 3, donde 100 % es un núcleo:

| api | rest (nginx) | postgrest | db | firebase-auth | k6 |
|---|---|---|---|---|---|
| 15 % / 38 % | 1,6 % / 7 % | 2,4 % / 7 % | 8,5 % / 19 % | 3,3 % / 25 % | 17 % / 26 % |

La API usa como máximo 158 MiB de memoria y la base 93 MiB. Durante las tres corridas, nginx avisó 44 veces que guardó en disco una respuesta de PostgREST, por no caber en sus búferes. Fueron 44 de 5 250 peticiones, menos del 1 %.

**Conclusión del diagnóstico.** Con la carga de E2 ningún recurso limita la latencia: cada petición cuesta unos 20 ms, repartidos casi por mitades entre armar 930 KB de JSON en PostgreSQL y PostgREST y volver a procesarlos en la API. Lo que hace fallar a E2 es el componente que dijo la hipótesis, la consulta sin paginar de la bandeja, pero por el corte de 1 000 filas y no por la latencia.

## Contraste con la hipótesis (#76)

| Lo que dijimos antes de medir | Lo que se midió | |
|---|---|---|
| El límite es la consulta sin paginar de la bandeja | Es lo que hace fallar a E2: devuelve 1 000 de 1 500 | Acertamos |
| Van a faltar los 500 más antiguos y E2 va a fallar por eso, aunque cumpla la latencia | Faltan 500 (REC-2026-1001 a 1500) en el 100 % de las respuestas; la latencia cumple | Acertamos |
| p95 de 200 ms | p95 de 28 ms | Nos equivocamos por unas 7 veces: supusimos «unas decenas de milisegundos» en cada tramo y cada uno tarda unos 10 ms |
| El costo está en el tamaño de la respuesta, no en la consulta | La consulta, 1,3 ms; con el JSON, 6,7 ms; la API, unos 10 ms más | Acertamos |
| Unas 9 solicitudes por segundo y 0 % de errores | 9,68 solicitudes por segundo y 0 % | Acertamos |
| Nos equivocaríamos si la bandeja trajera los 1 500, si el p95 pasara de 1,5 s o si el `EXPLAIN ANALYZE` mostrara que la consulta sola se lleva la mayor parte | No pasó ninguna de las tres | La hipótesis se sostiene |

## La mejora aplicada (#78) y segunda medición (#79)

En el commit `ae01f19` se aplicó una sola mejora en [`modulos/reclamos/presentacion/rutas.js`](../../sistema-reclamos/backend/modulos/reclamos/presentacion/rutas.js): `GET /api/admin/reclamos` pasó de `sbRest('/reclamos?select=*&order=created_at.desc')` a `sbRestTodo('/reclamos?select=*&order=created_at.desc,id.desc')`. `sbRestTodo` recorre PostgREST por páginas de 1 000 filas mediante `Range` hasta completar la tabla (2,00 consultas y 1 394 KB en total por cada apertura de bandeja con 1 500 reclamos), y `id.desc` desempata el orden para que filas con el mismo `created_at` no se repitan ni se salten entre páginas.

Al repetir las tres corridas sobre `ae01f19` en la misma máquina, con los mismos 1 500 reclamos y el mismo `carga/escenario.js` ([`corridas/despues-resumen.md`](corridas/despues-resumen.md)):

| Corrida | p95 | Mediana | Solicitudes/s | Errores HTTP | Reclamos faltantes |
|---|---|---|---|---|---|
| 1 (descartada, en frío) | 52,1 ms | 31,3 ms | 9,49 | 0 % | 0 en cada respuesta |
| 2 | **38,3 ms** | 29,8 ms | **9,56** | **0 %** | **0** en las 1 730 respuestas |
| 3 | **41,5 ms** | 30,1 ms | **9,54** | **0 %** | **0** en las 1 726 respuestas |

En cada una de las 2 consultas, una por página, PostgREST respondió con un p95 de 12,0 ms (transacción en PostgreSQL: 10,2 y 10,7 ms p95). La CPU de los contenedores siguió holgada durante las corridas 2 y 3 (`api`: 20,2–20,8 % media / 39,6 % máx.; `db`: 12,6–12,8 % media / 21,5 % máx.; `postgrest`: 3,7–3,9 % media / 6,8 % máx.).

## Antes y después

Comparación entre las corridas válidas (2 y 3) del antes (`a3a73c2`) y del después (`ae01f19`), en la misma máquina, con los mismos datos y el mismo script:

| Qué | Antes (`a3a73c2`) | Después (`ae01f19`) | Qué significa |
|---|---|---|---|
| Latencia p95 | 28,1 ms y 27,7 ms | **38,3 ms y 41,5 ms** | Sube unos 10–14 ms. La API hace dos consultas y recibe 1 394 KB en vez de 930 KB. El p95 se mantiene por debajo de 1 500 ms. |
| Throughput | 9,68 y 9,69 solicitudes/s | **9,56 y 9,54 solicitudes/s** | Prácticamente igual (-1,3 %): sigue fijado por el ciclo de 10 usuarios virtuales con `sleep(1)` (~1,04 s por iteración). |
| Tasa de error | 0 % | **0 %** | 0 respuestas fallidas en las 3 456 peticiones de las corridas 2 y 3. |
| Reclamos faltantes | 500 de 1 500 en cada respuesta | **0 de 1 500** en cada respuesta | Se eliminó la pérdida de los 500 reclamos más antiguos (`REC-2026-1001` a `REC-2026-1500`). **E2 se cumple.** |
| Carga aplicada | 10 usuarios virtuales, 3 min, 1 s de pausa, 1 500 reclamos | 10 usuarios virtuales, 3 min, 1 s de pausa, 1 500 reclamos | Se mantuvieron las mismas condiciones. |

## Decisión (#79)

Se conserva la mejora de `ae01f19` porque la bandeja recupera los 1 500 reclamos, cumple el umbral de latencia y mantiene el 0 % de errores HTTP.

Si crece el historial:

1. Pedir solo las columnas que muestra la bandeja y cargar el expediente completo al abrirlo. Hoy la API envía 1,39 MB por petición, incluidos `descripcion`, `datos_estudiante`, `datos_academicos`, `documentos`, `urls` y `cursos_resueltos`.
2. Paginar y filtrar desde el panel. La API ya pagina al consultar PostgREST, pero el panel sigue recibiendo la lista completa y la filtra en memoria.

## Límites de la medición

- **La sesión de admin pasa por el emulador de Firebase.** En modo emulador, `verifyIdToken` consulta al emulador en cada petición, cerca de 5 ms. En producción no lo hace. Ese tiempo está dentro del tramo de la API y se repite igual antes y después.
- **k6 corre en la misma máquina** y usa cerca del 17 % de un núcleo para leer cada respuesta y contar los faltantes. Con 20 hilos libres no compite con el sistema.
- **Es Docker Desktop sobre Windows**, no la máquina de producción (Railway). Los números sirven para comparar el antes y el después aquí, no para predecir producción.
