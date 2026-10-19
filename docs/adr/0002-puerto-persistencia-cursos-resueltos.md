# ADR-0002. Puerto RepositorioCursosResueltos con dos adaptadores intercambiables

## Estado

Aceptado el 09/10/2026. El 14/10/2026 lo actualizamos al agregar el adaptador en memoria y la regla de arquitectura.

## Contexto

Para registrar los cursos resueltos de un reclamo, el caso de uso tiene que leer lo que ya está guardado y guardar el valor nuevo. Ese valor lleva un historial de hasta 50 entradas y al administrador autenticado como autor, y si el reclamo no existe hay que responder 404. El dato está en la columna `jsonb` `reclamos.cursos_resueltos`, y hasta ahora se leía y se escribía con `sbRest`, que llama a PostgREST.

Teníamos dos motivos para separar esa parte. Queríamos probar el caso de uso sin depender de la red, que es lo que pide el escenario E4. Y el curso pide un dominio que no conozca la infraestructura, con dos adaptadores y una regla automática que lo vigile.

## Decisión

Decidimos que el dominio declare un puerto, `RepositorioCursosResueltos`, con dos operaciones: `obtener(id)` y `guardar(id, valor)`. Está en `backend/dominio/repositorioCursosResueltos.js`. El caso de uso recibe ese puerto como parámetro, junto con un reloj, en lugar de llamar a `sbRest`.

El puerto tiene dos adaptadores: `repositorioCursosSupabase`, que usa PostgREST y es el que corre en producción, y `repositorioCursosMemoria`, que guarda los datos en memoria y es el que usamos en las pruebas. Para que nadie rompa la separación sin darse cuenta, agregamos la regla `dominio-limpio` de dependency-cruiser. Corre en la integración continua y falla si `backend/dominio` importa algo de infraestructura o de presentación.

## Alternativas consideradas

- **Llamar a `sbRest` desde el caso de uso.** Era lo más simple: menos código y todo en un mismo lugar. La descartamos porque el caso de uso quedaba atado a PostgREST, cada prueba tenía que simular respuestas HTTP y cambiar de almacenamiento obligaba a tocar las reglas.
- **Pasar a un ORM (Prisma o Drizzle) con una tabla aparte para el historial.** Nos daba un esquema explícito, transacciones y un historial que se puede consultar sin recorrer JSON. La descartamos porque había que migrar el esquema y los datos de producción en plena matrícula, y porque un ORM no resuelve el acoplamiento por sí solo: entraría igual al caso de uso. Además, era mucho más de lo que necesitaba la rodaja.

## Consecuencias

- El caso de uso ya no depende de Supabase: su único `import` es del dominio (`backend/aplicacion/guardarCursosResueltos.js`, línea 1). Si cambiamos de almacenamiento, basta con escribir otro adaptador y cambiar la línea 1207 de `server.js`, donde se arma la ruta. Las reglas y sus pruebas no se tocan.
- Podemos probar las reglas sin red, sin Supabase y sin credenciales. Las 12 pruebas pasan en menos de un segundo, y una de ellas corre el mismo caso de uso con los dos adaptadores. Gracias a esto se cumple E4.
- Nada comprueba que un adaptador respete el puerto. JavaScript no tiene interfaces y el puerto es solo un `@typedef` de JSDoc, así que si un adaptador cambia la firma de `obtener` o de `guardar`, el build sigue en verde. Lo único que lo detectaría es la prueba compartida, que solo usa un reclamo que existe; el caso en que el adaptador en memoria devuelve `false` porque el reclamo no existe no lo prueba nadie.
- El adaptador en memoria no falla como falla PostgREST: no tiene errores de red ni de permisos, ni avisa cuando falta la columna `cursos_resueltos`. Nos sirve para probar las reglas, pero no reemplaza una prueba de integración contra Supabase, que todavía no tenemos.
- Guardar son dos llamadas: primero se lee y después se escribe. Si dos miembros del Tercio guardan el mismo reclamo a la vez, gana el último y la entrada de historial del otro se pierde. El puerto no lo evita; para resolverlo habría que comprobar `actualizadoEn` antes de escribir o armar el historial en una función SQL.
- La regla `dominio-limpio` solo vigila que `backend/dominio` no importe `infraestructura/` ni `presentacion/`. No impide que `aplicacion/` importe un adaptador directamente, ni que el dominio use paquetes de npm como `express` o `@supabase/supabase-js`. Tampoco ve que `ErrorDeCursos` lleve el código HTTP (400 o 404) dentro del dominio, porque eso no es un `import`.
