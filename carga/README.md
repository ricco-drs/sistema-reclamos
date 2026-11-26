# Carga del escenario E2

Mide E2 de [`docs/escenarios.md`](../docs/escenarios.md): hasta 10 miembros del Tercio abren o recargan a la vez la bandeja de reclamos (`GET /api/admin/reclamos`). La medida es un p95 menor a 1,5 s y 0 reclamos faltantes. La hipótesis entró a `main` antes de preparar la carga, en el [PR #80](https://github.com/ricco-drs/sistema-reclamos/pull/80).

| Archivo | Qué hace |
|---|---|
| `escenario.js` | El script de k6: 10 usuarios virtuales durante 3 minutos, con 1 s de pausa, y los dos umbrales de E2. |
| `correr.mjs` | Corre el script tres veces seguidas y guarda el resumen de k6, `docker stats`, los tiempos de PostgREST y la máquina en `docs/mediciones/corridas/`. |
| `compose.yaml` | Se suma al `compose.yaml` de la raíz: la sesión de admin de prueba, los tiempos de PostgREST y k6. |
| `emulador-auth/` | El emulador oficial de Firebase Authentication (firebase-tools 15.35.0). |
| `cuenta-de-prueba.mjs` | Una cuenta de servicio desechable para firebase-admin, generada en cada arranque. |
| `rest.conf` | `docker/rest.conf` más una línea de registro con los tiempos de cada consulta. |

## Cómo se corre

Hace falta Docker y Node 22 o superior. k6 corre dentro de Compose. Usa un clon descartable desde la raíz del repositorio. Los comandos de Compose eliminan los volúmenes del proyecto de medición, así que usa un nombre de proyecto dedicado.

Para reproducir el **antes**, parte de una revisión que tenga esta guía y prepara el checkout en PowerShell:

```powershell
$revisionCarga = git rev-parse HEAD
git fetch origin pull/84/head
git switch --detach 42e7d17
git restore --source=$revisionCarga --worktree -- carga
$env:COMPOSE_PROJECT_NAME = 'tefiis-e2'
```

`42e7d17` conserva el backend medido en `a3a73c2` y añade las herramientas y la evidencia de la línea base. Para el **después**, usa otro clon descartable y cambia a `ae01f19` en el paso anterior. Restaura `carga/` desde la misma revisión en ambos clones. Ejecuta las dos fases por separado, en la misma máquina.

1. Levantar el sistema con la base vacía y sembrar los 1 500 reclamos:

   ```bash
   docker compose -f compose.yaml -f carga/compose.yaml down --volumes
   docker compose -f compose.yaml -f carga/compose.yaml up --build --detach --wait
   docker compose -f compose.yaml -f carga/compose.yaml cp sistema-reclamos/scripts/sembrar-reclamos.js api:/app/scripts/sembrar-reclamos.js
   docker compose -f compose.yaml -f carga/compose.yaml exec -T api node scripts/sembrar-reclamos.js
   ```

2. Correr las tres corridas. Hay que cerrar todo lo que no haga falta y no tocar la máquina hasta que terminen, unos 10 minutos:

   ```bash
   node carga/correr.mjs --etiqueta repetir-antes
   ```

   Para la segunda fase usa `--etiqueta repetir-despues`. Estas etiquetas preservan los [resultados originales de la línea base](../docs/mediciones/corridas/antes-resumen.md). El script deja `docs/mediciones/corridas/<etiqueta>-resumen.md` con la tabla de las tres corridas. Se descarta la primera porque el sistema todavía está frío.

3. Al terminar cada fase, ejecuta `docker compose -f compose.yaml -f carga/compose.yaml down --volumes` en su clon antes de pasar a la otra.

Para una sola corrida, sin guardar nada:

```bash
MSYS_NO_PATHCONV=1 docker compose -f compose.yaml -f carga/compose.yaml run --rm k6 run /carga/escenario.js
```

(`MSYS_NO_PATHCONV=1` evita que Git Bash convierta `/carga/...` en una ruta de Windows. En PowerShell no hace falta.)

## Qué cambia respecto del Compose del Lab11

Nada de lo que se mide. La API, PostgreSQL, PostgREST y nginx son las mismas imágenes y la misma configuración. Lo que se agrega:

- **La sesión de admin.** La bandeja exige un ID token de Firebase de un correo de `ADMIN_EMAILS`. Con `FIREBASE_AUTH_EMULATOR_HOST`, firebase-admin acepta los tokens del emulador oficial. La API los verifica con el mismo `verifyIdToken` de producción, sin cuentas reales ni secretos. k6 inicia sesión en el emulador al empezar cada corrida, así que no hay ningún token guardado.
- **Los tiempos de PostgREST.** nginx registra cuánto tardó PostgREST en cada consulta, y PostgREST manda en `Server-Timing` cuánto de eso fue la transacción en la base.
- **k6**, como servicio del perfil `carga`, que solo arranca con `docker compose run`.

## Lo que hay que tener en cuenta al leer los números

- **El emulador suma unos 5 ms por petición.** En modo emulador, `verifyIdToken` le consulta al emulador si la cuenta sigue activa. En producción no lo hace, porque la API no pide `checkRevoked`. Se suma igual antes y después.
- **k6 corre en la misma máquina.** Para contar los faltantes, lee cada respuesta completa (cerca de 0,9 MB) y cuenta los `id` distintos. Su CPU queda en `docker stats`, en la fila `k6`.
- **El total de referencia es `count(*)` de la tabla.** k6 lo pide directo a PostgREST (`Prefer: count=exact`), no a la API que se mide.
