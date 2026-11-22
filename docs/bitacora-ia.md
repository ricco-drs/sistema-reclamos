# Bitácora de uso de IA

Equipo 2, TEFIIS. SW708 Arquitectura de Soluciones de Software, 2026-2.

El curso permite la IA con un papel distinto cada semana y pide declarar qué se usó, qué se aceptó y qué se descartó. Se evalúa el criterio, no la herramienta. Si en una semana no se usó, se declara así.

## Cómo completar una semana

Cada integrante completa la semana que le tocó, con estos campos y sin cambiar su orden:

- **¿Se usó IA?** Sí o No.
- **Herramienta:** Claude, ChatGPT, Copilot u otra.
- **Para qué se usó:** una frase concreta.
- **Qué se aceptó:** lo que se dejó tal cual o con pocos cambios.
- **Qué se descartó y por qué:** al menos una cosa que la IA propuso y no se usó, con el motivo.
- **Registra:** quién escribe la entrada.

Reglas: tiene que ser lo que de verdad pasó, y concreto («le pedí la sintaxis de `container` en Structurizr y me dio una versión vieja que corregí»). Donde dice `POR COMPLETAR` falta ese dato; se reemplaza y se borra la marca.

| Semana | Papel de la IA según el curso                                                                                |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| 1      | Guía de código ajeno: se verifica cada afirmación contra el código y se anota al menos un error suyo.        |
| 2      | Abogada del diablo: los escenarios se escriben a mano y la IA pregunta con qué instrumento se mide cada uno. |
| 3      | Traductora a DSL: de la descripción en prosa al modelo C4.                                                   |
| 4      | Generadora de alternativas: las consecuencias las escribe una persona.                                       |
| 5      | No se usa.                                                                                                   |
| 6      | No se usa.                                                                                                   |
| 7      | Detectora de sobreingeniería: el equipo rechaza por escrito lo que no corresponde.                           |

## Semana 1 · 5 de setiembre

- **¿Se usó IA?** Sí
- **Herramienta:** Claude
- **Para qué se usó:** Preguntarle por los conceptos principales del sistema y pedirle un resumen de cómo funciona.
- **Qué se aceptó:** Todo el resumen y las explicaciones de los conceptos.
- **Qué se descartó y por qué:** Nada: no se detectó ninguna afirmación errónea al leer las respuestas.
- **Registra:** Roy Puris

## Semana 2 · 12 de setiembre

- **¿Se usó IA?** Sí
- **Herramienta:** Claude
- **Para qué se usó:** Revisar, a nivel técnico, qué se podía mejorar en los cinco escenarios de calidad del módulo M3 (`ESC-M3-01` a `ESC-M3-05`, en [atributos_calidad_M3.md](atributos_calidad_M3.md)).
- **Qué se aceptó:** Las métricas que sugirió Claude para las medidas de los escenarios. Dos de las medidas se cambiaron: en rendimiento (`ESC-M3-02`) se pedía 1 s o menos y quedó en 2 s, y en confiabilidad (`ESC-M3-04`) se pedía que el 100 % de los correos se entregara y quedó en el 95 % dentro de 15 minutos. Lo demás que sugirió se aceptó.
- **Qué se descartó y por qué:** Añadir más escenarios de calidad que no eran tan críticos. Se dejaron solo los más importantes.
- **Registra:** Roy Puris

## Semana 3 · 19 de setiembre

- **¿Se usó IA?** Sí
- **Herramienta:** Antigravity
- **Para qué se usó:** Se le pidió analizar la consistencia del borrador realizado en clase con el diagrama de contexto de structurizer, además de señalar debilidades en las 3 capas del diagrama.
- **Qué se aceptó:** Se aceptó el cambio de sintaxis para actualizar el gráfico y se subsanó las inconsistencias señaladas.
- **Qué se descartó y por qué:** Se descartó una observación que señalaba que no se contaba con un plan B respecto a Brevo (servicio de envío de email) debido a que sí se cuenta con un plan B configurado en el código.
- **Registra:** Franz Nuñez

## Semana 4 · 9 de octubre

- **¿Se usó IA?** Sí.
- **Herramienta:** Codex.
- **Para qué se usó:** Proponer alternativas para organizar la API y separar la persistencia de cursos resueltos en los ADR 001 y 002.
- **Qué se aceptó:** La separación por capas dentro de la API existente y la inyección de un repositorio con `obtener` y `guardar`, para probar las reglas sin conectarse a Supabase.
- **Qué se descartó y por qué:** Mantener las reglas dentro del endpoint, porque mezcla validación, HTTP y almacenamiento; crear un microservicio adicional, porque añade operación sin una necesidad demostrada; y migrar esta operación a un ORM, porque excede el alcance de la rodaja.
- **Registra:** Lenin.

