# Hipótesis de rendimiento: E2, bandeja del panel del Tercio

El equipo escribe esta hipótesis antes de escribir el script de carga y de medir (#76).

## Escenario, carga y umbral

Tomados del escenario E2 de [`docs/escenarios.md`](../escenarios.md).

- **Escenario:** hasta 10 miembros del Tercio abren o recargan a la vez la bandeja de reclamos del panel (`GET /api/admin/reclamos`).
- **Carga:** 10 usuarios virtuales durante 3 minutos con k6, sobre Docker Compose con PostgreSQL y PostgREST, con 1 500 reclamos de ejemplo.
- **Umbral:** latencia p95 menor a 1,5 s y 0 reclamos faltantes (el total listado coincide con `count(*)` de la tabla).

## Hipótesis del equipo

- **Componente que creemos que limita el rendimiento:** el componente de bandeja de reclamos es el que más limita el rendimiento.
- **Por qué lo creemos:** creemos que es porque se hace sin paginación.
- **p95 esperado:** con 10 usuarios y 1 500 reclamos se espera un p95 <= 1,5 s.
- **Fecha y quiénes la acordaron:** 25 de noviembre de 2026, todo el equipo.
