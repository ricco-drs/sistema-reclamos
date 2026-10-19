# Consecuencias del ADR-0002

En el [ADR-0002](adr/0002-puerto-persistencia-cursos-resueltos.md) decidimos que el caso de uso de cursos resueltos no hable directamente con Supabase, sino a través de un puerto, `RepositorioCursosResueltos`, con dos adaptadores: uno para Supabase, que es el que usa producción, y otro en memoria para las pruebas. Lo implementamos en el Lab06 (commits [da5ce5c](https://github.com/ricco-drs/sistema-reclamos/commit/da5ce5c) a [a6cd1e1](https://github.com/ricco-drs/sistema-reclamos/commit/a6cd1e1)), y la regla `dominio-limpio` de dependency-cruiser lo vigila en la integración continua.

Aquí explicamos qué ganamos y qué nos cuesta esa decisión. Para cada consecuencia indicamos dónde se ve en el código y qué escenario de [escenarios.md](escenarios.md) toca. Revisamos todo sobre el commit `70d76d3`, con las 12 pruebas y la regla de arquitectura en verde.

En resumen, encontramos dos beneficios, tres costos y un riesgo:

| | Consecuencia | Tipo | Escenario |
|---|---|---|---|
| 1 | El caso de uso ya no depende de Supabase | Beneficio | E4 |
| 2 | Podemos probar las reglas sin servidor ni credenciales | Beneficio | E4, E6 |
| 3 | Nadie comprueba que un adaptador respete el puerto | Costo | E4 |
| 4 | El adaptador en memoria no reemplaza probar contra la base real | Costo | E4 |
| 5 | Dos guardados a la vez pueden borrar una entrada del historial | Riesgo | E6 |
| 6 | La regla de arquitectura solo cuida una dirección | Costo | E4 |

## 1. El caso de uso ya no depende de Supabase

El caso de uso recibe el repositorio como parámetro y solo llama a `obtener` y `guardar`; no sabe qué hay detrás. Su único `import` es del dominio ([guardarCursosResueltos.js, línea 1](../sistema-reclamos/backend/aplicacion/guardarCursosResueltos.js#L1)):

```javascript
import { cursosValidos, prepararCursosResueltos, ErrorDeCursos } from '../dominio/cursosResueltos.js';
```

El adaptador se elige en un solo lugar, cuando `server.js` arma la ruta ([líneas 1207 a 1209](../sistema-reclamos/backend/server.js#L1207-L1209)):

```javascript
const guardarCursosResueltos = crearGuardarCursosResueltos(crearRepositorioCursosSupabase(sbRest));
app.put('/api/admin/reclamos/:id/cursos-resueltos', requireAdminAuth,
  crearGuardarCursosHandler(guardarCursosResueltos, logActividad));
```

En la práctica, si mañana cambiamos de almacenamiento, escribimos otro adaptador y cambiamos esa línea; las reglas y sus pruebas quedan como están. Es lo que pide el escenario E4: que un cambio en las reglas no obligue a tocar la infraestructura, ni al revés.

## 2. Podemos probar las reglas sin servidor ni credenciales

Antes, para probar una regla de cursos resueltos había que levantar el servidor con las credenciales de Supabase y de Firebase. Ahora las pruebas le pasan al caso de uso un repositorio falso o el adaptador en memoria. El archivo de pruebas no importa `server.js`, solo los módulos de la rodaja ([líneas 3 a 7](../sistema-reclamos/backend/tests/cursosResueltos.test.js#L3-L7)), y una de las pruebas corre el mismo caso de uso con los dos adaptadores (líneas 79 a 91):

```javascript
const adaptadores = {
  Supabase: () => crearRepositorioCursosSupabase(async () => ({ ok: true, json: async () => [{ cursos_resueltos: {} }] })),
  Memoria: () => crearRepositorioCursosMemoria({ 'caso-1': {} }),
};
```

Las 12 pruebas tardan menos de un segundo, y la integración continua las corre en cada push sin ningún secreto configurado ([ci.yml](../.github/workflows/ci.yml)). Con eso cumplimos la medida de E4: pruebas en verde en menos de 5 s y sin red. También ayuda a E6, porque la prueba de las líneas 97 a 106 comprueba que el autor que se guarda es el del token, aunque el cuerpo de la petición diga otro.

## 3. Nadie comprueba que un adaptador respete el puerto

JavaScript no tiene interfaces, así que el puerto es solo un comentario de JSDoc ([repositorioCursosResueltos.js, líneas 3 a 5](../sistema-reclamos/backend/dominio/repositorioCursosResueltos.js#L3-L5)):

```javascript
 * @typedef {Object} RepositorioCursosResueltos
 * @property {(id: string) => Promise<{cursos_resueltos: object} | null>} obtener
 * @property {(id: string, valor: object) => Promise<boolean>} guardar
```

Los dos adaptadores anotan que lo implementan con `@returns` ([el de Supabase en la línea 1](../sistema-reclamos/backend/infraestructura/repositorioCursosSupabase.js#L1) y [el de memoria en la línea 3](../sistema-reclamos/backend/infraestructura/repositorioCursosMemoria.js#L3)), pero nadie lo verifica. `tsconfig.json` solo incluye `src/`, así que el backend no pasa por el chequeo de tipos, y ni `npm test` ni la integración continua corren `tsc`. Si un adaptador cambia la firma de `obtener` o de `guardar`, el build sigue en verde y el error recién aparece cuando el caso de uso lo llama.

Lo único que nos protege es la prueba compartida, y esa solo usa un reclamo que existe. El caso del reclamo inexistente, en el que el adaptador en memoria devuelve `false` ([línea 12](../sistema-reclamos/backend/infraestructura/repositorioCursosMemoria.js#L12)), no lo cubre ninguna prueba; el del adaptador de Supabase sí, pero por separado (líneas 69 a 75 de las pruebas). Para E4 esto significa que cambiar de adaptador sin riesgo depende de un contrato que nadie revisa.

## 4. El adaptador en memoria no reemplaza probar contra la base real

El adaptador en memoria es un `Map` de 17 líneas que nunca falla ([repositorioCursosMemoria.js](../sistema-reclamos/backend/infraestructura/repositorioCursosMemoria.js)). El de Supabase, en cambio, tiene que lidiar con los errores de PostgREST, con el aviso de que falta la columna `cursos_resueltos` ([líneas 5 a 11](../sistema-reclamos/backend/infraestructura/repositorioCursosSupabase.js#L5-L11)) y con la cabecera `Prefer: return=representation`, de la que depende para saber si el `PATCH` encontró el reclamo (línea 17).

Las pruebas del adaptador de Supabase (líneas 56 a 75) usan un `sbRest` falso: revisan la URL, la cabecera y el cuerpo que se envían, pero ninguna habla con una base PostgreSQL real. Por eso, que las pruebas pasen no garantiza que el guardado funcione en producción. Un error de esquema, de permisos o de red solo lo veríamos ahí. Para tener esa prueba de integración necesitamos una base local, que llega con el Docker Compose de la semana 11.

## 5. Dos guardados a la vez pueden borrar una entrada del historial

Guardar implica dos viajes a la base: el caso de uso lee el valor actual en la línea 8 y escribe el nuevo en la línea 11 ([guardarCursosResueltos.js](../sistema-reclamos/backend/aplicacion/guardarCursosResueltos.js#L8-L11)):

```javascript
const actual = await repositorio.obtener(id);
if (!actual) throw new ErrorDeCursos('Ese reclamo no existe.', 404);
const valor = prepararCursosResueltos(actual.cursos_resueltos, altas, bajas, admin, reloj());
if (!(await repositorio.guardar(id, valor))) {
```

El historial nuevo se arma a partir del que se leyó ([cursosResueltos.js, líneas 21 y 22](../sistema-reclamos/backend/dominio/cursosResueltos.js#L21-L22)), y el `PATCH` reemplaza la columna completa filtrando solo por `id` ([repositorioCursosSupabase.js, líneas 16 a 18](../sistema-reclamos/backend/infraestructura/repositorioCursosSupabase.js#L16-L18)), sin revisar si alguien la cambió entre la lectura y la escritura. Si dos miembros del Tercio guardan el mismo reclamo casi al mismo tiempo, pasa esto: A lee el historial H, B lee el mismo H, A guarda H + a y B guarda H + b. El historial queda en H + b y la entrada de A desaparece.

La decisión de A no se pierde del todo, porque después de cada guardado el handler llama a `logActividad` ([guardarCursosHandler.js, línea 8](../sistema-reclamos/backend/presentacion/guardarCursosHandler.js#L8)), que inserta una fila aparte en `activity_log` ([server.js, línea 605](../sistema-reclamos/backend/server.js#L605)). Pero esa inserción no se espera ni se reintenta; si falla, solo queda un mensaje en la consola.

Esto toca a E6, que pide que el 100 % de las decisiones quede con autor y fecha. Es poco probable que pase, porque el Tercio son unas 10 personas y rara vez dos editan el mismo reclamo en el mismo segundo, pero el puerto no lo impide. Para resolverlo, el `PATCH` tendría que comprobar que `actualizadoEn` no cambió desde la lectura, o el historial tendría que armarse en una función SQL.

## 6. La regla de arquitectura solo cuida una dirección

La regla `dominio-limpio` impide que `backend/dominio` importe algo de `infraestructura/` o de `presentacion/` ([.dependency-cruiser.cjs](../sistema-reclamos/.dependency-cruiser.cjs)):

```javascript
from: { path: '^backend/dominio' },
to: { path: '^backend/(infraestructura|presentacion)' },
```

Hay tres cosas que se le escapan:

- **Que `aplicacion/` importe un adaptador.** Hoy no lo hace, pero nada lo impide.
- **Los paquetes de npm, como `express` o `@supabase/supabase-js`.** Si el dominio los importara, la regla no lo vería, porque esos imports apuntan a `node_modules` y no a `backend/`.
- **El código HTTP dentro del dominio.** `ErrorDeCursos` lo guarda ([cursosResueltos.js, líneas 1 a 6](../sistema-reclamos/backend/dominio/cursosResueltos.js#L1-L6)) y el handler lo devuelve tal cual con `res.status(err.status ?? 500)` ([guardarCursosHandler.js, línea 18](../sistema-reclamos/backend/presentacion/guardarCursosHandler.js#L18)). Es un detalle de HTTP metido en el dominio, pero como no es un `import`, ninguna regla de dependencias lo puede ver.

E4 usa esta regla como instrumento de medida. Mientras cubra una sola dirección, que la integración continua esté en verde no basta para decir que el dominio está aislado; nos falta agregar reglas para `aplicacion/` y para los paquetes de npm.
