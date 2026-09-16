# Analisis del modulo inteligente Tefi

**Sistema:** TEFIIS  
**Fecha de analisis:** 2026-05-03  
**Alcance revisado:** codigo fuente actual del frontend React/Vite, backend Express, scripts de RAG, parsers de PDF, paneles de reclamos, chat, base de conocimiento y planificador academico.

## Resumen ejecutivo

Tefi ya incorpora capacidades inteligentes reales, principalmente como asistente conversacional institucional con RAG y como apoyo al flujo de reclamos mediante extraccion de datos desde PDFs academicos. El sistema usa Gemini como LLM, con busqueda en documentos mediante Google File Search Stores.

Sin embargo, el modulo aun no cumple por completo con toda la descripcion planteada. Cumple de forma parcial: orienta al estudiante, responde consultas con documentos oficiales, procesa PDFs con texto seleccionable, ayuda a revisar reclamos y cruza datos academicos con reglamentos y malla curricular. Todavia no implementa OCR real sobre imagenes o documentos escaneados, no tiene un modulo formal de evaluador, no registra expedientes completos con resoluciones, no automatiza dictamenes formales, no analiza evidencias generales como imagenes, y no persiste una trazabilidad completa del caso.

## Funcionalidades actuales de Tefi

### 1. Asistente conversacional institucional

Implementado en:

- `src/features/chat/components/ChatArea.tsx`
- `src/features/chat/hooks/useChat.ts`
- `backend/server.js`

Tefi responde preguntas del estudiante sobre:

- matricula;
- reglamentos;
- tramites academicos;
- fechas y procesos de la FIIS-UNI;
- tutorias;
- calendario academico 2026-1;
- documentos oficiales cargados en el RAG.

El chat incluye acciones rapidas para consultas como:

- reglamentos;
- cronograma;
- guia de tutoria;
- base de conocimiento.

Las respuestas se renderizan con Markdown, tablas y formulas LaTeX usando:

- `react-markdown`;
- `remark-gfm`;
- `remark-math`;
- `rehype-katex`.

El prompt del chat obliga a Tefi a:

- responder como asistente experto de FIIS-UNI;
- usar documentos RAG para reglamentos, leyes, resoluciones y estatutos;
- evitar saludos iniciales;
- usar tablas para relaciones numericas;
- usar LaTeX para formulas;
- citar documentos de forma natural;
- explicar tramites de forma didactica;
- tratar los documentos RAG como fuente prioritaria.

### 2. RAG con documentos institucionales

Implementado en:

- `backend/server.js`
- `scripts/seed_rag.js`
- carpeta `documentos_entrenamiento/`

El sistema tiene un "cerebro RAG" basado en Google File Search Stores. El script `scripts/seed_rag.js`:

1. Lee los documentos ubicados en `documentos_entrenamiento/`.
2. Crea un File Search Store en Google.
3. Sube cada PDF con `ai.files.upload`.
4. Importa cada archivo al store con `ai.fileSearchStores.importFile`.
5. Guarda el ID del store en `backend/.rag_store_id`.

El backend luego lee `backend/.rag_store_id` y usa ese store para responder preguntas con la herramienta `fileSearch`.

Documentos detectados actualmente en `documentos_entrenamiento/`:

- Estatuto UNI.
- Ley Universitaria.
- Reglamento de Matricula.
- Reglamento de Evaluacion.
- Reglamento de Estudios Generales.
- Reglamento de Traslado Interno.
- Reglamento de ratificacion docente.
- Resoluciones rectorales y decanales varias.
- Documento de ayudantia de catedra.

### 3. Backend RAG local

Implementado en `backend/server.js`.

Expone dos endpoints:

| Endpoint | Funcion actual |
|---|---|
| `POST /api/rag/upload` | Recibe un PDF, lo sube a Gemini Files y lo indexa en el File Search Store. |
| `POST /api/rag/ask` | Recibe pregunta, historial y system instruction; consulta Gemini con File Search; devuelve la respuesta. |

El backend usa:

- `express` para API HTTP;
- `cors`;
- `multer` para recibir archivos temporales;
- `dotenv` para leer variables de entorno;
- `@google/genai` para Gemini y File Search.

La consulta al modelo se hace con:

- modelo principal: `gemini-2.5-flash`;
- fallback: `gemini-1.5-flash`.

Tambien incluye limpieza defensiva de respuestas duplicadas, porque el codigo contempla casos donde Gemini devuelve partes repetidas o borradores junto con respuesta final.

### 4. Flujo asistido de reclamos

Implementado en:

- `src/features/admin/components/ReclamosPanel.tsx`
- `src/features/admin/hooks/useReclamos.ts`

El estudiante inicia un reclamo seleccionando una categoria:

