# Escenarios de calidad

Sección 2 del informe de la Entrega 1 (SW708, equipo 2). Parte de los cinco escenarios del módulo M3 que ya estaban en el repositorio ([atributos_calidad_M3.md](atributos_calidad_M3.md)).

Al contrastarlos con el código encontramos que varios describen un sistema que no existe: el correo no sale por un servidor SMTP institucional sino por tres proveedores con API HTTP, no hay reintentos cada cinco minutos y no hay asignación automática de casos. Los reescribimos sobre el comportamiento real y agregamos a cada medida el instrumento con que se comprueba.

La regla que nos dimos: **si no sabemos con qué herramienta se va a medir, el escenario no está terminado.** Los escenarios de carga y de resiliencia se ejecutan contra el entorno de Docker Compose de la semana 11, nunca contra producción.

## Resumen

| # | Atributo | Estímulo | Medida | Instrumento | Semana |
|---|---|---|---|---|---|
| E1 | Disponibilidad | 200 estudiantes envían su reclamo en la última hora del plazo | 0 perdidos, 0 números repetidos, 0 duplicados, < 1 % de 5xx | k6 y consulta SQL | 12 |
| E2 | Rendimiento | 10 miembros del Tercio abren la bandeja con 1 500 reclamos | p95 < 1,5 s y 0 reclamos faltantes | k6 y `count(*)` | 12 |
| E3 | Seguridad | Un estudiante pide un reclamo ajeno; una cuenta de solo lectura intenta escribir | 100 % rechazados con el código esperado | Suite de autorización en `node:test` | 10 |
| E4 | Modificabilidad | El Tercio pide cambiar una regla de cursos resueltos | 0 archivos fuera de `dominio/` y `tests/`; pruebas en < 5 s sin red | `git diff --stat` y regla `dominio-limpio` | Ya se cumple |
| E5 | Confiabilidad | Brevo deja de aceptar envíos | ≥ 99 de 100 correos enviados por otro proveedor | Experimento en Docker Compose y registros `[EMAIL]` | 11 |
| E6 | Auditabilidad | Preguntan quién decidió matricular o retirar un curso | 100 % de decisiones con autor y fecha | Prueba HTTP en CI y consulta SQL | Ya se cumple |

## E1. Disponibilidad: cierre del plazo de reclamos

| Parte | Contenido |
|---|---|
| Fuente | 200 estudiantes de la FIIS en la última hora del plazo de reclamos de matrícula, muchos desde la red de la UNI y con una sola IP pública. |
| Estímulo | Envían su reclamo casi al mismo tiempo; algunos lo repiten por un doble clic o porque la red falló. |
| Artefacto | Ruta `POST /api/reclamos` de la API, función `siguiente_id_reclamo()` ([sql/secuencia_reclamos.sql](../sistema-reclamos/sql/secuencia_reclamos.sql)) y tabla `reclamos` en PostgreSQL. |
| Entorno | Hora punta, con una sola instancia de la API. |
| Respuesta | Cada reclamo recibe un número único `REC-2026-NNNN` y queda guardado. Un reenvío idéntico del mismo estudiante dentro de 10 minutos devuelve el número ya asignado en lugar de crear otro reclamo. Si no se logra asignar un número tras 10 intentos, la API responde 503 con un mensaje que invita a reintentar. |
| Medida | 0 reclamos perdidos, 0 números repetidos, 0 reclamos duplicados por reenvío y menos del 1 % de respuestas 5xx. Se comprueba con k6 (200 usuarios virtuales durante 5 minutos, con un 10 % de reenvíos) y con una consulta SQL que cruza las respuestas exitosas de k6 con las filas creadas. Semana 12. |

## E2. Rendimiento: bandeja del panel del Tercio

| Parte | Contenido |
|---|---|
| Fuente | Hasta 10 miembros del Tercio a la vez. |
| Estímulo | Abren o recargan la bandeja de reclamos del panel. |
| Artefacto | Ruta `GET /api/admin/reclamos` y tabla `reclamos`. |
| Entorno | Cierre de matrícula, con 1 500 reclamos de ejemplo en la tabla. |
| Respuesta | El panel recibe todos los reclamos, sin que falte ninguno. |
| Medida | Latencia p95 menor a 1,5 s y 0 reclamos faltantes: el total listado coincide con `count(*)` de la tabla. Se mide con k6 (10 usuarios virtuales durante 3 minutos) antes y después de una sola mejora. Semana 12. |

