# ADR-0001. Separación por capas en la API

## Estado

Aceptado, 09/10/2026.

## Contexto

TEFIIS tiene una aplicación web para estudiantes y un panel administrativo en `sistema-admin`, que consumen una API Express. En `backend/server.js` conviven HTTP, consultas a PostgREST, correo, autenticación y reglas de negocio. Las validaciones y la preparación del historial de cursos resueltos estaban dentro de su endpoint, mezcladas con el acceso a Supabase. Esta organización dificultaba probar y cambiar esas reglas de forma aislada.

El escenario E4 plantea modificar una regla de cursos resueltos sin cambiar la infraestructura ni el contrato que consume el panel. Esta decisión aborda la organización interna de esa operación dentro de la API existente.

## Decisión

Mantener una sola API y separar la operación de registrar cursos resueltos en presentación, aplicación, dominio e infraestructura. El dominio valida los cursos y prepara el historial; la aplicación coordina la operación mediante un repositorio; la infraestructura implementa el acceso a Supabase; y la presentación recibe la petición HTTP y devuelve la respuesta. `server.js` conecta estos componentes y conserva la autenticación administrativa.

## Alternativas consideradas

- **Dejar la lógica en el endpoint.** Evita agregar archivos, pero mantiene las reglas mezcladas con HTTP y almacenamiento, lo que dificulta probarlas de forma aislada.
- **Separar por capas dentro de la API existente.** Permite probar las reglas y el caso de uso con un repositorio en memoria, conservando la ruta y el almacenamiento actuales. Requiere más archivos y conectar explícitamente los componentes. Es la alternativa elegida.
- **Extraer un microservicio de cursos resueltos.** Permitiría desplegar esta capacidad por separado, pero añadiría comunicación y operación para una funcionalidad que comparte autenticación y almacenamiento con la API. No se identificó una necesidad que justificara ese costo para esta rodaja.

## Consecuencias

Las reglas y el caso de uso de cursos resueltos pueden probarse sin levantar el servidor ni usar credenciales, mediante datos y un repositorio en memoria. Esto permite realizar el simulacro de modificabilidad de E4. La ruta y los datos de entrada y salida se conservan, por lo que el panel administrativo no requiere cambios por esta separación.

A cambio, hay más archivos y el equipo debe mantener la conexión entre los componentes en `server.js`. La separación solo cubre esta funcionalidad: convive con endpoints que mantienen reglas y acceso a datos juntos, lo que puede dificultar el mantenimiento si no se sigue un criterio común. Las pruebas con dobles no verifican una instancia real de Supabase, y la separación no resuelve las ediciones simultáneas del mismo reclamo.