## Semana 5

- **¿Se usó IA?** No.
- **Registra:** Lenin.

## Semana 6 · 14 de octubre

- **¿Se usó IA?** No
- **Herramienta:** Ninguna.
- **Para qué se usó:** No se realizó el uso de un asistente en la refactorización a puertos y adaptadores.
- **Qué se aceptó:** No aplica.
- **Qué se descartó y por qué:** No aplica.
- **Registra:** Ricco Rashuaman

## Semana 7 · 15 al 19 de octubre

### Entrada del 15 de octubre

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Primer borrador del informe de la Entrega 1 a partir del contenido del repositorio.
- **Qué se aceptó:** La reescritura de los escenarios de calidad sobre el comportamiento real del código (E1 a E6), la elección del ADR-0003 (la secuencia de PostgreSQL que numera los reclamos) y la estructura del informe.
- **Qué se descartó y por qué:** Las consecuencias de los tres ADR, porque el curso exige que las escriba el equipo. El ADR-0003 ya fue reescrito por quien lo firma.
- **Registra:** Ricco Rashuaman

### Entrada del 17 al 19 de octubre, escenarios, ficha, interfaz y unión de los repositorios

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Redactar `docs/escenarios.md`, `docs/interfaz/` y `docs/ficha-del-sistema.md` a partir del borrador del informe y del código. Después, unir `sistema-admin` a este repositorio en dos carpetas sin perder el historial de cada uno, integrar los diagramas C4 de Franz, limpiar el borrador del informe en Word y completar la ficha y la interfaz.
- **Qué se aceptó:** Los tres archivos, revisados antes de subirlos. Los pasos de la unión (mover el código a `sistema-reclamos/`, traer `sistema-admin` con el commit de Ricco y ajustar el CI), la resolución del conflicto del README con los cambios de Franz y lo que valida el panel en los cursos resueltos, comprobado en `sistema-admin/src/App.jsx`.
- **Qué se descartó y por qué:** Datos del borrador que no coincidían con el código: la interfaz no comprueba el tamaño del PDF (solo lo hace el servidor), los cursos fuera del catálogo no se rechazan sino que se descartan sin avisar, y la columna «Lo valida el dominio» pasó a «Lo valida el servidor» porque casi todas esas reglas están en `server.js`. De la ficha se quitó lo que se decía de Ricco sobre el panel, porque no se pudo confirmar. Del Word se quitaron la página de notas internas, los comentarios al margen y las frases de relleno. Las consecuencias de los ADR que redactó la IA no se usan: las escribe el equipo.
- **Registra:** Christopher Albino

### Entrada del 18 al 19 de octubre, git y consecuencias del ADR-0003

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Revisar y realizar una guía de preguntas para redactar las consecuencias del ADR-0003.
- **Qué se aceptó:** El método de preguntas para redactar las consecuencias.
- **Qué se descartó y por qué:** El borrador de consecuencias de la IA. Se reescribió con palabras propias y se quitaron dos viñetas que no se podían defender (el viaje extra a la base y el respaldo del método anterior).
- **Registra:** Roy Puris

### Entrada del 19 de octubre, corrección de los escenarios

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Con la crítica escrita por el Equipo 3 sobre E1 a E6, se le pidió un borrador de las correcciones de `docs/escenarios.md`, apoyado en lo que dice el código (cómo se firma la sesión del estudiante, las URL de los proveedores de correo, el límite de cursos).
- **Qué se aceptó:** Pasar cada observación a una corrección concreta (qué instrumento, qué script, quién lo corre), la matriz de casos de E3, el denominador de E6 y las tablas de antes y después.
- **Qué se descartó y por qué:** La matriz de E3 ponía `POST /api/reclamos/evidencias` como la ruta que rechaza la evidencia ajena, pero esa ruta solo sube el archivo a la carpeta del propio estudiante. El rechazo está en `POST /api/reclamos`; se pidió en la revisión del PR #5 y Roy corrigió la ruta en ese mismo PR. Se encontró al revisar el borrador contra el código, con apoyo de Claude Code.
- **Registra:** Roy Puris

