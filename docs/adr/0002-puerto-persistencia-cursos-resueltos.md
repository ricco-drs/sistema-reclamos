# ADR-0002. Puerto RepositorioCursosResueltos con dos adaptadores intercambiables

## Estado

Aceptado, 09/10/2026. Actualizado el 14/10/2026 con el adaptador en memoria y la regla de arquitectura.

## Contexto

El caso de uso necesita leer el valor actual de los cursos resueltos de un reclamo y guardar el nuevo, con un historial de hasta 50 entradas, el administrador autenticado como autor y una respuesta 404 si el reclamo no existe. El dato vive en la columna `jsonb` `reclamos.cursos_resueltos` y se accede por PostgREST con `sbRest`. Queremos que las pruebas del caso de uso no usen la red (E4), y el curso pide un dominio que no conozca la infraestructura, con dos adaptadores y una regla automática que lo vigile.

## Decisión

El dominio declara el puerto `RepositorioCursosResueltos`, con `obtener(id)` y `guardar(id, valor)`, en `backend/dominio/repositorioCursosResueltos.js`. El caso de uso lo recibe por inyección, junto con un reloj. Hay dos adaptadores: `repositorioCursosSupabase` (producción, PostgREST) y `repositorioCursosMemoria` (pruebas y demostración). La regla `dominio-limpio` de dependency-cruiser, que corre en CI, impide que `backend/dominio` importe infraestructura o presentación.

## Alternativas consideradas

- **Llamar a `sbRest` desde el caso de uso.** A favor: menos código y un solo lugar donde mirar. En contra: el caso de uso queda atado a PostgREST, cada prueba tiene que simular respuestas HTTP y cambiar de almacenamiento obliga a tocar las reglas.
- **Pasar a un ORM (Prisma o Drizzle) con una tabla de historial normalizada.** A favor: esquema explícito, transacciones y un historial que se consulta sin recorrer JSON. En contra: exige migrar esquema y datos en producción en plena matrícula, no resuelve por sí solo el acoplamiento (el ORM entraría igual al caso de uso) y excede la rodaja.

## Consecuencias

> Borrador de guía. Ricco: reescribe esta sección con tus palabras (la plantilla pide que las consecuencias las escriba el equipo).

- El caso de uso no importa nada de infraestructura, y la misma prueba corre contra los dos adaptadores.
- JavaScript no comprueba que un adaptador cumpla el puerto: el contrato es un `@typedef` de JSDoc y nada falla si un adaptador cambia la firma. La prueba que corre contra los dos adaptadores es la única red.
- El adaptador en memoria no reproduce PostgREST (errores de esquema, límite de filas), así que no reemplaza una prueba de integración.
- Leer y luego escribir el historial no es atómico: si dos miembros del Tercio guardan el mismo reclamo a la vez, una entrada puede perderse. Resolverlo requiere control de versión o una función SQL.
- La regla solo vigila que el dominio no importe infraestructura ni presentación. No impide que `aplicacion/` importe infraestructura, ni que el dominio importe paquetes de npm como `express`.