| Categoria | Estado |
|---|---|
| Matricula | Implementada como opcion |
| Tramites | Implementada como opcion |
| Acoso | Implementada como opcion |
| Profesores | Implementada como opcion |
| Otros | Implementada como opcion |

Despues de seleccionar categoria, el sistema solicita tres PDFs academicos:

- Ficha Academica.
- Boleta de Matricula.
- Avance Curricular.

Luego Tefi extrae datos, muestra un resumen y pide al estudiante fundamentar su reclamo. Cuando el estudiante escribe su caso, el hook construye un prompt con:

- datos verificados del estudiante;
- categoria del reclamo;
- cursos aprobados segun avance curricular;
- cursos matriculados segun boleta;
- plan de estudios y prerrequisitos;
- fundamento escrito por el estudiante;
- instrucciones para determinar si el reclamo procede o no.

La respuesta se envia al backend RAG para que Gemini responda usando documentos oficiales y contexto academico extraido.

### 5. Extraccion de datos desde PDFs academicos

Implementado en:

- `src/utils/pdfParser.ts`
- `src/features/admin/hooks/useReclamos.ts`
- `src/features/admin/components/DocsViewer.tsx`
- `src/features/academic/hooks/useScheduleData.ts`

El sistema extrae texto desde PDFs con `pdfjs-dist`. El flujo es:

1. El usuario sube PDFs desde el navegador.
2. `extractPdfText(file)` lee el `arrayBuffer`.
3. `pdfjs-dist` abre el PDF con `getDocument`.
4. Se procesa hasta un maximo de 6 paginas por archivo.
5. Se extrae contenido textual con coordenadas `x` e `y`.
6. Se reordena el texto por posicion vertical y horizontal.
7. `parsearFichasEstudiante(...)` aplica reglas y expresiones regulares para estructurar la informacion.

Datos extraidos o calculados:

| Bloque | Datos |
|---|---|
| Datos personales | codigo, nombre, especialidad, modalidad, plan, ciclo relativo, correo, telefono, turno, semestre de ingreso |
| Avance curricular | cursos, notas, veces, estado, convalidaciones, equivalencias, agrupacion por ciclo |
| Boleta de matricula | cursos matriculados, seccion, dia, hora, aula, tipo, docente, total de cursos, total de creditos |
| Ficha academica | promedios por ciclo, creditos por ciclo |
| Resumen academico | promedio ponderado de dos ultimos ciclos regulares, maximo de creditos, riesgo academico |

El promedio ponderado se calcula excluyendo ciclos de verano, identificados como ciclos terminados en `-3` o `3`.

### 6. Planificador academico y apoyo por prerrequisitos

Implementado en:

- `src/features/academic/components/HorariosParaModificar.tsx`
- `src/features/academic/hooks/useScheduleData.ts`
- `src/data/planEstudios.ts`
- `src/data/cargaHoraria.ts`

Despues de procesar documentos, el sistema habilita la vista de horarios. Esta vista permite:

- ver cursos actualmente matriculados;
- ver cursos aptos segun malla curricular;
- visualizar malla curricular;
- ver perfil academico del estudiante;
- revisar extraccion en modo debug;
- calcular creditos aprobados;
- marcar situacion academica normal o riesgo academico;
- deducir prerrequisitos aprobados de forma recursiva cuando el estudiante ya esta matriculado en cursos superiores.

Esto complementa el modulo inteligente porque Tefi usa la informacion academica estructurada para orientar reclamos de matricula y procedencia.

### 7. Visor de extraccion documental

Implementado en:

- `src/features/admin/components/DocsViewer.tsx`

Permite subir los tres PDFs academicos y ver el JSON en crudo generado por el parser local. Sirve como herramienta de validacion tecnica de la extraccion.

Nota: en el `App.tsx` actual este componente esta importado, pero no se renderiza en ninguna vista visible.

### 8. Panel de base de conocimiento

Implementado en:

- `src/features/admin/components/DatabasePanel.tsx`
- `src/supabaseClient.ts`
- `scripts/uploadToSupabase.cjs`

El panel permite subir y eliminar documentos en Supabase Storage, bucket `tefiis-docs`. Sin embargo, actualmente esta parte no esta completamente integrada con el RAG de Gemini:

- `DatabasePanel` sube documentos a Supabase Storage.
- El backend RAG consulta documentos indexados en Google File Search Store.
- No se encontro una llamada desde el frontend hacia `POST /api/rag/upload`.
- Por tanto, subir un documento desde `DatabasePanel` no necesariamente lo vuelve consultable por Tefi en el RAG.

Ademas, `DatabasePanel` lista documentos conocidos de forma fija por una limitacion comentada de RLS en Supabase, no mediante listado real del bucket.

## Como funciona el sistema hasta el momento

### Flujo de entrenamiento RAG