### Entrada del 19 de octubre, Lab07: patrones y acoplamiento

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Como detectora de sobreingeniería: se le pidió, a partir de la descripción de cada uno de los tres fragmentos del Lab07, la lista de patrones que podrían aplicarse. También midió el acoplamiento con dependency-cruiser y redactó el borrador de `docs/acoplamiento/2026-10-17.md`.
- **Qué se aceptó:** Una tabla de funciones indexada por tipo para el fragmento A (Strategy en su forma mínima) y Adapter para el fragmento B. Para el fragmento C, no aplicar ningún patrón. De la medición, los números de Ca, Ce e I, revisados contra la salida de la herramienta.
- **Qué se descartó y por qué:**
  - **Fragmento A.** Strategy con una clase por tipo: tres archivos por cada tipo de comprobante para elegir una función. Factory Method: no se crea un objeto distinto por tipo, solo se elige qué función ejecutar. Chain of Responsibility: los tipos se excluyen entre sí y ninguno pasa la petición al siguiente. Visitor: no hay una estructura de objetos que recorrer.
  - **Fragmento B.** Bridge: no hay dos jerarquías que varíen por separado, solo dos proveedores. Abstract Factory: no se crean familias de objetos relacionados. Template Method: obligaría a una clase base para dos subclases cuyas diferencias son de formato, no de pasos. Facade: sin una API que simplificar, solo hay que aislar los formatos.
  - **Fragmento C.** Strategy, Template Method, Facade y Decorator: no hay variación ni cambio previsto en cuarenta líneas que nadie toca desde hace un año; cualquiera de ellos solo agregaría indirección.
  - **Medición.** El resultado de la herramienta suma por archivo y no por carpeta, así que no se copió tal cual: el equipo contó por carpeta, como en el ejemplo del laboratorio.
- **Registra:** Roy Puris

## Semana 10 · 7 de noviembre

