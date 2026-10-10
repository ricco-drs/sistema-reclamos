# ADR 001: separación por capas dentro de la API TEFIIS
Estado: aprobado. Fecha: 2026-10-09.

## Contexto
`sistema-reclamos` contiene React y una API Express. `sistema-admin` contiene el panel React y consume esa API. El cliente estudiantil además llama a un servicio M2 externo. Los dos repositorios proporcionados no son por sí solos dos microservicios de negocio independientes. Esta decisión se refiere a la organización interna de la API y puede coexistir con la distribución del sistema completo.
Las reglas de cursos resueltos estaban mezcladas con HTTP, consultas PostgREST y auditoría en `backend/server.js`. Probarlas obligaba a separar manualmente esas dependencias.

## Alternativas
1. Mantener toda la lógica en el endpoint. Facilita cambios pequeños, pero mezcla reglas y transporte.
2. Usar capas de presentación, aplicación, dominio e infraestructura dentro de la API existente.
3. Crear un microservicio adicional para los cursos resueltos. Permite despliegue independiente, pero añade comunicación y operación sin una necesidad demostrada en este caso.

## Decisión
Aplicar la alternativa 2 a una rodaja: guardar cursos resueltos. El dominio valida y construye el historial. El caso de uso necesita un repositorio con `obtener` y `guardar`. El adaptador implementa ese contrato con la función PostgREST existente. Express compone los objetos y conserva la autenticación administrativa.

## Escenario de calidad
Cuando cambia una regla sobre cursos resueltos, el desarrollador puede editar el dominio y ejecutar sus pruebas localmente sin Supabase, Firebase ni credenciales. Se comprueba con `npm test`: incluye pruebas del dominio, caso de uso, adaptador y contrato HTTP con dobles.

## Consecuencias
Se agregan archivos y composición. Las reglas pueden probarse sin iniciar el servidor. El refactor es parcial: los demás endpoints siguen en `server.js`. Los tests con dobles no verifican el acceso a una instancia real de Supabase. El patrón existente de leer y escribir historial sigue teniendo riesgo de concurrencia, que requeriría una transacción o control de versión en otra intervención.

## Descarte
La alternativa 1 mantiene la mezcla que impide aislar el dominio. La alternativa 3 aumenta el costo operativo para una funcionalidad que ya comparte autenticación y almacenamiento con la API.