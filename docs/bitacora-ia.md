# Bitácora de uso de IA

Equipo 2, TEFIIS. SW708 Arquitectura de Soluciones de Software, 2026-2.

La bitácora registra el uso de IA por semana y las decisiones del equipo.

## Cómo completar una semana

Indicar la herramienta, para qué se usó, qué se aceptó, qué corrigió o descartó el equipo y quién registra la entrada. Si no se usó IA, basta con indicarlo.

| Semana | Papel de la IA según el curso |
| --- | --- |
| 1      | Guía de código ajeno: se verifica cada afirmación contra el código y se anota al menos un error suyo. |
| 2      | Abogada del diablo: los escenarios se escriben a mano y la IA pregunta con qué instrumento se mide cada uno. |
| 3      | Traductora a DSL: de la descripción en prosa al modelo C4. |
| 4      | Generadora de alternativas: las consecuencias las escribe una persona. |
| 5      | No se usa. |
| 6      | No se usa. |
| 7      | Detectora de sobreingeniería: el equipo rechaza por escrito lo que no corresponde. |

## Semana 1 · 5 de setiembre

- **¿Se usó IA?** Sí
- **Herramienta:** Claude
- **Para qué se usó:** Resumir cómo funciona el sistema y aclarar sus conceptos principales.
- **Qué se aceptó:** El resumen y las explicaciones.
- **Qué se descartó y por qué:** Nada: no se detectó ninguna afirmación errónea al leer las respuestas.
- **Registra:** Roy Puris

## Semana 2 · 12 de setiembre

- **¿Se usó IA?** Sí
- **Herramienta:** Claude
- **Para qué se usó:** Revisar las medidas de los cinco escenarios de calidad del módulo M3 (`ESC-M3-01` a `ESC-M3-05`, en [atributos_calidad_M3.md](atributos_calidad_M3.md)).
- **Qué se aceptó:** Las métricas que sugirió Claude para las medidas de los escenarios. Dos de las medidas se cambiaron: en rendimiento (`ESC-M3-02`) se pedía 1 s o menos y quedó en 2 s, y en confiabilidad (`ESC-M3-04`) se pedía que el 100 % de los correos se entregara y quedó en el 95 % dentro de 15 minutos. Lo demás que sugirió se aceptó.
- **Qué se descartó y por qué:** Añadir más escenarios de calidad que no eran tan críticos. Se dejaron solo los más importantes.
- **Registra:** Roy Puris

## Semana 3 · 19 de setiembre

- **¿Se usó IA?** Sí
- **Herramienta:** Antigravity
- **Para qué se usó:** Comparar el borrador de clase con el modelo C4 en Structurizr y revisar sus tres niveles.
- **Qué se aceptó:** La corrección de sintaxis y los ajustes al modelo.
- **Qué se descartó y por qué:** Se descartó la observación sobre Brevo porque el código sí tenía proveedores de respaldo.
- **Registra:** Franz Nuñez

## Semana 4 · 9 de octubre

- **¿Se usó IA?** Sí.
- **Herramienta:** Codex.
- **Para qué se usó:** Proponer alternativas para organizar la API y separar la persistencia de cursos resueltos en los ADR 001 y 002.
- **Qué se aceptó:** La separación por capas dentro de la API existente y la inyección de un repositorio con `obtener` y `guardar`, para probar las reglas sin conectarse a Supabase.
- **Qué se descartó y por qué:** Se descartó mantener las reglas junto a HTTP y almacenamiento. Un microservicio y un ORM excedían lo que necesitaba esta parte del sistema.
- **Registra:** Lenin.

## Semana 5

- **¿Se usó IA?** No.
- **Registra:** Lenin.

## Semana 6 · 14 de octubre

- **¿Se usó IA?** No
- El equipo hizo la refactorización a puertos y adaptadores.
- **Registra:** Ricco Rashuaman

## Semana 7 · 15 al 19 de octubre

### Entrada del 15 de octubre

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Preparar un borrador del informe de la Entrega 1 con el repositorio como fuente.
- **Qué se aceptó:** La estructura del informe, la revisión de los escenarios E1 a E6 y la elección del ADR-0003.
- **Qué se descartó o corrigió:** El equipo reescribió las consecuencias de los ADR porque el curso pide que las redacten sus autores.
- **Registra:** Ricco Rashuaman

