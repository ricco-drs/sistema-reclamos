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

| Semana | Papel de la IA según el curso |
|---|---|
| 1 | Guía de código ajeno: se verifica cada afirmación contra el código y se anota al menos un error suyo. |
| 2 | Abogada del diablo: los escenarios se escriben a mano y la IA pregunta con qué instrumento se mide cada uno. |
| 3 | Traductora a DSL: de la descripción en prosa al modelo C4. |
| 4 | Generadora de alternativas: las consecuencias las escribe una persona. |
| 5 | No se usa. |
| 6 | No se usa. |
| 7 | Detectora de sobreingeniería: el equipo rechaza por escrito lo que no corresponde. |

## Semana 1 · 5 de setiembre

- **¿Se usó IA?** POR COMPLETAR
- **Herramienta:** POR COMPLETAR
- **Para qué se usó:** POR COMPLETAR
- **Qué se aceptó:** POR COMPLETAR
- **Qué se descartó y por qué:** POR COMPLETAR. Debe incluir al menos un error de la IA verificado contra el código.
- **Registra:** POR COMPLETAR

## Semana 2 · 12 de setiembre

- **¿Se usó IA?** POR COMPLETAR
- **Herramienta:** POR COMPLETAR
- **Para qué se usó:** POR COMPLETAR. Qué se le preguntó sobre los escenarios.
- **Qué se aceptó:** POR COMPLETAR
- **Qué se descartó y por qué:** POR COMPLETAR
- **Registra:** POR COMPLETAR

## Semana 3 · 19 de setiembre

- **¿Se usó IA?** POR COMPLETAR
- **Herramienta:** POR COMPLETAR
- **Para qué se usó:** POR COMPLETAR. Qué se le pidió para pasar el modelo C4 a Structurizr DSL.
- **Qué se aceptó:** POR COMPLETAR
- **Qué se descartó y por qué:** POR COMPLETAR. Qué hubo que corregir.
- **Registra:** POR COMPLETAR

## Semana 4 · 9 de octubre

- **¿Se usó IA?** Sí
- **Herramienta:** POR COMPLETAR
- **Para qué se usó:** Revisar los repositorios, proponer alternativas, redactar dos ADR y explicar la decisión, los descartes y las consecuencias. La decisión y las consecuencias deben ser revisadas por el grupo.
- **Qué se aceptó:** POR COMPLETAR. Qué alternativas propuso la IA se tomaron.
- **Qué se descartó y por qué:** POR COMPLETAR. Qué alternativas se refutaron.
- **Registra:** POR COMPLETAR

## Semana 5

- **¿Se usó IA?** POR COMPLETAR. Declarar «No se usó asistente» en el cuadro del costo del cambio y en la rodaja vertical, si es cierto.
- **Herramienta:** POR COMPLETAR
- **Para qué se usó:** POR COMPLETAR
- **Qué se aceptó:** POR COMPLETAR
- **Qué se descartó y por qué:** POR COMPLETAR
- **Registra:** POR COMPLETAR

## Semana 6 · 14 de octubre

- **¿Se usó IA?** No
- **Herramienta:** Ninguna.
- **Para qué se usó:** No se realizó el uso de un asistente en la refactorización a puertos y adaptadores.
- **Qué se aceptó:** No aplica.
- **Qué se descartó y por qué:** No aplica.
- **Registra:** POR COMPLETAR

## Semana 7 · 15 al 19 de octubre

### Entrada del 15 de octubre

- **¿Se usó IA?** Sí
- **Herramienta:** Claude Code
- **Para qué se usó:** Primer borrador del informe de la Entrega 1 a partir del contenido del repositorio.
- **Qué se aceptó:** La reescritura de los escenarios de calidad sobre el comportamiento real del código (E1 a E6), la elección del ADR-0003 (la secuencia de PostgreSQL que numera los reclamos) y la estructura del informe.
- **Qué se descartó y por qué:** Las consecuencias de los tres ADR, porque el curso exige que las escriba el equipo. El ADR-0003 ya fue reescrito por quien lo firma.
- **Registra:** POR COMPLETAR

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
- **Qué se descartó y por qué:** La matriz de E3 ponía `POST /api/reclamos/evidencias` como la ruta que rechaza la evidencia ajena, pero esa ruta solo sube el archivo a la carpeta del propio estudiante. El rechazo está en `POST /api/reclamos`; la corrección se pidió en la revisión del PR #5. Se encontró al revisar el borrador contra el código, con apoyo de Claude Code.
- **Registra:** Roy Puris
