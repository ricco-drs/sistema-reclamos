# Carga del escenario E2

Mide E2 de [`docs/escenarios.md`](../docs/escenarios.md): hasta 10 miembros del Tercio abren o recargan a la vez la bandeja de reclamos (`GET /api/admin/reclamos`). La medida es un p95 menor a 1,5 s y 0 reclamos faltantes. La hipótesis está en [`docs/mediciones/hipotesis.md`](../docs/mediciones/hipotesis.md) y entró a `main` antes de escribir esto (#76, #80).

| Archivo | Qué hace |
|---|---|
| `escenario.js` | El script de k6: 10 usuarios virtuales durante 3 minutos, con 1 s de pausa, y los dos umbrales de E2. |
| `correr.mjs` | Corre el script tres veces seguidas y guarda el resumen de k6, `docker stats`, los tiempos de PostgREST y la máquina en `docs/mediciones/corridas/`. |
| `compose.yaml` | Se suma al `compose.yaml` de la raíz: la sesión de admin de prueba, los tiempos de PostgREST y k6. |
| `emulador-auth/` | El emulador oficial de Firebase Authentication (firebase-tools 15.35.0). |
| `cuenta-de-prueba.mjs` | Una cuenta de servicio desechable para firebase-admin, generada en cada arranque. |
| `rest.conf` | `docker/rest.conf` más una línea de registro con los tiempos de cada consulta. |

## Cómo se corre

Hace falta Docker y Node 22 o superior. No hace falta instalar k6: corre con la imagen `grafana/k6:1.8.2`, dentro de la red de Compose. Los comandos van desde la raíz del repositorio, en Git Bash o PowerShell.

1. Levantar el sistema con la base vacía y sembrar los 1 500 reclamos:

   ```bash
   docker compose -f compose.yaml -f carga/compose.yaml down --volumes
   docker compose -f compose.yaml -f carga/compose.yaml up --build --detach --wait
   docker compose -f compose.yaml -f carga/compose.yaml cp sistema-reclamos/scripts/sembrar-reclamos.js api:/app/scripts/sembrar-reclamos.js
   docker compose -f compose.yaml -f carga/compose.yaml exec -T api node scripts/sembrar-reclamos.js
   ```

2. Correr las tres corridas. Hay que cerrar todo lo que no haga falta y no tocar la máquina hasta que terminen, unos 10 minutos:

   ```bash
   node carga/correr.mjs --etiqueta antes
   ```

   Después de la mejora se usa el mismo comando con `--etiqueta despues`, sobre la misma máquina y los mismos datos. El script deja `docs/mediciones/corridas/<etiqueta>-resumen.md` con la tabla de las tres corridas. La primera se descarta, porque el sistema todavía está frío.

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