### Entrada del 20 de noviembre, reglas de arquitectura por capas

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Escribir las dos reglas nuevas de `sistema-reclamos/.dependency-cruiser.cjs` (que `aplicacion/` no importe infraestructura ni presentación, y que el dominio no importe paquetes de npm) y revisar que el código actual y el de la rama `feat/evento-reclamo-registrado` las cumplan.
- **Qué se aceptó:** Las dos reglas, después de verlas fallar con un import prohibido de cada tipo, en la terminal y en la CI (ejecución #114), y volver a verde al quitar esos imports (ejecución #115).
- **Qué se descartó y por qué:** Su propuesta de guardar las capturas sueltas en `docs/evidencias/`: se guardaron en `docs/evidencias/img/` para no mezclarlas con los archivos de texto del Lab04-05.
- **Registra:** Ricco Rashuaman

### Entrada del 20 de noviembre, Lab10: flujo por eventos y entidad de cursos resueltos

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Leer `server.js` y proponer la ruta, los campos y el evento `ReclamoRegistrado` antes de acordarlos con Christopher. Después, escribir el caso de uso `registrarReclamo` con sus puertos y adaptadores en memoria, las pruebas, `docs/api/eventos.md` y el refactor de la entidad `CursosResueltos`, usando la rodaja de cursos resueltos como plantilla.
- **Qué se aceptó:** La estructura de la rodaja existente aplicada al registro de reclamos, el bus en proceso que no espera a los consumidores y el cliente de M2 con tiempo límite. De la revisión de Christopher contra `server.js`, sus cuatro ajustes: agregar el 401 y el 500, aclarar que los cursos se cortan en 30 sin devolver error, que `categoria` es el texto y que el consumidor de M2 lee la descripción por id. Se comprobó con `npm test` y `npm run arch:check` (evidencia en `docs/evidencias/lab10-pruebas.txt`). También sus observaciones de la revisión: usar el cliente de M2 en memoria cuando `M2_URL` esté vacía, y presentar la falta de reintentos como limitación conocida.
- **Qué se descartó y por qué:** El contrato inicial de la IA, que no tenía el 401 ni el 500, daba el límite de 30 cursos como si fuera un 400 y no mencionaba que el servidor numera con el método anterior si la secuencia no responde; Christopher lo encontró al compararlo con `server.js`. En la revisión del PR #27, Christopher encontró tres afirmaciones de `docs/api/eventos.md` que no eran ciertas: que hoy «nadie reintenta» (el bus tampoco reintenta), que el cuerpo a M2 era «el mismo que manda la aplicación» (el código UNI ahora sale del reclamo guardado) y que bastaba quitar las dos llamadas del front (faltaba cambiar el aviso de `ReclamosPanel.tsx` y definir `M2_URL`). Se verificó cada punto contra el código (`ReclamosPanel.tsx` líneas 500 a 502, `useReclamos.ts` línea 940 y `limiteEnvioCodigo`) y se corrigió el documento, con una sección de limitaciones conocidas. Además, el adaptador en memoria de reclamos usaba el reloj real y dos pruebas fallaban contra la fecha fija; se le inyectó el reloj. La IA no encontró el contrato de M2 en el repositorio; se usó la llamada de `useReclamos.ts` que indicó Christopher. La conexión al arranque de `server.js` no se hizo: solo Ricco lo modifica.
- **Registra:** Roy Puris

### Entrada del 20 de noviembre, generador de tokens para E1 y E3

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Escribir `sistema-reclamos/pruebas/generar-tokens.js` a partir de lo que piden E1 y E3 en el informe, y probarlo contra `requireStudentAuth` levantando `server.js` con una clave local y sin conexión a Supabase.
- **Qué se aceptó:** El script con 200 tokens válidos, uno vencido y uno falsificado; los correos en el dominio reservado `prueba.test`; que el secreto se pase explícito y no se lea del `.env` del proyecto, que suele tener el de producción; y `tokens.json` fuera de git. Se comprobó que sin token, con el vencido, con el falsificado y con uno firmado con otra clave la API responde 401, y que los 200 válidos pasan la autenticación (evidencia en el PR #32).
- **Qué se descartó y por qué:** Agregar un script en `package.json` y sumar `pruebas/` a `eslint.config.js`: el build solo lo modifica Ricco, así que se importó `process` en el propio archivo. La primera prueba del token firmado con otra clave no valía: el archivo se escribió en otra ruta, el token salió vacío y el 401 era por falta de token. Se repitió con un token real.

### Entrada del 20 de noviembre, Lab10: contrato OpenAPI

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Leer en `server.js` las 18 rutas de `/api/admin/*` y `POST /api/reclamos`, y redactar `docs/api/openapi.yaml` con sus ejemplos y errores. También para comparar el contrato con la tabla de errores de `docs/api/eventos.md` (#27) y para escribir un validador local, `sistema-reclamos/pruebas/validar-openapi.cjs`.
- **Qué se aceptó:** El contrato escrito sobre el comportamiento actual del código, con los mensajes de error copiados de `server.js`, y el validador: las 19 operaciones coinciden con las rutas del código, y los 192 ejemplos y los 34 mensajes de error se comprueban (evidencia en `docs/evidencias/lab10-openapi.txt`). Lo que el código hace de forma discutible quedó documentado tal cual: un cuerpo que no es JSON válido responde 500, `POST /api/admin/maintenance` no crea su fila y los interruptores usan tres nombres de campo distintos.
- **Qué se descartó y por qué:** Validar con Redocly por `npx`, porque descarga y ejecuta un paquete de internet; se usaron `js-yaml` y `ajv`, que ya instala `npm ci`. Corregir esos comportamientos en este PR, porque son cambios a `server.js` y los decide el equipo. Cambiar la fila del informe de la Entrega 1 que limita el contrato a `/api/admin/*`, porque es un documento ya entregado. La primera versión del validador se caía ante una `$ref` rota sin informar los demás errores; se corrigió para que la cuente como un problema más.

### Entrada del 20 de noviembre, Lab09: particiones del backend

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Clasificar por módulo las 41 rutas de `server.js`, revisar qué piezas comparten (PostgREST, correo, sesión, interruptores) y redactar el borrador de `docs/particiones.md`, con las dos particiones, el cuadro por escenario y la recomendación.
- **Qué se aceptó:** Las dos alternativas (por módulos de negocio y por capas técnicas), el cuadro de E1 a E6 y usar como criterio de desempate la prioridad de los escenarios que ya fijaba el informe (tabla 2.7), en vez de inventar uno nuevo. También que la elegida sea la que el informe de acoplamiento ya se comprometió a medir en la semana 13.
- **Qué se descartó y por qué:** Un ejemplo del borrador que ponía `multer` como dependencia exclusiva de `documentos`: al revisar `server.js`, lo usan también Tefi y reclamos, y se cambió por `firebase-admin`, que solo usa `acceso`. La forma exacta del build y de las reglas no se fijó en el documento, porque la decide Ricco al implementarla.
- **Registra:** Christopher Albino

### Entrada del 20 de noviembre, plantilla de confirmación del reclamo

- **Fecha y tarea:** 20 de noviembre. Sacar de `server.js` la plantilla del correo de confirmación (`componerConfirmacion`) a su propio archivo, a pedido de Ricco, para que él solo la importe al conectar el bus de eventos.
- **Herramienta y versión:** Claude Code (Sonnet 5.5).
- **Qué se le pidió:** Mover la plantilla y el cálculo de `primerNombre` de `POST /api/reclamos/confirmar` a `backend/presentacion/`, sin cambiar el mensaje que recibe el estudiante, y probarla.
- **Qué se aceptó:** `componerConfirmacion` y `plantillaCorreo.js` (`emailTemplate`, `escaparHtml`, URL de las imágenes), con 6 pruebas. La IA comparó la salida con el código original de `server.js` en seis casos, incluidos nombres sin coma y con HTML en la categoría: el contenido es idéntico y solo cambia la sangría del HTML. Se verificó con `npm test` (49 pruebas) y `npm run arch:check`.
- **Qué se descartó y por qué:** La firma pedida, `componerConfirmacion({ id, nombre, categoria })`, no alcanzaba: cuando el nombre no trae coma, el saludo se arma con el correo. Se agregó `email` como campo opcional, que el consumidor ya recibe en el evento. No se tocó `server.js`: la copia de `emailTemplate` que sigue ahí la usan el código de verificación y la respuesta del Tercio, y la reemplaza quien conecta el bus.
- **Registra:** Roy Puris

### Entrada del 20 de noviembre, inmutabilidad real de CursosResueltos

- **Fecha y tarea:** 20 de noviembre. Issue #55, que abrió Lenin: la entidad `CursosResueltos` del #26 se decía inmutable, pero compartía listas y objetos con las entradas y con lo que devuelve `aPlano()`.
- **Herramienta y versión:** Claude Code (Sonnet 5.5).
- **Qué se le pidió:** Comprobar si la observación de Lenin era cierta y corregir la entidad sin cambiar la forma persistida, el límite de 50 entradas ni los códigos HTTP.
- **Qué se aceptó:** Reproducir primero las tres mutaciones (cambiar la lista de entrada, cambiar el resultado de `aPlano()` y cambiar el historial devuelto): las tres alteraban la instancia. Después, copiar con `structuredClone` al construir, congelar todo el árbol, y devolver una copia desde `aPlano()`. Se agregaron 6 pruebas; 5 fallan con el código anterior y las 58 pasan con el nuevo, con `arch:check` limpio.
- **Qué se descartó y por qué:** Dejar el `Object.freeze` de primer nivel, que fue lo que la IA propuso en el #26: congelaba el contenedor y no lo que contiene. Tampoco se devuelven copias del historial en cada lectura: el historial ya queda congelado y modificarlo lanza `TypeError`.
- **Registra:** Roy Puris

## Semana 11 · 14 de noviembre

### Entrada del 20 de noviembre, identidades de Git

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Revisar las identidades del historial remoto, contrastar las equivalencias propuestas por Roy en el PR #48 y preparar el `.mailmap` que pidió el docente.
- **Qué se aceptó:** Los correos institucionales y las equivalencias verificadas en el historial. Se comprobó que las 13 combinaciones de nombre y correo quedan agrupadas en seis identidades, correspondientes al equipo y al docente.
- **Qué se descartó y por qué:** Reescribir commits para cambiar su autor. Git puede agrupar las contribuciones con `.mailmap` y conservar los commits publicados.
- **Registra:** Lenin Castro

### Entrada del 21 de noviembre, arranque reproducible de TEFIIS con Compose

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Preparar el Dockerfile de dos etapas y el entorno de Compose de Lab11, y verificar el arranque del portal, la API y PostgreSQL desde un clon limpio.
- **Qué se aceptó:** Servir el portal compilado y conectar la API a PostgreSQL por PostgREST con los datos y las sesiones sintéticas del laboratorio. Se probó el arranque, el registro y consulta de reclamos, el rechazo de un token vencido y la siembra de 1 500 filas.
- **Qué se corrigió y por qué:** En la primera compilación el backend no pudo crear el directorio de adjuntos como usuario sin privilegios. La imagen ahora lo prepara con el propietario correcto. Tras la revisión del PR #29, se actualizaron las imágenes con su nombre completo y se repitió el arranque en una copia limpia.
- **Evidencia:** [Portal de TEFIIS levantado en Compose](evidencias/img/lab11-compose.jpg).
- **Registra:** Lenin Castro

### Entrada del 20 de noviembre, conexión del bus y del correo con timeout en server.js

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Conectar en `server.js` el registro de reclamos con el evento `ReclamoRegistrado` (#27), sus consumidores de correo y M2 y el enviador de correo con timeout (#34); preparar la transición entre el front anterior y el nuevo (#46), que pidió Lenin; escribir las pruebas de esa transición y `pruebas/probar-registro-con-bus.mjs`, que levanta el servidor real contra servicios falsos; y corregir los tres errores de ESLint que `server.js` ya tenía en `develop` (dos variables sin usar y una función que nadie llamaba), sin cambiar su comportamiento.
- **Qué se aceptó:** Reemplazar la ruta anterior de `POST /api/reclamos` por el caso de uso, después de compararlas y ver que hacen las mismas comprobaciones con los mismos mensajes; quitar de `server.js` su copia de `emailTemplate` y de las funciones de envío; avisar al arrancar si falta `M2_URL` o si `EMAIL_TIMEOUT_MS` no es un número; darle a M2 hasta 60 s, porque al abrir su URL se vio que Render tarda más de 25 s en despertarlo; y, para la transición, la opción que la IA llamó B: el front nuevo manda `avisos: "api"`, la API lo confirma en la respuesta, y para el front anterior se usa un segundo caso de uso que registra sin publicar el evento. Se comprobó con `npm test` (65 pruebas), `npm run arch:check`, `validar-openapi.cjs` y la prueba de punta a punta (15 de 15), con la salida en `docs/evidencias/lab10-bus-conectado.txt`.
- **Qué se descartó y por qué:** La opción A de la IA para la transición, con la bandera solo en la petición: si Cloudflare publicaba el front nuevo antes que Railway la API nueva, esos reclamos se quedaban sin correo. También su recomendación de no conectar M2 porque no responde: el #51 incluye M2, y retirarlo es una decisión del equipo, no de este PR. Y su propuesta de que los cambios del front entraran como un commit de Roy en esta rama: van en el PR de Roy (#46).
- **Registra:** Ricco Rashuaman

### Entrada del 21 de noviembre, el front le pide a la API el correo y el expediente

- **Fecha y tarea:** 20 y 21 de noviembre. Ajustar `useReclamos.ts` y `ReclamosPanel.tsx` para que, con el bus conectado en `server.js` (#58), el correo de confirmación y el expediente a M2 los envíe la API, sin duplicados mientras convivan el front anterior y el nuevo.
- **Herramienta y versión:** Claude Code (Sonnet 5.5).
- **Qué se le pidió:** Quitar las dos llamadas del navegador, como pedía `docs/api/eventos.md`, y reescribir el aviso de la pantalla de éxito.
- **Qué se aceptó:** El primer cambio de la IA quitaba las dos llamadas por completo. Al revisar el #58 de Ricco apareció que su transición exige otra cosa: el front manda `avisos: "api"` y solo envía por su cuenta si la respuesta no lo confirma. Con el cambio original, un reclamo habría quedado sin correo ni expediente. Quedó así: se agrega `avisos: "api"` a la petición, y la llamada a `/api/reclamos/confirmar` y el `fetch` a M2 se hacen solo si la API no confirma. Se conserva `avisoCorreo`, que sigue sirviendo en ese camino. El aviso de la pantalla dice que la confirmación llegará al correo, sin asegurarlo. Se verificó con `tsc --noEmit` y `npm run build`.
- **Qué se descartó y por qué:** Quitar las llamadas sin condición y quitar `avisoCorreo`: eso es lo que habría dejado a los estudiantes sin correo si el front nuevo se desplegaba antes que la API nueva, o al revés. El cambio se prueba de punta a punta solo contra el servidor del #58; el front no tiene pruebas automáticas, así que los cuatro cruces de front y API se describen en `docs/api/eventos.md` pero no se corrieron en un navegador.

### Entrada del 21 de noviembre, contrato acordado de POST /api/reclamos

- **Fecha y tarea:** 21 de noviembre. Issue #61: implementar en el manejador y el caso de uso el contrato de `POST /api/reclamos` que Christopher cerró con el equipo consumidor.
- **Herramienta y versión:** Claude Code (Sonnet 5.5).
- **Qué se le pidió:** Aplicar las siete decisiones de la revisión (códigos estables, 201 y 200 con `Location`, `cursos_descartados`, validación del código UNI y de los documentos, 409 y 503 con `Retry-After`, y 5 000 caracteres) sin tocar lo que se decidió dejar igual, y mantener `avisos`.
- **Qué se aceptó:** Los errores del dominio llevan `codigo`; la política de recepción devuelve el rechazo con su código (pausa 503, ciclo y ventana 409); `sanearCursos` pasó a `clasificarCursos`, que además dice qué descartó y por qué; y se inyecta `esDocumentoPropio`, que en `server.js` es la misma comprobación de `/api/docs/signed-url`. Después de la revisión de Christopher sobre el #62 se agregaron `estado` y `creado_en` al 201, `creado_en` al 200 (el del reclamo original) y el `codigo` del 401 (`SESION_REQUERIDA` y `SESION_INVALIDA`). Para que `creado_en` coincida con lo guardado, el caso de uso escribe `created_at` en la fila, y `buscarDuplicado` ahora devuelve el id y la fecha. Con el contrato acordado ya en `develop` (#63 y #64), se quitaron las tres marcas `x-pendiente` que el validador pedía quitar: descripción larga, código UNI y documento ajeno. Quedan cero pendientes. Se verificó con 80 pruebas, `arch:check`, el validador del contrato y la prueba de punta a punta de Ricco ampliada (22 de 22 contra `server.js` real; `docs/evidencias/lab10-contrato-post-reclamos.txt`).
- **Qué se descartó y por qué:** Aceptar sin verificar las referencias de `documentos` cuando no se inyecta el verificador: ahora se rechazan, para que un olvido no abra la puerta. Tampoco se dejó pasar una clave `evidencias` dentro de `documentos`, que se guardaba sin revisar y permitía apuntar al archivo de otro estudiante. Dos cosas no estaban en el contrato y se decidieron con una suposición, que se pregunta a Christopher: el código de error de una descripción de más de 5 000 caracteres (`DESCRIPCION_DEMASIADO_LARGA`) y que el código UNI solo se valida si viene. Al cambiar la respuesta de crear a 201, los guiones `experimento-resiliencia.js` y `probar-registro-con-bus.mjs` contaban respuestas 200 y habrían dado cero sin avisar; se corrigieron.
- **Registra:** Roy Puris

### Entrada del 21 de noviembre, Lab10: contrato acordado y acta de ambigüedades

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Comparar la versión de `POST /api/reclamos` acordada con el equipo consumidor contra el código y contra el primer contrato (#35); pasarla a `docs/api/openapi.yaml`, junto con el campo `avisos` del #58; redactar `docs/api/acta-ambiguedades.md` y el mensaje con el que se le pidió al consumidor su lista de observaciones; y ampliar el validador para que entienda los errores con `codigo` y los ejemplos marcados `x-pendiente`.
- **Qué parte del contrato salió de la IA:** la redacción en `openapi.yaml` de la versión acordada y de la resolución de los cinco huecos, el esquema `ErrorDeReclamo` (separado del `Error` de las rutas del panel), el orden de las comprobaciones verificado contra el código (el JSON inválido se rechaza antes que la sesión) y la redacción del acta. La versión acordada la trabajaron Ricco y el consumidor.
- **Qué corrigió el equipo:** Christopher decidió cómo se resuelve cada hueco que levantó el consumidor: aclarar el reenvío, mantener la comparación solo por descripción, fijar el orden de las comprobaciones, un máximo de 5 000 caracteres y `Location` en el 200. También decidió qué se implementa (#61) y qué se documenta. El consumidor corrigió dos errores del resumen que le mandamos: que los 409 no se reintentan y que el 200 no desapareció, sino que ahora es el reenvío. Al comparar con la versión acordada, salió que los ejemplos del primer contrato usaban una categoría que no existe («Cruce de horarios») y cursos con secciones que no están en el catálogo; se cambiaron por «Matrícula» y cursos reales. El validador detectó un error de sintaxis YAML en dos descripciones, que se corrigió antes de subir.
- **Registra:** Christopher Albino

### Entrada del 21 de noviembre, códigos de error del cuerpo inválido y del panel (#40)

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Corregir en `server.js` los tres problemas que el contrato documentaba tal como estaban: el cuerpo inválido respondía 500, el modo mantenimiento no creaba su fila, y `signed-url` y los datos del estudiante devolvían el código equivocado. También para sacar la traducción del cuerpo inválido a `presentacion/cuerpoInvalido.js`, con su prueba, y para actualizar el contrato y el acta.
- **Qué se aceptó:** Un solo 400 `CUERPO_INVALIDO` para el JSON roto y para el que pasa de 1 MB, como dice el contrato acordado, en vez de un 400 y un 413. La prueba con `express.json()` de verdad, que comprueba que los tipos de error son los que pone Express y no solo los que supone la prueba. Se probó contra el `server.js` real: JSON roto con y sin sesión, cuerpo de 1,1 MB y una ruta de admin dan 400, y el JSON roto se rechaza antes de mirar la sesión, como dice el contrato.
- **Qué se descartó y por qué:** Probar de punta a punta las tres rutas de admin: sin Firebase local, `requireAdminAuth` responde 500 antes de llegar a ellas, así que se revisaron leyendo el código. Queda pendiente para la suite de E3, que inyecta un verificador falso de Firebase.
- **Registra:** Christopher Albino

## Semana 12 · 21 de noviembre

### Entrada del 21 de noviembre, siembra de reclamos para E2

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Revisar el script de siembra de la issue #54, proteger las filas existentes y comprobar el cambio con Docker Compose.
- **Qué se aceptó:** Una sola inserción en el PostgREST interno para que una colisión cancele todo el lote. La limpieza se limita a las filas identificadas como siembra E2. Se verificó con una colisión en el último ID, una siembra de 1 500 reclamos y la conservación de un reclamo de E1 después de limpiar.
- **Qué se descartó y por qué:** Actualizar filas con IDs repetidos y borrar todos los datos sintéticos antes de sembrar. Eso podía modificar reclamos existentes o borrar evidencia de E1.
- **Registra:** Lenin Castro

### Entrada del 21 de noviembre, Lab09: backend partido en módulos y reglas de límites (#50, primera parte)

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Llevar la partición B al build: declarar los workspaces de npm, mover los archivos del registro de reclamos y de los cursos resueltos a `backend/modulos/reclamos/`, crear el módulo `notificaciones` con los consumidores de `ReclamoRegistrado` y la carpeta `backend/compartido/`, ampliar las reglas de dependency-cruiser de capas a módulos, separar las pruebas por módulo, y ajustar el validador del OpenAPI, la prueba de punta a punta, el experimento de resiliencia y la documentación. También para sacar la evidencia en rojo y en verde.
- **Qué se aceptó:** Crear `notificaciones` para los consumidores, porque el paso 6 del Lab10 pide que vivan fuera de `reclamos` y ninguno de los cinco módulos de la partición calzaba. Lo acordé con Roy, que pidió cuatro cosas más, y se aplicaron: que `notificaciones` no importe el `eventos.js` de reclamos y lea solo `id`, `email`, `nombre` y `categoria`, con una prueba fuera de los módulos que lo compruebe; que la plantilla de los correos vaya a `compartido`; que el puerto de M2 lo defina `notificaciones` y lo implemente `reclamos` (`obtenerParaExpediente`), pasado por `server.js`; y que el evento siga en la versión 1. También se aceptó importar cada módulo por su paquete, con un `exports` que solo deja entrar por `index.js`, para que Node también rechace los imports a partes internas. Antes de escribir las reglas se probó en un proyecto aparte cómo trata dependency-cruiser los workspaces: detecta el cruce entre módulos por paquete y por ruta relativa, y los paquetes que el módulo no declara. Se comprobó con `npm test` (91 pruebas), cada módulo solo con `npm run test:modulos`, `arch:check` en rojo con un import prohibido por regla y en verde sin ellos, ESLint, tsc, el build, `validar-openapi.cjs`, la prueba de punta a punta (22 de 22), el experimento de resiliencia y una copia limpia instalada con `npm ci`. La salida está en `docs/evidencias/lab09-reglas-de-limites.txt`.
- **Qué se descartó y por qué:** Mover en este mismo PR las 39 rutas que siguen en `server.js`: casi no tienen pruebas y el cambio sería demasiado grande para revisarlo de una vez; van en la segunda parte del #50. Que el evento lleve la descripción: cambiaría su contrato, y el puerto alcanza (Roy también lo descartó). El nombre `avisos` que propuso la IA para el módulo: se quedó `notificaciones`, como en el C4. Y mover el catálogo de cursos, porque también lo importa el front.
- **Registra:** Ricco Rashuaman
