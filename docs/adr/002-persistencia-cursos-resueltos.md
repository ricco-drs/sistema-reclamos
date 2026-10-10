# ADR 002: puerto de persistencia para cursos resueltos

Estado: aprobado. Fecha: 2026-10-09.

## Contexto

El endpoint de cursos resueltos usa Supabase mediante `sbRest`. Su comportamiento incluye validar listas, conservar hasta 50 entradas de historial, atribuir la decisión al administrador autenticado y responder 404 cuando el caso no existe.

## Alternativas

1. Llamar directamente a `sbRest` desde las reglas.
2. Inyectar un repositorio con `obtener(id)` y `guardar(id, valor)` en el caso de uso.
3. Migrar esta operación a un ORM y cambiar el almacenamiento del historial.

## Decisión

Usar la alternativa 2. En producción el adaptador usa `sbRest`. En las pruebas el repositorio es un objeto en memoria. También se inyecta un reloj para comprobar exactamente la fecha de auditoría. No se cambia el esquema ni el contrato que consume el panel.

## Escenario de calidad

Ante una modificación de las validaciones, la suite debe comprobar entradas válidas, inválidas, caso inexistente y auditoría sin realizar solicitudes de red. Las diez pruebas añadidas pasan usando el runner nativo de Node.

## Consecuencias

El caso de uso deja de importar tecnología de almacenamiento. El adaptador necesita sus propias pruebas para verificar URLs, representación de retorno y errores. Los dobles no sustituyen una prueba de integración real. Se conserva el límite previo de 50 entradas de historial y no se resuelve la concurrencia de dos administradores editando a la vez.

## Descarte

La alternativa 1 acopla reglas y PostgREST. La alternativa 3 exige una migración que excede la rodaja y no aporta una ventaja necesaria para este laboratorio.

La consigna disponible solo precisa el tema de uno de los ADR. Este segundo tema se eligió por estar directamente relacionado con la rodaja.