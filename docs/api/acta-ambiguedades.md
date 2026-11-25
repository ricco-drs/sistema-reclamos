# Acta de ambigüedades del contrato (Lab10)

Revisión del contrato de `POST /api/reclamos` por el equipo consumidor, y cómo se resolvió cada punto. El contrato resultante es la versión 2.0.0 de [`openapi.yaml`](openapi.yaml).

| | |
|---|---|
| **Qué se revisó** | `POST /api/reclamos`: petición, respuestas, errores y el evento `ReclamoRegistrado` que dispara. |
| **Quién lo revisó** | Benjamín, del equipo consumidor. |
| **Con quién se acordó** | Ricco, por el equipo de TEFIIS. Christopher registró la revisión y resolvió los huecos. |
| **Fecha** | 20 y 21 de noviembre de 2026. |
| **Seguimiento** | Issue #31 (contrato y acta), #61 (implementación) y #40 (cuerpo inválido, ya implementado). |

## 1. Lo que cambió del primer contrato a la versión acordada

El primer contrato (#35) describía el endpoint tal como se comportaba. La versión acordada con el consumidor cambia esto, y Benjamín confirmó que coincide con lo que acordaron:

| # | Antes | Versión acordada | Dónde se implementa |
|---|---|---|---|
| 1 | Los errores traían solo `error`, un mensaje que puede cambiar. | Cada error trae además un `codigo` estable, de una lista cerrada, que es lo que compara el cliente. | #61 |
| 2 | Crear respondía 200 `{ success, id }`, sin `Location`. | Crear responde 201 con `Location`. El 200 queda solo para el reenvío. | #61 |
| 3 | Los cursos fuera del catálogo o que pasaban de 30 se descartaban sin avisar. | Se informan en `cursos_descartados`, con `lista`, `codigo`, `seccion` y `motivo`. | #61 |
| 4 | El servidor no validaba el código UNI ni de quién eran los documentos. | 400 `CODIGO_UNI_INVALIDO` y 403 `DOCUMENTO_AJENO`, además del 403 `PRUEBA_AJENA` que ya existía. | #61 |
| 5 | Un JSON inválido respondía 500. | 400 `CUERPO_INVALIDO`. | #40 |
| 6 | La ventana o el ciclo cerrado respondían 503, que invita a reintentar. | 409 `VENTANA_CERRADA` y `CICLO_CERRADO`, sin reintento. El 503 queda para `SISTEMA_EN_PAUSA` y `SIN_NUMERO_DISPONIBLE`, y `Retry-After` solo acompaña al segundo. | #61 |

## 2. Lo que levantó el consumidor sobre la versión acordada

Benjamín encontró cinco huecos posibles. Cada uno quedó resuelto así:

| # | Lo que levantó | Cómo se resolvió | Por qué |
|---|---|---|---|
| H1 | En un reenvío (200), los cursos del segundo envío se descartan sin avisar y la respuesta no trae `cursos_descartados`, cuando la idea es no quitar nada en silencio. | **Se aclara en el contrato.** Un reenvío devuelve el reclamo que ya existía y no guarda nada del segundo envío, ni cursos ni pruebas. Como no se evaluó nada, no corresponde `cursos_descartados`. | El reenvío existe para que un doble clic o un fallo de red no creen dos reclamos; no es una forma de editar el que ya se envió. |
| H2 | El reenvío se reconoce solo por la descripción, no por el pedido completo. | **Se mantiene y se explica en el contrato.** | Un estudiante puede mandar dos reclamos distintos seguidos, y esos sí tienen que crearse. Comparar el pedido completo haría que un reintento con un curso cambiado creara otro reclamo. La protección tampoco está garantizada si los dos envíos llegan al mismo tiempo: es un riesgo conocido del escenario E1. |
| H3 | No se define el orden entre la autenticación (401) y las comprobaciones de pausa, ciclo y ventana. | **Se define en el contrato**, como funciona el servidor: cuerpo inválido (400), sesión (401), pausa (503), ciclo y ventana (409), datos (400) y adjuntos (400 y 403). | El cuerpo se rechaza antes que la sesión porque Express lee el cuerpo antes de llegar a la ruta. Después, cada comprobación evita trabajo de las siguientes. |
| H4 | `descripcion` no tiene largo máximo, solo el límite de 1 MB del cuerpo. | **Se acepta:** `maxLength` de 5 000 caracteres y un error nuevo, 400 `DESCRIPCION_DEMASIADO_LARGA`. | 1 MB de texto no es un reclamo, y la descripción va en el correo y en la bandeja del Tercio. |
| H5 | El 200 no lleva `Location`. | **Se acepta:** el 200 del reenvío también lleva `Location`. | El cliente consulta el reclamo igual, sea nuevo o el que ya existía. |

## 3. Aclaraciones a nuestro resumen

Al resumirle la versión acordada, el equipo escribió dos cosas mal, y Benjamín las corrigió:

- `VENTANA_CERRADA` y `CICLO_CERRADO` son 409, y el contrato dice que **no** sirve reintentar. `Retry-After` solo acompaña a `SIN_NUMERO_DISPONIBLE` (503), y `SISTEMA_EN_PAUSA` sigue siendo 503.
- El 200 no desapareció: ahora significa reenvío dentro de los 10 minutos.

## 4. Lo que el consumidor confirmó sin cambios

- El evento `ReclamoRegistrado` se publica solo con 201; un reenvío no lo publica.
- Se admite una prueba como máximo (`DEMASIADAS_PRUEBAS`) y 30 cursos por lista (`EXCEDE_LIMITE` en `cursos_descartados`).
- El nombre del curso lo toma el servidor del catálogo, y el correo, del token.
- Las reglas de versionado distinguen cambios mayores, menores y de parche. Por eso la versión acordada es la 2.0.0: crear pasa de 200 a 201, y la ventana y el ciclo cerrados pasan de 503 a 409.

## 5. Lo que se agregó después de la revisión

El campo `avisos` (#58) llegó después de la revisión, para la transición entre el front anterior y el nuevo: con `avisos: "api"`, la API publica el evento y lo confirma en la respuesta. Es opcional, el front anterior no lo manda, y se quita cuando ya no quede ese front. Por las reglas de versionado es un cambio menor, y no cambia nada de lo acordado.

## 6. Lo que salió al implementarlo (#61)

| Qué | Cómo quedó |
|---|---|
| **Una prueba podía colarse por `documentos`.** Si el cliente ponía `evidencias` dentro de `documentos`, se guardaba sin revisar y podía apuntar al archivo de otro estudiante. No estaba en el contrato. | Se ignora: las pruebas solo valen por el campo `evidencias`, que se revalida. El contrato lo dice en `documentos`. |
| **`Retry-After` no tenía valor acordado.** | Hoy siempre es 5 segundos, y el contrato lo dice. |
| **Los mensajes de tres errores** se escribieron distinto en el código que en el contrato (`CODIGO_UNI_INVALIDO`, `DOCUMENTO_AJENO` y `DESCRIPCION_DEMASIADO_LARGA`). | El contrato usa los del código. Lo estable es el `codigo`, y el mensaje puede cambiar. |
| **El código UNI** se valida solo si viene, y se aceptan espacios en los bordes y la letra en minúscula: se guarda normalizado. El contrato pedía la letra en mayúscula. | El contrato se ajusta a lo implementado, en vez de volver estricto el servidor: el front ya lo manda en mayúsculas, y aceptarlo normalizado no perjudica a ningún cliente. Un consumidor que mande `20240001a` recibe 201, no 400. |
| **`lista` en `cursos_descartados`:** la primera implementación devolvía `cursos_retirar` y `cursos_matricular`. | Se mantiene lo acordado con el consumidor, `retirar` y `matricular`, y se ajusta el código. Cambiar el valor ahora obligaría a avisarle al consumidor un cambio de contrato. |

## 7. Interfaces generadas desde el contrato (paso 4)

Se generaron con openapi-generator las interfaces TypeScript de la API, a partir de `openapi.yaml`.

| | |
|---|---|
| **Herramienta** | openapi-generator 7.14.0 (envoltorio de npm 2.21.0), generador `typescript-fetch`, con una interfaz por grupo de operaciones. |
| **Qué se generó** | `sistema-reclamos/src/api/generado/`: 6 interfaces `…ApiInterface` con su clase `…Api` y 42 modelos, que cubren las 19 operaciones del contrato. |
| **Cómo** | `npm run api:generar`. `npm run api:verificar` regenera en una carpeta temporal y falla si lo que está en el repositorio no corresponde al contrato (probado: con un cambio en un valor del contrato falla y nombra el archivo, y sin él pasa). |
| **Prueba** | `pruebas/probar-cliente-generado.ts` usa el cliente contra la API de Docker Compose: 9 de 9 casos (201, reenvío 200, y los códigos 400, 401 y 403 del contrato). `tsc --noEmit` compila el cliente, incluso con `--strict`. |
| **Detalle y uso** | [`sistema-reclamos/src/api/README.md`](../../sistema-reclamos/src/api/README.md) |

**Por qué cliente y no servidor.** Quienes consumen la API, el front y el equipo consumidor, necesitan los tipos; el servidor ya existe, es Express escrito a mano y está partido en módulos. Un generador de servidor (`nodejs-express-server`) crearía su propia estructura de rutas, que duplicaría los módulos y chocaría con la partición B. Del lado del servidor, el contrato se hace cumplir al revés: `validar-openapi.cjs` lo compara con el código.

**Lo que encontró el generador** (el detalle está en el README de `src/api/`):

| # | Hallazgo | Qué se hizo |
|---|---|---|
| G1 | `POST /api/reclamos` tiene dos respuestas exitosas con cuerpos distintos (201 y 200). El generador escribe un solo tipo de retorno, el de la última, que es el del reenvío, y con él un 201 pierde `estado` y `cursosDescartados`. | Se escribió `src/api/reclamos.ts`, que separa los dos casos por el código HTTP. El contrato no cambia: las dos respuestas son las acordadas con el consumidor. |
| G2 | Los errores no se modelan como retorno: el cliente lanza un `ResponseError` genérico. | `reclamos.ts` lo convierte en `ErrorDeApi`, con el `codigo` estable de `ErrorDeReclamo`. |
| G3 | Las respuestas de los cinco interruptores no tienen nombre en el contrato, y salieron como `InlineObject` e `InlineObject1`. | Queda como mejora del contrato: darles nombre. No cambia el comportamiento. |
| G4 | El esquema `Error` se renombró a `ModelError`, porque `Error` es un tipo de JavaScript, y las propiedades pasan a `camelCase` (`creado_en` llega como `creadoEn`, de tipo `Date`). | Se acepta y se documenta. |

**Qué no se hizo.** El generador necesita Java y red la primera vez, así que `api:verificar` no se agregó al CI para no volverlo rojo por una dependencia externa. Si se quiere, es el comando a agregar. Y el front todavía no usa las interfaces: `useReclamos.ts` sigue con sus propias llamadas.

## Estado

- **Contrato:** actualizado en `openapi.yaml` 2.0.0. Ya no queda ningún ejemplo con `x-pendiente`: el #40 implementó `CUERPO_INVALIDO` y el #62, los tres mensajes que faltaban.
- **Implementación:** el #62 (`feat/61-contrato-reclamos`) implementó el #61: `estado` y `creado_en` en el 201, `creado_en` en el 200 y el `codigo` del 401, además de los códigos, el 409 y el 503 acordados. El validador comprueba contra el código los 38 mensajes de error del contrato.