1. El administrador coloca PDFs oficiales en `documentos_entrenamiento/`.
2. Se ejecuta `scripts/seed_rag.js`.
3. El script crea un File Search Store en Google.
4. Sube e indexa cada PDF.
5. Guarda el identificador del store en `backend/.rag_store_id`.
6. El backend usa ese store para consultas futuras.

### Flujo de conversacion general

1. El estudiante escribe una pregunta en la vista Conversacion.
2. `useChat.ts` arma el historial, calendario academico y system instruction.
3. El frontend llama a `http://localhost:3000/api/rag/ask`.
4. `backend/server.js` envia la pregunta a Gemini con herramienta `fileSearch`.
5. Gemini responde usando el File Search Store.
6. El backend limpia duplicaciones y devuelve texto.
7. El frontend renderiza la respuesta en Markdown/LaTeX con efecto de escritura.

### Flujo de reclamo asistido

1. El estudiante entra a Reclamos.
2. Selecciona categoria del reclamo.
3. Sube Ficha Academica, Boleta de Matricula y Avance Curricular.
4. El frontend extrae texto de los PDFs con `pdfjs-dist`.
5. El parser convierte el texto en JSON academico.
6. Tefi muestra datos encontrados y solicita fundamento del reclamo.
7. El estudiante describe su caso.
8. El sistema arma un prompt con datos academicos, cursos aprobados, cursos inscritos, malla curricular y fundamento.
9. El backend consulta Gemini con RAG.
10. Tefi responde si el reclamo parece procedente o no y explica el motivo reglamentario o academico.

### Flujo de horarios

1. Luego de procesar documentos en Reclamos, `App.tsx` activa la vista Horarios.
2. Se reutiliza el JSON extraido.
3. El planificador cruza cursos aprobados, cursos matriculados, plan de estudios y carga horaria.
4. Muestra boleta actual, cursos aptos, malla curricular, perfil academico y debug.

## Que usa para OCR

Actualmente el sistema no usa OCR real.

Lo que existe es extraccion de texto desde PDFs con capa textual usando `pdfjs-dist`.

| Aspecto | Estado actual |
|---|---|
| OCR con Tesseract | No implementado |
| OCR con Google Vision | No implementado |
| OCR con Gemini Vision | No implementado |
| Extraccion de texto PDF | Si, con `pdfjs-dist` |
| Soporte para PDFs escaneados como imagen | No garantizado |
| Soporte para imagenes adjuntas | No implementado |
| Analisis visual de evidencias | No implementado |

Esto significa que el parser funciona mejor con documentos PDF generados digitalmente, donde el texto es seleccionable. Si el PDF es una imagen escaneada, una foto o contiene texto rasterizado, `pdfjs-dist` probablemente no extraera la informacion necesaria.

En los documentos oficiales del RAG, Google File Search puede encargarse internamente de extraer e indexar contenido de los PDFs subidos, pero el codigo del sistema no implementa ni controla un OCR propio para esos documentos.

Tambien existe `pdf-parse` como dependencia de desarrollo y en algunos scripts, pero no es el mecanismo principal usado por la app React para procesar las fichas del estudiante.

## Que LLM utiliza

El sistema usa Google Gemini.

| Uso | SDK | Modelo |
|---|---|---|
| Backend RAG principal | `@google/genai` | `gemini-2.5-flash` |
| Fallback si falla el principal | `@google/genai` | `gemini-1.5-flash` |
| Import legacy en reclamos | `@google/generative-ai` | Importado, pero no usado efectivamente en el flujo actual |

La API key se lee como `VITE_API_KEY`:

- en backend: `process.env.VITE_API_KEY`;
- en frontend: `import.meta.env.VITE_API_KEY`, aunque el cliente de `@google/generative-ai` queda importado/instanciado en `useReclamos.ts` pero el flujo real usa el backend.

Recomendacion tecnica: para produccion, la clave del LLM no deberia exponerse con prefijo `VITE_`, porque las variables `VITE_*` pueden quedar disponibles para el bundle del frontend. Conviene separar:

- `GEMINI_API_KEY` solo para backend;
- variables publicas `VITE_*` solo para valores no sensibles.

## Cumplimiento frente a la descripcion propuesta

