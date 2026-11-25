# Interfaces de la API generadas desde el contrato

El contrato de la API es `docs/api/openapi.yaml`. De él se generan las interfaces TypeScript de esta carpeta (Lab10, paso 4), con [openapi-generator](https://openapi-generator.tech/) 7.14.0 y el generador `typescript-fetch`.

| Qué | Dónde |
|---|---|
| Interfaces, clases y modelos generados (no se editan a mano) | `generado/` |
| Lo que el generador no modela, escrito a mano | `reclamos.ts` |
| Pruebas del cliente contra una API real | `../../pruebas/probar-cliente-generado.ts` |

`generado/` trae un modelo por esquema del contrato (`ReclamoCreado`, `ReclamoExistente`, `ErrorDeReclamo`…) y una interfaz por grupo de operaciones (`ReclamosDelEstudianteApiInterface`, `InterruptoresApiInterface`…) con su clase `…Api`, que hace las peticiones con `fetch`.

## Regenerar y verificar

Desde `sistema-reclamos/`. Hace falta Java 11 o superior, y red la primera vez para bajar el generador.

```bash
npm run api:generar     # escribe src/api/generado/ a partir de docs/api/openapi.yaml
npm run api:verificar   # falla si src/api/generado/ no corresponde al contrato
```

`api:generar` genera en una carpeta temporal y reemplaza `generado/` solo si el generador termina bien: si falla, queda el cliente que había.

Si cambias el contrato, corre `npm run api:generar` y sube el resultado junto con el cambio. Las versiones están fijas (`openapitools.json` para el generador y `scripts/generar-interfaces.mjs` para su envoltorio de npm), para que el resultado sea el mismo en cualquier máquina.

## Cómo se usa

```ts
import { Configuration, ReclamosDelEstudianteApi } from './generado';
import { registrarReclamo, ErrorDeApi } from './reclamos';

const api = new ReclamosDelEstudianteApi(new Configuration({ basePath: 'http://localhost:3005', accessToken: token }));

try {
  const resultado = await registrarReclamo(api, { categoria: 'Matrícula', descripcion: '…' });
  // resultado.tipo es 'creado' (201, con estado y cursosDescartados) o 'reenvio' (200)
} catch (e) {
  if (e instanceof ErrorDeApi) console.log(e.estado, e.codigo); // por ejemplo 400 'CODIGO_UNI_INVALIDO'
}
```

Desde un navegador en otro origen, `ubicacion` y `reintentarDespuesDe` se pueden leer porque la API expone `Location` y `Retry-After` en CORS (`backend/server.js`).

## Lo que el generador no resuelve

- **Dos respuestas exitosas con cuerpos distintos.** `POST /api/reclamos` responde 201 (`ReclamoCreado`) o 200 (`ReclamoExistente`, el reenvío). El generador escribe un solo tipo de retorno para `registrarReclamo()`, el de la última respuesta 2xx del contrato, que es el del reenvío. Con él, un 201 pierde `estado` y `cursosDescartados`. Por eso `reclamos.ts` separa los dos casos por el código HTTP. No se arregla en el contrato: las dos respuestas son las acordadas con el equipo consumidor.
- **Errores sin tipo.** Las respuestas de error no se modelan como retorno: el cliente lanza un `ResponseError` genérico. `reclamos.ts` lo convierte en `ErrorDeApi`, con el `codigo` estable de `ErrorDeReclamo`.
- **Respuestas con esquema sin nombre.** Las de los cinco interruptores (`cambiarModoAlmuerzo`, `cambiarModoAlmuerzoFestivo` y `cambiarModoDespedida`, con `{ success, activo }`, y `cambiarMantenimiento` y `cambiarTefiDurmiendo`, con `{ success, enabled }`) están escritas dentro de cada operación, y el generador las llamó `InlineObject` e `InlineObject1`. Darles nombre en el contrato las deja legibles; es un cambio de forma, no de comportamiento.
- **Nombres.** Las propiedades pasan de `snake_case` a `camelCase` (`creado_en` es `creadoEn`, y llega como `Date`); el generador hace la conversión en ambos sentidos. El esquema `Error` se llama `ModelError`, porque `Error` ya es un tipo de JavaScript.
- **Avisos del generador** (los tres aparecen en cada corrida): el del `ModelError`, el de los esquemas sin nombre, y uno sobre «generator's option» que no afecta al resultado.