### Entrada del 17 al 19 de octubre, escenarios, ficha, interfaz y unión de los repositorios

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Completar la ficha, los escenarios y la interfaz, y preparar la unión de los dos repositorios.
- **Qué se aceptó:** La documentación revisada, la integración del C4 y la unión de ambos historiales.
- **Qué se descartó o corrigió:** Al comparar con el código, el equipo corrigió quién valida el tamaño del PDF y qué pasa con cursos fuera del catálogo. Quitó atribuciones que no pudo confirmar y reescribió las consecuencias de los ADR.
- **Registra:** Christopher Albino

### Entrada del 18 al 19 de octubre, git y consecuencias del ADR-0003

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Preparar preguntas para revisar las consecuencias del ADR-0003.
- **Qué se aceptó:** La guía de preguntas.
- **Qué se descartó o corrigió:** Roy reescribió el borrador y quitó dos supuestas consecuencias que no pudo justificar con la implementación.
- **Registra:** Roy Puris

### Entrada del 19 de octubre, corrección de los escenarios

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Revisar los escenarios E1 a E6 a partir de las observaciones del Equipo 3.
- **Qué se aceptó:** La identificación de pruebas, responsables y medidas, incluida la matriz de E3 y el cálculo de E6.
- **Qué se descartó o corrigió:** El borrador ubicaba el rechazo de una evidencia ajena en la subida del archivo. El equipo comprobó que ocurre al registrar el reclamo y lo corrigió en el PR #5.
- **Registra:** Roy Puris

### Entrada del 19 de octubre, Lab07: patrones y acoplamiento

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Evaluar alternativas de diseño y apoyar la medición del acoplamiento del Lab07.
- **Qué se aceptó:** Una tabla de funciones para el fragmento A, un adaptador para el B y mantener el C tal como estaba. El equipo verificó las métricas.
- **Qué se descartó o corrigió:** Se descartaron patrones que añadían clases o pasos sin resolver el problema. La herramienta contaba por archivo y el equipo rehízo el conteo por carpeta. Ver [fichas](patrones/ficha-decision.md) y [medición](acoplamiento/2026-10-17.md).
- **Registra:** Roy Puris

## Semana 10 · 7 de noviembre

### Entrada del 20 de noviembre, reglas de arquitectura por capas

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Redactar y probar las reglas de dependencias entre capas.
- **Qué se aceptó:** Las dos reglas, tras comprobar que rechazaban dependencias prohibidas y que pasaban al retirarlas.
- **Qué se descartó o corrigió:** Las capturas se guardaron en la carpeta de imágenes para que se puedan ubicar junto a su evidencia.
- **Registra:** Ricco Rashuaman

### Entrada del 20 de noviembre, Lab10: flujo por eventos y entidad de cursos resueltos

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Proponer el contrato del registro, implementar el flujo por eventos y revisar la entidad de cursos resueltos.
- **Qué se aceptó:** La separación entre el registro y sus avisos, y el envío a M2 con tiempo de espera. Christopher contrastó el contrato con el código.
- **Qué se descartó o corrigió:** Se corrigieron errores omitidos, el comportamiento del límite de cursos y los datos enviados a M2. La falta de reintentos quedó documentada en el [flujo por eventos](api/eventos.md). Se conservaron las [pruebas del registro](evidencias/lab10-pruebas.txt).
- **Registra:** Roy Puris