## E3. Seguridad: acceso a reclamos ajenos

| Parte | Contenido |
|---|---|
| Fuente | Un estudiante con sesión válida, o una cuenta del panel configurada como de solo lectura. |
| Estímulo | El estudiante pide el detalle de un reclamo que no es suyo o adjunta la evidencia de otro estudiante; la cuenta de solo lectura intenta cambiar el estado de un reclamo. |
| Artefacto | Middlewares `requireStudentAuth` y `requireAdminAuth`, y las consultas filtradas por el correo de la sesión, en [backend/server.js](../sistema-reclamos/backend/server.js). |
| Entorno | Operación normal, con tokens válidos. |
| Respuesta | Se rechaza la operación sin revelar datos: 404 para el reclamo ajeno, sin distinguir entre «no existe» y «no es tuyo»; 403 para la evidencia ajena y para cualquier escritura desde una cuenta de solo lectura. El correo que decide de quién son los datos sale siempre del token, nunca del cuerpo de la petición. |
| Medida | 100 % de los intentos rechazados con el código esperado y 0 campos del reclamo ajeno en la respuesta. Se comprueba con una suite de autorización en `node:test`, de al menos 8 casos, que correrá en CI. Hoy esa suite no existe. Semana 10. |

## E4. Modificabilidad: cambiar una regla de cursos resueltos

| Parte | Contenido |
|---|---|
| Fuente | El Tercio. |
| Estímulo | Pide cambiar una regla de los cursos resueltos; por ejemplo, conservar 100 entradas de historial en lugar de 50, o aceptar más de 40 cursos por lista. |
| Artefacto | Dominio de la rodaja: [backend/dominio/cursosResueltos.js](../sistema-reclamos/backend/dominio/cursosResueltos.js) y sus pruebas. |
| Entorno | Tiempo de desarrollo, con el sistema en producción. |
| Respuesta | El cambio se hace en el dominio y se prueba sin Supabase, sin Firebase y sin credenciales. No cambian el adaptador, el handler, el contrato HTTP ni el panel. |
| Medida | 0 archivos modificados fuera de `backend/dominio/` y `backend/tests/`, y `npm test` en verde en menos de 5 s sin red (hoy: 12 pruebas en 0,07 s). Se comprueba con `git diff --stat` entre el commit anterior y el del cambio, y con la regla `dominio-limpio` en CI. |

## E5. Confiabilidad: falla del proveedor de correo

| Parte | Contenido |
|---|---|
| Fuente | Brevo, el proveedor principal de correo, deja de aceptar envíos porque se agotó la cuota del día o porque está caído. |
| Estímulo | El sistema debe enviar un código de verificación, la confirmación de un reclamo o la respuesta del Tercio. |
| Artefacto | Función `sendEmail` de la API, con la cadena de proveedores Brevo, Resend y Mailjet. |
| Entorno | Operación normal, con falla de un servicio externo. |
| Respuesta | El correo sale por el siguiente proveedor disponible sin que nadie intervenga. Si fallan los tres, la API responde con error y el panel lo muestra. La respuesta al estudiante solo queda en el historial (`respuestas_reclamo`) si el correo salió. |
| Medida | Al menos 99 de 100 envíos aceptados por algún proveedor con Brevo deshabilitado, menos de 3 s de demora adicional por el cambio de proveedor y 0 respuestas en el historial sin correo enviado. Se comprueba con un experimento de resiliencia en Docker Compose (clave de Brevo inválida y un buzón de prueba) y con los registros `[EMAIL]` del servidor. Semana 11. |

## E6. Auditabilidad: quién decidió y cuándo

