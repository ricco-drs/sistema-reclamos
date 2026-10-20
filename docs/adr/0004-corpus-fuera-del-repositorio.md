# ADR-0004. Corpus documental fuera del repositorio

## Estado

Aceptado, 19/10/2026.

## Contexto

Tefi consulta documentos institucionales almacenados en Gemini File Search mediante RAG. La API obtiene el identificador del store desde `app_settings`, con la clave `rag_store_name`, y consulta su contenido sin leer los originales locales.

El repositorio también contenía una copia del corpus en `sistema-reclamos/documentos_entrenamiento/`: 20 PDF y una imagen, con un total de 47,63 MiB. Para utilizar un store existente no es necesario descargarlos ni volver a cargarlos en cada instalación.

## Decisión

Mantener el corpus de consulta en Gemini File Search y retirar sus copias del repositorio. La API utiliza el identificador del store configurado en `app_settings`.

El script `npm run seed-rag` se conserva como herramienta de reconstrucción, no como requisito de arranque. Para ejecutarlo se deben aportar los PDF en una carpeta local `documentos_entrenamiento/`; al completar la reconstrucción, el script actualiza el store configurado. El [inventario del corpus](../corpus-tefi.md) registra los nombres y tamaños de los archivos.

## Alternativas consideradas

- **Conservar el corpus en Git.** Facilita obtener los originales junto con el código, pero incorpora archivos pesados en cada clon y mantiene copias que el funcionamiento habitual del RAG no necesita.
- **Usar el store existente y retirar las copias locales del repositorio.** Evita seguir distribuyendo el corpus con la versión actual del código y conserva la integración de consulta existente. Es la alternativa elegida.
- **Mover los originales a otro almacenamiento y mantener un índice en Git.** Facilita su recuperación independiente del servicio de consulta, pero requiere acordar la ubicación, los permisos y el mantenimiento de ese respaldo. Se descarta para evitar mantener otro servicio de almacenamiento.

## Consecuencias

La versión actual deja de incluir los archivos del corpus y el arranque habitual utiliza el store ya configurado en Gemini File Search. El acceso a los documentos sigue dependiendo de ese servicio y de las credenciales y configuración del entorno. Un entorno nuevo debe disponer de un store accesible y registrar su identificador.

La eliminación no reduce el peso de los commits anteriores: los archivos permanecen en el historial. Reconstruir o trasladar el corpus requiere disponer de los originales por separado; el inventario solo registra los nombres y tamaños de los archivos retirados. El script de reconstrucción ya no puede ejecutarse desde un clon limpio sin aportar antes los PDF.