### Entrada del 20 de noviembre, generador de tokens para E1 y E3

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Preparar las sesiones de prueba para E1 y E3 y comprobar qué solicitudes acepta la API.
- **Qué se aceptó:** El script usa datos y una clave de prueba. Se verificaron las sesiones válidas y los rechazos del [PR #32](https://github.com/ricco-drs/sistema-reclamos/pull/32).
- **Qué se descartó o corrigió:** La primera prueba con otra firma enviaba un token vacío. Se repitió con un token generado con otra clave para comprobar el motivo del rechazo.

### Entrada del 20 de noviembre, Lab10: contrato OpenAPI

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Redactar el primer contrato OpenAPI y preparar un validador con el código como referencia.
- **Qué se aceptó:** El contrato de 19 operaciones y las [comprobaciones de ejemplos y mensajes](evidencias/lab10-openapi.txt).
- **Qué se descartó o corrigió:** El validador dejó de detenerse en la primera referencia rota. Los cambios de comportamiento se dejaron para los PR de implementación.

### Entrada del 20 de noviembre, Lab09: particiones del backend

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Comparar dos formas de dividir el backend según los escenarios de calidad.
- **Qué se aceptó:** La partición por negocio, elegida con las prioridades que ya tenía el informe. Ver [particiones](particiones.md).
- **Qué se descartó o corrigió:** Se corrigió un ejemplo que presentaba como exclusiva una dependencia que compartían varios módulos.
- **Registra:** Christopher Albino

### Entrada del 20 de noviembre, plantilla de confirmación del reclamo

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code (Sonnet 5.5)
- **Para qué se usó:** Extraer y probar la plantilla de confirmación del reclamo.
- **Qué se aceptó:** La plantilla común y seis pruebas que confirmaron que el estudiante recibe el mismo contenido.
- **Qué se descartó o corrigió:** Se añadió el correo como respaldo para el saludo porque el nombre no siempre viene con el formato esperado.
- **Registra:** Roy Puris

### Entrada del 20 de noviembre, inmutabilidad real de CursosResueltos

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code (Sonnet 5.5)
- **Para qué se usó:** Reproducir el problema por el que se podían cambiar los cursos resueltos desde fuera de la entidad (#55).
- **Qué se aceptó:** Copiar los datos que entran y salen, proteger el historial y cubrir los casos con pruebas.
- **Qué se descartó o corrigió:** Se descartó proteger solo el objeto principal porque las listas internas todavía se podían modificar.
- **Registra:** Roy Puris

## Semana 11 · 14 de noviembre

### Entrada del 20 de noviembre, identidades de Git

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Revisar las identidades duplicadas del historial y preparar el archivo de equivalencias pedido por el docente.
- **Qué se aceptó:** Las equivalencias comprobadas y los correos institucionales.
- **Qué se descartó o corrigió:** Se descartó cambiar la autoría de commits ya publicados porque Git puede agrupar las contribuciones sin reescribirlos.
- **Registra:** Lenin Castro

### Entrada del 21 de noviembre, arranque reproducible de TEFIIS con Compose

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Preparar el arranque completo con Docker Compose y probarlo desde un clon limpio.
- **Qué se aceptó:** El portal, la API y la base local con datos y sesiones de prueba. Se comprobó el registro y la consulta de reclamos.
- **Qué se descartó o corrigió:** Se corrigieron los permisos del directorio de adjuntos y, tras el PR #29, se repitió el arranque desde una copia limpia.
- **Evidencia:** [Portal de TEFIIS levantado en Compose](evidencias/img/lab11-compose.jpg).
- **Registra:** Lenin Castro

### Entrada del 20 de noviembre, conexión del bus y del correo con timeout en server.js

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Integrar el registro por eventos y preparar la convivencia entre las versiones del portal y la API.
- **Qué se aceptó:** La API confirma si se hará cargo de los avisos. Las [pruebas](evidencias/lab10-bus-conectado.txt) verificaron el registro y el envío de correo y expediente.
- **Qué se descartó o corrigió:** Se descartó depender solo de la solicitud del portal porque, si se desplegaba antes que la API, el reclamo podía quedarse sin confirmación. Se mantuvo M2 en el alcance.
- **Registra:** Ricco Rashuaman

### Entrada del 21 de noviembre, el front le pide a la API el correo y el expediente

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code (Sonnet 5.5)
- **Para qué se usó:** Actualizar el portal para que la API envíe los avisos y ajustar el mensaje de confirmación.
- **Qué se aceptó:** El portal delega el envío cuando la API lo confirma y usa el camino anterior si no recibe esa confirmación. Se comprobó la compilación.
- **Qué se descartó o corrigió:** Quitar las dos llamadas de inmediato habría dejado reclamos sin correo ni expediente durante la transición. Los cruces de versiones se documentaron, pero no se probaron en un navegador.

### Entrada del 21 de noviembre, contrato acordado de POST /api/reclamos

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code (Sonnet 5.5)
- **Para qué se usó:** Aplicar el contrato de registro acordado con el equipo consumidor (#61).
- **Qué se aceptó:** Los códigos de respuesta acordados, la información del reclamo y la validación de los documentos. Se actualizó la [prueba de punta a punta](evidencias/lab10-contrato-post-reclamos.txt) del PR #62.
- **Qué se descartó o corrigió:** Se rechazaron documentos sin comprobación de propiedad. También se corrigieron los guiones que seguían contando solo respuestas 200 después de que el registro pasó a 201.
- **Registra:** Roy Puris

### Entrada del 21 de noviembre, Lab10: contrato acordado y acta de ambigüedades

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Documentar el acuerdo con el consumidor y preparar el acta y sus comprobaciones.
- **Qué se aceptó:** La redacción del contrato y del acta. Las decisiones fueron del equipo y del consumidor. Ver [acta de ambigüedades](api/acta-ambiguedades.md).
- **Qué se descartó o corrigió:** El consumidor aclaró que el 200 se conserva para reenvíos y que los 409 no se reintentan. El equipo corrigió ejemplos con categorías y secciones que no existían.
- **Registra:** Christopher Albino

### Entrada del 21 de noviembre, códigos de error del cuerpo inválido y del panel (#40)

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Ajustar las respuestas del servidor que se habían documentado como problemas en el contrato (#40).
- **Qué se aceptó:** La respuesta 400 acordada para cuerpos inválidos y la prueba de que se devuelve antes de revisar la sesión.
- **Qué se descartó o corrigió:** Las rutas administrativas se revisaron en el código porque el entorno no tenía Firebase local. Esa limitación quedó registrada para E3.
- **Registra:** Christopher Albino

## Semana 12 · 21 de noviembre

### Entrada del 21 de noviembre, siembra de reclamos para E2

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Revisar la siembra de E2 y probar que protege los reclamos existentes (#54).
- **Qué se aceptó:** Insertar los datos de prueba juntos y limitar la limpieza a las filas marcadas como siembra de E2.
- **Qué se descartó o corrigió:** Se descartó actualizar IDs repetidos o borrar todos los datos sintéticos porque se podían alterar reclamos previos y evidencia de E1.
- **Registra:** Lenin Castro

### Entrada del 21 de noviembre, Lab09: backend partido en módulos y reglas de límites (#50, primera parte)

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Preparar los módulos del backend y sus reglas de dependencias para la primera parte del #50.
- **Qué se aceptó:** Separar las notificaciones de reclamos, mantener la versión del evento y comprobar los límites con casos permitidos y prohibidos. Ver [partición](particiones.md) y [pruebas de las reglas](evidencias/lab09-reglas-de-limites.txt).
- **Qué se descartó o corrigió:** Se dejó el traslado de las rutas restantes para otro PR. Se descartó ampliar el evento con datos que el consumidor ya podía consultar.
- **Registra:** Ricco Rashuaman

### Entrada del 22 de noviembre, Lab09 y partición completa del backend (#50)

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Trasladar las rutas restantes a sus módulos y conectarlas desde el arranque (#50).
- **Qué se aceptó:** La distribución por negocio. Se compararon rutas y requisitos de sesión antes y después del traslado.
- **Qué se descartó o corrigió:** Se mantuvo la confirmación anterior porque el portal todavía la usa durante la transición.
- **Registra:** Lenin Castro

### Entrada del 23 de noviembre, registro por eventos en Compose (#51)

- **¿Se usó IA?** Sí
- **Herramienta:** Codex
- **Para qué se usó:** Preparar proveedores simulados de correo y M2 y probar el registro por eventos en Compose (#51).
- **Qué se aceptó:** La configuración de pruebas que permite verificar el expediente, el reintento y los distintos tiempos de respuesta del correo.
- **Qué se descartó o corrigió:** Se descartó activar los simuladores en el Compose base para que el arranque habitual del laboratorio siga siendo el mismo.
- **Registra:** Lenin Castro

### Entrada del 24 de noviembre, interfaces de la API generadas desde el contrato (Lab10, paso 4)

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code (Sonnet 5.5)
- **Para qué se usó:** Generar y verificar el cliente TypeScript a partir del contrato del Lab10.
- **Qué se aceptó:** La generación del cliente y su [comprobación contra la API de Compose](evidencias/lab10-interfaces-generadas.txt). El equipo mantuvo la distinción entre registro y reenvío.
- **Qué se descartó o corrigió:** En el PR #72 se corrigió la pérdida del cliente anterior cuando fallaba la generación y la falta de acceso a la cabecera Location desde el navegador.
- **Registra:** Roy Puris

### Entrada del 24 de noviembre, validación del modelo C4 contra la partición modular y el flujo de eventos (#53)

- **¿Se usó IA?** Sí
- **Herramienta:** Antigravity
- **Para qué se usó:** Comparar el C4 con la división real del backend y el flujo de avisos (#53).
- **Qué se aceptó:** Los siete módulos y sus dependencias verificadas. La revisión del PR #70 corrigió las relaciones y se actualizaron las vistas.
- **Qué se descartó o corrigió:** Se retiraron cajas de la arquitectura anterior y se corrigió una flecha que indicaba una dependencia prohibida. Ver [modelo C4](c4/README.md).
- **Registra:** Franz Nuñez

### Entrada del 24 de noviembre, Circuit Breaker con opossum y experimento antes y después en Compose (#33)

- **¿Se usó IA?** Sí
- **Herramienta:** Antigravity
- **Para qué se usó:** Añadir un circuito de protección por proveedor y apoyar el experimento de resiliencia del correo (#33).
- **Qué se aceptó:** El cambio pasó las pruebas con tráfico continuo y espaciado, y se comprobó que el envío se recupera cuando vuelve el proveedor. Ver [informe de resiliencia](resiliencia.md).
- **Qué se descartó o corrigió:** Se descartó contar direcciones inválidas como fallos del proveedor y se amplió la ventana de observación porque la anterior no detectaba bien los fallos espaciados.
- **Registra:** Franz Nuñez

### Entrada del 25 de noviembre, carga de E2, línea base, diagnóstico y mejora (Lab12, #77 y #78)

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code (Opus 5.5)
- **Para qué se usó:** Preparar la carga, medir la línea base y probar la paginación de la bandeja (#77 y #78).
- **Qué se aceptó:** La medición antes y después en las mismas condiciones. El equipo comprobó los reclamos faltantes y corrigió el recolector para que reconociera las páginas nuevas. Ver [informe E2](mediciones/informe.md).
- **Qué se descartó o corrigió:** Se descartó simular la autenticación dentro de la API y se usó el emulador de Firebase. La hipótesis ubicó el problema, pero estimó una latencia mayor que la observada.
- **Registra:** Ricco Rashuaman

### Entrada del 25 de noviembre, cierre del informe de medición antes y después de E2 y decisión (Lab12, #79)

- **¿Se usó IA?** Sí
- **Herramienta:** Antigravity
- **Para qué se usó:** Contrastar las corridas de E2 y completar la comparación y la decisión del Lab12 (#79).
- **Qué se aceptó:** Conservar la paginación. Las corridas válidas cumplieron el umbral y devolvieron los 1 500 reclamos. Tras el PR #84 se corrigieron el horario de la medición y la explicación de las consultas. Ver [resultados](mediciones/informe.md).
- **Qué se descartó o corrigió:** Se excluyó la primera corrida, como pide la pauta, y se descartó agregar un índice porque la mayor parte del tiempo se gastaba al preparar la respuesta.
- **Registra:** Franz Nuñez

### Entrada del 25 de noviembre, el generador de interfaces sin el envoltorio de npm (Lab10)

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code (Sonnet 5.5)
- **Para qué se usó:** Corregir el bloqueo que Christopher observó al verificar el cliente generado.
- **Qué se aceptó:** Ejecutar el generador directamente, comprobar el archivo descargado y fijar un tiempo límite. Se verificó con las dos versiones del contrato que se usaban en los PR #82 y #83.
- **Qué se descartó o corrigió:** Se descartó conservar el envoltorio de npm y usar una descarga sin verificar. El bloqueo original no se reprodujo en la máquina de Roy.
- **Registra:** Roy Puris

### Entrada del 25 de noviembre, Lab10: respuestas de los interruptores con nombre y equipo consumidor en el acta

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Nombrar las respuestas de los interruptores en OpenAPI y completar el acta del Lab10.
- **Qué se aceptó:** Los nombres nuevos y la versión 2.0.1. El cliente regenerado coincidió con el contrato. Ver [acta](api/acta-ambiguedades.md).
- **Qué se descartó o corrigió:** Christopher confirmó con Benjamín que el consumidor era el Equipo 4. También repitió la comparación contra la versión guardada en Git.
- **Registra:** Christopher Albino
