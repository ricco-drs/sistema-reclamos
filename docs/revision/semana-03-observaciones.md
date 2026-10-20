# Observaciones del docente · Semana 03

Revisión hecha el sábado 19 de setiembre de 2026 sobre los dos repositorios que el equipo declaró por correo: `sistema-reclamos` y `sistema-admin`.

Llega a tiempo: el Lab03 vence el miércoles 23 a las 23:59, así que todo lo de acá se puede corregir antes de la entrega.

Este archivo no se corrige solo: cada punto se atiende con un commit, y este pull request se cierra cuando el equipo responda acá mismo qué hizo con cada uno. Lo que decidan no hacer también vale, siempre que quede escrito el porqué.

## Lo que está bien hecho

- **El sistema es real y es ambicioso.** TEFIIS resuelve un problema concreto de la facultad, con un asistente que consulta el reglamento. Da material de sobra para todo el ciclo.
- **El backend maneja bien los secretos.** En `backend/server.js`, las claves de Brevo, Resend, Mailjet y del proveedor de IA salen de variables de entorno, nunca escritas en el código. Eso está bien hecho y no es lo común.
- **Ya tienen documentación de arquitectura del curso anterior**, y es buena base: `docs/atributos_calidad_M3.md` trae cinco escenarios con las seis partes y con medidas numéricas, y `docs/arquitectura_c4_M3.md` describe los tres niveles de C4.
- El README de este repositorio explica qué es el sistema. Corrijan nomás la línea suelta que quedó con una «a».

## 1. El proyecto está partido en dos repositorios

El curso trabaja sobre **un solo repositorio** por equipo. Con dos, el historial, los diagramas, los ADR y la evidencia quedan partidos, y la mitad del trabajo no se ve al calificar.

Dos salidas, las dos válidas:

- **Unirlos:** traer `sistema-admin` dentro de este repositorio, como una carpeta más. Es lo más simple.
- **Declarar uno como el del proyecto** y tratar al otro como lo que es en el modelo C4: un contenedor más del mismo sistema, o un sistema externo. Esa decisión, escrita, ya es un ADR de la semana 4.

Lo que no puede quedar es la situación de hoy: dos repositorios sin nada que los relacione.

## 2. Un solo commit y un solo autor

Cada repositorio tiene **un único commit**, «Version inicial...», del 16 de setiembre, y de una sola persona. Los otros cuatro integrantes no tienen ni un commit en ninguno de los dos.

El trabajo puede estar hecho, pero no hay forma de verlo, y el repositorio es la evidencia del curso. Desde esta semana, cada integrante debe aparecer en el historial con lo que le tocó.

Un volcado inicial de todo el sistema se entiende. Lo que no se entiende es que tres días después siga sin haber un segundo commit.

## 3. Falta la entrega de las semanas 2 y 3

En el repositorio no están los archivos que pide el curso:

- `docs/ficha-del-sistema.md` con los nueve campos.
- `docs/escenarios.md` con los cinco escenarios, la crítica cruzada recibida y la tabla de priorización.
- `docs/bitacora-ia.md`.
- `docs/c4/` con la fuente del modelo, las tres figuras y la leyenda.

Lo que hay es la documentación del curso anterior (`*_M3.md`), que **sirve de insumo pero no reemplaza la entrega**:

- Los cinco escenarios de `atributos_calidad_M3.md` están bien formados y se pueden reusar casi enteros. Falta pasarlos al formato del curso, agregarles la observación del equipo que los revisó y la tabla de priorización con su sustento.
- `arquitectura_c4_M3.md` describe los tres niveles **en prosa**. El Lab03 pide que el modelo esté escrito como fuente versionada (Structurizr DSL, PlantUML o Mermaid), que las figuras se generen desde ahí, y una leyenda que diga qué se dejó afuera a propósito y qué notó el equipo del sistema al dibujarlo.

## 4. El profesor todavía no es colaborador

El correo del coordinador decía que me agregarían. No pasó en ninguno de los dos repositorios. Hoy puedo leerlos porque son públicos, pero si algún día los hacen privados, para efectos de la nota desaparecen. Agréguenme con permiso de lectura: `elionavarretev`.

## 5. El repositorio pesa 111 MB

`documentos_entrenamiento/` son 48 MB de PDF de reglamentos, y el historial ya arrastra ese peso. Clonar el proyecto toma minutos, y cada integrante nuevo lo paga.

Ese corpus es la fuente del asistente, así que la pregunta no es si sirve, sino si tiene que vivir en el repositorio. Alternativas: dejar solo un índice con los enlaces oficiales, o moverlo al almacenamiento que ya usan y documentar de dónde sale. Otra decisión que da para un ADR.

## 6. La clave de Firebase escrita en el código

En `sistema-admin/src/firebase.js` está la `apiKey` de Firebase escrita en el archivo. Para ser justos: **esa clave web no es una contraseña**, es un identificador público del proyecto y Google la expone a propósito en el cliente. O sea, no es el mismo caso que una contraseña filtrada.

Dicho eso, dos cosas sí importan:

- Que salga a variable de entorno, por consistencia con el resto del proyecto.
- Y, sobre todo, que revisen **las reglas de seguridad de Firebase**, que son lo que de verdad protege los datos. Con reglas abiertas, esa clave alcanza para leer todo.

## 7. Sin ramas ni pull requests, y el README del admin es la plantilla

- Ningún cambio de este proyecto lo ha revisado otra persona. Desde esta semana: una rama por tarea, un pull request por rama y revisión de alguien que no la escribió.
- Commits con la convención: `tipo(alcance): descripción`, con `feat`, `fix`, `docs`, `refactor`, `test` o `chore`.
- El README de `sistema-admin` sigue siendo el texto de la plantilla de Vite en inglés.

## Prioridad sugerida

| Orden | Punto | Por qué primero |
|---|---|---|
| 1 | Decidir uno o dos repositorios (1) | De eso depende dónde va todo lo demás |
| 2 | Ficha, escenarios, bitácora y C4 (3) | Es lo que se entrega el miércoles |
| 3 | Que cada integrante aparezca en el historial (2) | Sin eso no hay cómo calificar el trabajo de cada uno |
| 4 | Agregarme como colaborador (4) | Cuesta un minuto |
| 5 | Peso del repositorio y reglas de Firebase (5 y 6) | Se pueden sustentar como decisiones en la semana 4 |

Los puntos 1, 5 y 6 son candidatos naturales a los tres ADR de la semana 4.

Elio Navarrete · SW708 Arquitectura de Soluciones de Software
