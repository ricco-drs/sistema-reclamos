# Recorrido cognitivo de TEFIIS (Lab07, SW708)

**Equipo que levantó el acta:** Equipo 3
**Preguntas:** P1 ¿intentará hacer lo correcto? · P2 ¿verá que la acción existe? · P3 ¿relacionará la acción con su meta? · P4 ¿notará que avanzó?

Solo se anotan los «no». Los demás pasos pasaron las cuatro preguntas.

## Tarea 1: registrar un reclamo de matrícula

Pasos: 1 Inicio (Hola, soy Tefi) → 2 Correo @uni.pe → 3 Código → 4 Menú «¿Qué deseas hacer?» → 5 Reclamos (¿llegaste a matricularte?) → 6 Reclamo registrado.

| Paso | Pregunta que falló | Lo que se observó |
|---|---|---|
| 5. Reclamos | P3 | La pantalla pregunta «¿llegaste a matricularte?» antes de que el usuario haya dicho cuál es su problema. Los botones «Sí me matriculé» y «No me matriculé» son respuestas a una pregunta, no suenan a «registrar mi reclamo». |
| 5 → 6 (tras Sí/No) | P4 | No hay pantalla entre responder Sí/No y «Reclamo registrado». El usuario nunca describe su problema y aun así el sistema dice que el caso fue enviado a la FIIS. Tampoco se dibuja qué pasa con «No me matriculé». |

## Tarea 2: saber hasta cuándo se puede hacer retiro de un curso

Pasos: 1 Inicio → 2 Correo → 3 Código → 4 Menú → 5 Conversación («¿En qué puedo ayudarte?») → 6 Respuesta de Tefi.

| Paso | Pregunta que falló | Lo que se observó |
|---|---|---|
| 1. Inicio | P1 | La única acción es «Iniciar sesión», y el texto dice que es «para poder registrar tu reclamo». Alguien que solo quiere hacer una consulta no ve que ese sea su camino. |
| 4. Menú | P1 | Las únicas opciones son «Hacer un reclamo» y «Consultar reclamos anteriores». No hay ninguna opción para hacer una consulta. |
| 4. Menú | P2 | El acceso a la consulta es la pestaña «Conversación», en texto pequeño en la barra superior. En esta pantalla la sección subrayada es «Reclamos», no «Conversación». |
| 4. Menú | P3 | La etiqueta «Conversación» no suena a «saber hasta cuándo puedo retirarme». |
| 6. Respuesta | P4 | Tefi responde «hasta el 02-10». El formato es ambiguo (¿2 de octubre o 10 de febrero?), no tiene año y no dice a qué curso se refiere. El usuario no sabe con certeza si ya cumplió su meta. |

**Nota:** en los bocetos no aparece ningún paso intermedio después de «Sí me matriculé» / «No me matriculé», y eso se anotó como falta de feedback.
