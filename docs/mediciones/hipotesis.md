# Hipótesis de rendimiento: E2, bandeja del panel del Tercio

El equipo escribe esta hipótesis antes de escribir el script de carga y de medir (#76).

## Escenario, carga y umbral

Tomados del escenario E2 de [`docs/escenarios.md`](../escenarios.md).

- **Escenario:** hasta 10 miembros del Tercio abren o recargan a la vez la bandeja de reclamos del panel (`GET /api/admin/reclamos`).
- **Carga:** 10 usuarios virtuales durante 3 minutos con k6, sobre Docker Compose con PostgreSQL y PostgREST, con 1 500 reclamos de ejemplo.
- **Umbral:** latencia p95 menor a 1,5 s y 0 reclamos faltantes (el total listado coincide con `count(*)` de la tabla).

## Hipótesis del equipo

- **Componente que creemos que limita el rendimiento:** el componente de bandeja de reclamos es el que más limita el rendimiento. Lo concreto es la consulta: `GET /api/admin/reclamos` ejecuta `sbRest('/reclamos?select=*&order=created_at.desc')` sin paginación. Le pide a PostgREST todos los reclamos, con todas sus columnas, en una sola respuesta.
- **Por qué lo creemos:** creemos que es porque se hace sin paginación.
- **Qué esperamos que pase por no paginar:** PostgREST devuelve como máximo 1 000 filas y corta el resto sin avisar (`PGRST_DB_MAX_ROWS` en el `compose.yaml` de `develop`). El mismo E2 lo dice, «sin PostgREST nunca aparece el corte de 1 000 filas», y en producción ya nos pasó con la columna «atendido por». Como la bandeja ordena del más nuevo al más antiguo, con 1 500 reclamos va a listar 1 000 y van a faltar los 500 más antiguos. La latencia puede cumplir, pero E2 falla por los faltantes.
- **p95 esperado:** algo como 200 ms. Con los 1 500 reclamos sembrados, calculamos que la respuesta de la bandeja pesa casi 0,9 MB, y pasa por la base, PostgREST, el proxy y la API, con unas decenas de milisegundos en cada uno.
- **Dónde creemos que está el costo:** no en la consulta, porque ordenar 1 500 filas es nada aunque no haya índice por fecha, sino en el tamaño de lo que se devuelve: la base lo convierte a JSON, PostgREST y el proxy lo pasan, y la API lo decodifica y lo vuelve a codificar.
- **Qué más esperamos:** unas 9 solicitudes por segundo (con 10 usuarios y la pausa de 1 s no puede pasar de 10) y 0 % de errores HTTP.
- **Qué demostraría que nos equivocamos:** que la bandeja traiga los 1 500, que el p95 pase de 1,5 s o que el `EXPLAIN ANALYZE` muestre que la consulta sola se lleva la mayor parte del tiempo.
- **Fecha y quiénes la acordaron:** 25 de noviembre de 2026, todo el equipo.