| Requisito descrito | Estado actual | Evidencia / comentario |
|---|---|---|
| Incorporar automatizacion inteligente | Cumple parcialmente | Hay asistente Tefi con Gemini y RAG; tambien hay parser academico y planificador. |
| Mejorar orientacion al usuario | Cumple | Chat general y flujo de reclamos orientan al estudiante con contexto FIIS-UNI. |
| Apoyar revision de expedientes | Parcial | Tefi procesa datos academicos y ayuda a evaluar reclamos, pero no existe expediente formal persistido ni vista de evaluador. |
| Optimizar tratamiento de informacion de adjuntos | Parcial | Extrae datos de tres PDFs academicos especificos; no procesa cualquier adjunto ni evidencia general. |
| Servir como soporte inteligente sin reemplazar decision final | Cumple en intencion | La UI advierte que Tefi puede cometer errores y el prompt orienta, pero falta control formal de roles/resoluciones. |
| Extraccion de datos mediante OCR | No cumple literalmente | No hay OCR real; hay extraccion de texto PDF con `pdfjs-dist`. |
| Identificacion de informacion relevante en evidencias | Parcial | Identifica informacion relevante en ficha, boleta y avance; no analiza evidencias libres como imagenes, correos o capturas. |
| Deteccion de inconsistencias, omisiones o datos sospechosos | Parcial bajo | Valida estructura de PDFs, detecta faltantes y calcula riesgo academico; no hay motor dedicado de inconsistencias/sospechas. |
| Asistente Tefi para preguntas frecuentes | Cumple | Chat con prompts y documentos RAG. |
| Orientacion contextual al estudiante | Cumple | Usa calendario, reglamentos, historial conversacional y datos academicos extraidos. |
| Clasificacion preliminar del reclamo | Parcial | El usuario elige categoria; Tefi puede razonar sobre procedencia, pero no hay clasificador automatico robusto. |
| Resumen de expedientes | Parcial | Se resume la informacion extraida de PDFs, pero no hay expediente completo persistido ni resumen formal de caso. |
| Asistencia en redaccion de observaciones o respuestas | Parcial | El prompt puede guiar respuestas y fundamentos; no hay modulo especifico para generar observaciones/dictamenes formales. |
| Apoyo transversal a estudiante y evaluador | Parcial | Apoya sobre todo al estudiante. No hay flujo completo del evaluador. |
| Reducir carga operativa | Parcial | Automatiza extraccion y orientacion inicial, pero falta integracion con registro, trazabilidad y resolucion oficial. |

## Brechas principales

1. No hay OCR real para imagenes o PDFs escaneados.
2. No hay analisis de evidencias generales, como fotos, capturas, correos o documentos no academicos.
3. No hay persistencia formal de reclamos, expedientes, estados, dictamenes o auditoria.
4. No hay modulo de evaluador que revise expedientes y emita resoluciones.
5. El panel de base de conocimiento de Supabase no esta conectado automaticamente al RAG de Gemini.
6. El endpoint `/api/rag/upload` existe, pero no se encontro una UI actual que lo consuma.
7. La vista `DatabasePanel` parece no estar correctamente conectada desde `App.tsx`; el boton "Ver Base de Datos" puede cambiar a una vista que `App.tsx` no renderiza.
8. La extraccion PDF depende de reglas y expresiones regulares fragiles ante cambios de formato.
9. La clave del LLM se maneja con nombre `VITE_API_KEY`, lo cual no es recomendable para secretos.
10. No hay autenticacion, autorizacion ni separacion clara entre estudiante, administrador y evaluador.

## Conclusiones

Tefi, en el estado actual, funciona como un MVP avanzado de asistencia inteligente academica. Ya tiene tres capacidades valiosas:

1. Chat institucional con RAG sobre documentos oficiales.
2. Extraccion estructurada de informacion academica desde PDFs digitales.
3. Orientacion de reclamos usando datos del estudiante, reglamentos y malla curricular.

La descripcion propuesta se cumple parcialmente. Para afirmar que el modulo cumple por completo, faltaria implementar OCR real, analisis de evidencias generales, persistencia de expedientes, flujo del evaluador, resoluciones formales, trazabilidad, seguridad por roles y una integracion consistente entre la base documental administrable y el RAG usado por Gemini.

## Recomendaciones para completar el modulo

| Prioridad | Recomendacion | Motivo |
|---|---|---|
| Alta | Separar `GEMINI_API_KEY` en backend y eliminar uso frontend del secreto | Seguridad |
| Alta | Conectar `DatabasePanel` con `/api/rag/upload` o hacer que Supabase dispare indexacion RAG | Coherencia de base de conocimiento |
| Alta | Implementar OCR real para PDFs escaneados e imagenes | Cumplir extraccion documental descrita |
| Alta | Persistir reclamos, archivos, JSON extraido, analisis y respuestas en base de datos | Expediente formal y trazabilidad |
| Media | Crear vista de evaluador con resumen, inconsistencias, observaciones sugeridas y decision humana | Cumplir apoyo transversal estudiante/evaluador |
| Media | Agregar detector de omisiones/inconsistencias basado en reglas verificables | Reducir alucinacion y mejorar confiabilidad |
| Media | Convertir el parser en pipeline tolerante por tipo de documento/version | Menos fragilidad ante nuevos formatos |
| Media | Agregar pruebas con PDFs reales y PDFs escaneados | Validar cobertura de extraccion |

