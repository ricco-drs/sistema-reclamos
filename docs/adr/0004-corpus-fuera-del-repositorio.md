# ADR-0004. Corpus documental fuera del repositorio

## Estado

Aceptado, 19/10/2026.

## Contexto

Tefi consulta documentos institucionales mediante RAG con Gemini File Search. El equipo confirma que los documentos ya están cargados en ese servicio. La API obtiene el identificador del store desde `app_settings`, con la clave `rag_store_name`, y consulta su contenido sin leer los originales locales.

El repositorio también contenía una copia del corpus en `sistema-reclamos/documentos_entrenamiento/`: 20 PDF y una imagen, con un total de 47,63 MiB. La observación del docente sobre el peso del repositorio plantea si esos documentos deben distribuirse con el código. Para utilizar un store existente no es necesario descargarlos ni volver a cargarlos en cada instalación.

## Decisión

Mantener el corpus de consulta en Gemini File Search y retirar sus copias del repositorio. La API conserva el mecanismo actual para obtener el identificador del store; no se modifica el modelo utilizado ni se ejecuta una nueva carga como parte de este cambio.

El script `npm run seed-rag` se conserva como herramienta de reconstrucción, no como requisito de arranque. Para ejecutarlo se deben aportar los PDF en una carpeta local `documentos_entrenamiento/`; al completar la reconstrucción, el script actualiza el store configurado. Queda pendiente documentar el índice de fuentes oficiales y la ubicación de los originales para poder recuperar el corpus sin depender del historial de Git.

## Alternativas consideradas

- **Conservar el corpus en Git.** Facilita obtener los originales junto con el código, pero incorpora archivos pesados en cada clon y mantiene copias que el funcionamiento habitual del RAG no necesita.
- **Usar el store existente y retirar las copias locales del repositorio.** Evita seguir distribuyendo el corpus con la versión actual del código y conserva la integración de consulta existente. Es la alternativa elegida; exige documentar cómo recuperar las fuentes.
- **Mover los originales a otro almacenamiento y mantener un índice en Git.** Facilita su recuperación independiente del servicio de consulta, pero requiere acordar la ubicación, los permisos y el mantenimiento de ese respaldo. No se incorpora otro almacenamiento en este cambio.

## Consecuencias

La versión actual deja de incluir los archivos del corpus y el arranque habitual utiliza el store ya configurado en Gemini File Search. El acceso a los documentos sigue dependiendo de ese servicio y de las credenciales y configuración del entorno. Un entorno nuevo debe disponer de un store accesible y registrar su identificador.

La eliminación no reduce el peso de los commits anteriores: los archivos permanecen en el historial. Reconstruir o trasladar el corpus requiere recuperar los originales y sus fuentes; el equipo debe completar ese inventario. El script de reconstrucción ya no puede ejecutarse desde un clon limpio sin aportar antes los PDF. Esta decisión no reescribe el historial ni acredita por sí sola que el corpus remoto esté completo o actualizado.