| Parte | Contenido |
|---|---|
| Fuente | La coordinación de la facultad, o un estudiante que cuestiona una decisión. |
| Estímulo | Pregunta quién decidió matricular o retirar un curso-sección de un reclamo, quién cambió su estado y cuándo. |
| Artefacto | Historial dentro de la columna `reclamos.cursos_resueltos`, tabla `activity_log` y tabla `respuestas_reclamo`. |
| Entorno | Operación normal, reclamos del ciclo en curso. |
| Respuesta | Cada decisión sobre cursos, cada cambio de estado y cada respuesta enviada queda registrada con su autor, tomado del token verificado y no del cuerpo de la petición, y con su fecha y detalle. Un reclamo en estado `MATRICULADO` ya no puede cambiar de estado (409). |
| Medida | 100 % de las decisiones con autor y fecha; el autor registrado coincide con la identidad autenticada aunque el cuerpo diga otra cosa. Se comprueba con la prueba HTTP *comunica resultado y registra auditoría con identidad autenticada*, que ya corre en CI, y con una consulta SQL sobre `activity_log`. |

## Priorización

Puntuamos cada escenario por su impacto en el estudiante (qué pasa si no se cumple) y por su dificultad técnica (cuánto cuesta cumplirlo). La prioridad sale del impacto; la dificultad nos dice cuánto esfuerzo reservar.

| Prioridad | Escenario | Impacto | Dificultad | Decisión que lo atiende |
|---|---|---|---|---|
| 1 | E1 Disponibilidad | Alto | Alta | [ADR-0003](adr/): la secuencia de PostgreSQL numera los reclamos. |
| 2 | E4 Modificabilidad | Alto | Media | [ADR-0001 y ADR-0002](adr/), vigilados por la regla `dominio-limpio`. |
| 3 | E6 Auditabilidad | Alto | Baja | ADR-0002: el caso de uso registra autor y fecha en el historial; el autor sale del token. |
| 4 | E3 Seguridad | Alto | Media | Controles existentes en `requireStudentAuth` y `requireAdminAuth`; la evidencia automatizada llega en la semana 10. |
| 5 | E5 Confiabilidad | Medio | Baja | Cadena de proveedores de correo, anterior a este ciclo; se pone a prueba en la semana 11. |
| 6 | E2 Rendimiento | Medio | Media | Se mide en la semana 12 antes de optimizar nada. |

Esa prioridad guió las decisiones. Perder un reclamo en el cierre de matrícula puede dejar a un estudiante sin sus cursos, así que E1 va primero y es el único escenario que justificó poner lógica en la base de datos: en el ADR-0003 aceptamos depender de una función de PostgreSQL a cambio de una numeración atómica. E4 va segundo porque es el que más frena al equipo: cualquier cambio de reglas pasaba por un archivo de 2 351 líneas y no se podía probar sin credenciales. Atenderlo motivó el ADR-0001 y el ADR-0002, y por él aceptamos más archivos y una composición manual. E6 casi no cuesta, porque los registros ya existían, y la rodaja lo refuerza al tomar el autor del token. E3 tiene impacto alto, pero sus controles ya funcionan en producción; lo que falta es la prueba automatizada. E5 y E2 se medirán antes de cambiar nada.

## Riesgos que las mediciones tienen que confirmar o descartar

- **E1.** La comprobación de reenvíos lee primero y escribe después: busca un reclamo del mismo correo con la misma descripción en los últimos 10 minutos y, si no lo encuentra, inserta. Si las dos peticiones de un doble clic llegan a la vez, las dos pueden no encontrar nada y crear dos reclamos. La prueba de k6 tiene que incluir reenvíos simultáneos, no solo reenvíos espaciados.
- **E2.** La ruta del panel pide `select=*` sin paginar, y el propio `server.js` documenta en `sbRestTodo` que PostgREST corta las respuestas en 1 000 filas sin avisar. Si ese límite sigue activo, con más de 1 000 reclamos el panel dejaría de mostrar los más antiguos.
- **E6.** `logActividad` no espera ni reintenta, así que si Supabase falla en ese instante la decisión se guarda pero su registro en `activity_log` se pierde. El historial dentro de `cursos_resueltos`, en cambio, se guarda junto con la decisión.
