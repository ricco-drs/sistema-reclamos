# ADR-0001. Una sola API, con la rodaja separada por capas, en lugar de un microservicio

## Estado

Aceptado, 09/10/2026.

## Contexto

TEFIIS tiene dos aplicaciones web, la de estudiantes (este repositorio) y el panel del Tercio (repositorio `sistema-admin`), que hablan con una sola API Express desplegada en Railway. Toda la lógica de esa API está en `backend/server.js`: 2 351 líneas y 41 rutas en las que conviven HTTP, consultas a PostgREST, correo, autenticación y reglas de negocio. Las reglas de cursos resueltos estaban dentro de su endpoint, y para probarlas había que levantar el servidor con credenciales de Supabase y de Firebase. El escenario E4 (modificabilidad) pide poder cambiar una de esas reglas sin tocar la infraestructura. El equipo tiene cinco integrantes, un solo entorno de despliegue y quince semanas.

## Decisión

Mantener una sola API desplegable y, dentro de ella, separar la capacidad «registrar cursos resueltos» en cuatro carpetas: `presentacion/`, `aplicacion/`, `dominio/` e `infraestructura/`. `server.js` solo compone los objetos (líneas 1207 a 1209).

## Alternativas consideradas

- **Dejar la lógica en el endpoint.** A favor: ningún archivo nuevo, y los cambios pequeños se hacen rápido. En contra: las reglas siguen mezcladas con el transporte y la base de datos, y E4 no se puede cumplir, porque probar una regla exige el servidor completo con credenciales.
- **Extraer un microservicio de cursos resueltos.** A favor: despliegue y escalado independientes. En contra: la capacidad comparte con la API la autenticación de Firebase, la tabla `reclamos` y el registro de actividad. Sumaría otro despliegue en Railway, otro juego de secretos y una llamada de red entre servicios, sin una necesidad de escala que lo justifique: la usan unos 10 miembros del Tercio.

## Consecuencias

> Borrador de guía. Lenin: reescribe esta sección con tus palabras (la plantilla pide que las consecuencias las escriba el equipo).

- Las reglas se prueban sin servidor ni credenciales: 12 pruebas en menos de un segundo.
- El panel no cambió: la ruta y su contrato son los mismos.
- Hay más archivos, y una composición manual en `server.js` que alguien tiene que mantener.
- El refactor es parcial: las otras 40 rutas siguen en `server.js` con `sbRest` directo. La partición en módulos queda para la semana 9.
