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
