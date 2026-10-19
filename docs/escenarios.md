# Escenarios de calidad

Sección 2 del informe de la Entrega 1 (SW708, equipo 2). Parte de los cinco escenarios del módulo M3 que ya estaban en el repositorio ([atributos_calidad_M3.md](atributos_calidad_M3.md)).

Al contrastarlos con el código encontramos que varios describen un sistema que no existe: el correo no sale por un servidor SMTP institucional sino por tres proveedores con API HTTP, no hay reintentos cada cinco minutos y no hay asignación automática de casos. Los reescribimos sobre el comportamiento real y agregamos a cada medida el instrumento con que se comprueba.

Después los sometimos a la crítica cruzada del Equipo 3 (ver [Crítica cruzada](#crítica-cruzada-paso-04)) y corregimos lo que no resistió. Los escenarios de abajo son la versión ya corregida; la sección [Antes y después](#antes-y-después-de-los-escenarios) muestra qué cambió.

La regla que nos dimos: **si no sabemos con qué herramienta se va a medir, y quién la va a correr, el escenario no está terminado.** Los escenarios de carga y de resiliencia se ejecutan contra el entorno de Docker Compose de la semana 11, nunca contra producción. Donde dice «quien arma Compose», es la persona que deje funcionando ese entorno; el equipo la nombra en la semana 11 y los resultados de cada corrida quedan en `docs/mediciones/`.

## Resumen

| # | Atributo | Estímulo | Medida | Instrumento | Quién lo corre | Semana |
|---|---|---|---|---|---|---|
| E1 | Disponibilidad | 200 estudiantes envían su reclamo en la última hora del plazo, algunos con reenvíos simultáneos | 0 perdidos, 0 números repetidos, 0 duplicados, menos de 1 % de 5xx | k6, `handleSummary` y consulta SQL | Quien arma Compose | 12 |
| E2 | Rendimiento | 10 miembros del Tercio abren la bandeja con 1 500 reclamos | p95 menor a 1,5 s y 0 reclamos faltantes | k6, script de siembra y `count(*)` | Quien arma Compose | 12 |
| E3 | Seguridad | Un estudiante o una cuenta de solo lectura intenta una operación que no le corresponde | 100 % de la matriz ruta × actor con el código esperado | Suite en `node:test` | CI, en cada push | 10 |
| E4 | Modificabilidad | El Tercio pide subir el historial de 50 a 100 entradas | 0 archivos modificados fuera de `dominio/` y `tests/` | Simulacro con `git diff --stat` y dependency-cruiser | Un integrante, una vez; CI vigila la regla | 9 |
| E5 | Confiabilidad | Brevo falla por clave inválida, cuota agotada o lentitud | 100 envíos aceptados por otro proveedor, con el conteo de llamadas por proveedor | Servidor falso de proveedores en Compose | Quien arma Compose | 11 |
| E6 | Auditabilidad | Preguntan quién decidió y cuándo | 100 % de las decisiones ejecutadas por la prueba, con autor y fecha | Prueba HTTP en CI y consulta SQL en Compose | CI y quien arma Compose | 11 |

## E1. Disponibilidad: cierre del plazo de reclamos

| Parte | Contenido |
|---|---|
| Fuente | 200 estudiantes de la FIIS en la última hora del plazo de reclamos de matrícula, muchos desde la red de la UNI y con una sola IP pública. |
| Estímulo | Envían su reclamo casi al mismo tiempo. El 10 % (20 estudiantes) lo envía dos veces a la vez, por un doble clic o porque la red falló. |
| Artefacto | Ruta `POST /api/reclamos` de la API, función `siguiente_id_reclamo()` ([sql/secuencia_reclamos.sql](../sistema-reclamos/sql/secuencia_reclamos.sql)) y tabla `reclamos` en PostgreSQL. |
| Entorno | Docker Compose con PostgreSQL y PostgREST, una sola instancia de la API, ventana de reclamos abierta, sin Firebase ni proveedores reales de correo. Nunca producción. |
| Respuesta | Cada reclamo recibe un número único `REC-2026-NNNN` y queda guardado. Un reenvío idéntico del mismo estudiante dentro de 10 minutos devuelve el número ya asignado en lugar de crear otro reclamo. Si no se logra asignar un número tras 10 intentos, la API responde 503 con un mensaje que invita a reintentar. |
| Medida | **Perdido:** un reclamo que la API respondió con su número y que no existe en la tabla `reclamos`; la meta es 0. **503:** se cuenta aparte; no es un reclamo perdido porque la API lo rechazó de forma explícita y el estudiante puede reintentar, pero entra en el límite de menos del 1 % de respuestas 5xx. k6 no reintenta un 503. **Números repetidos:** 0 entre los que recibió k6. **Duplicados por reenvío:** 0 filas con el mismo estudiante y la misma descripción, con los reenvíos enviados al mismo tiempo. |
| Instrumento | k6, 200 usuarios virtuales durante 5 minutos. Los 200 tokens de estudiante los genera un script de preparación (`pruebas/generar-tokens.js`, por crear) que firma 200 JWT con `{ email }` y el `JWT_SECRET` de Compose: la sesión del estudiante la firma la propia API, así que no hace falta Firebase. Los reenvíos salen en un mismo `http.batch`. k6 exporta a un archivo, con `handleSummary`, cada número recibido junto con el correo de prueba. Una consulta SQL comprueba que cada número del archivo exista en `reclamos` y busca filas repetidas por correo y descripción. Lo corre quien arma Compose, en la semana 12, y deja el resultado en `docs/mediciones/e1.md`. |

La prueba puede fallar hoy en los duplicados, porque la comprobación de reenvíos lee primero y escribe después (riesgo ya registrado más abajo). Si falla, ese resultado es el hallazgo que justifica corregirla.

## E2. Rendimiento: bandeja del panel del Tercio

| Parte | Contenido |
|---|---|
| Fuente | Hasta 10 miembros del Tercio a la vez. |
| Estímulo | Abren o recargan la bandeja de reclamos del panel. |
| Artefacto | Ruta `GET /api/admin/reclamos` y tabla `reclamos`. |
| Entorno | Docker Compose con PostgreSQL **y PostgREST** (sin PostgREST nunca aparece el corte de 1 000 filas), con 1 500 reclamos de ejemplo con nombres y correos ficticios. |
| Respuesta | El panel recibe todos los reclamos, sin que falte ninguno. |
| Medida | Latencia p95 menor a 1,5 s y 0 reclamos faltantes: el total listado coincide con `count(*)` de la tabla. |
| Instrumento | k6, 10 usuarios virtuales durante 3 minutos. Los 1 500 reclamos los siembra `scripts/sembrar-reclamos.js` (por crear), que mantiene quien arma Compose. Primero se mide la bandeja tal como está, que es la línea base, anotando la máquina (procesador y memoria) en el resultado; la meta de 1,5 s se compara contra esa línea. Después se aplica **una sola mejora, paginar la bandeja**, y se mide de nuevo en la misma máquina. Lo corre quien arma Compose, en la semana 12, y deja el resultado en `docs/mediciones/e2.md`. |

Con 1 500 reclamos y PostgREST se espera ver faltantes antes de paginar, porque PostgREST corta las respuestas en 1 000 filas.

## E3. Seguridad: acceso a reclamos ajenos

| Parte | Contenido |
|---|---|
| Fuente | Un estudiante con sesión válida, o una cuenta del panel configurada como de solo lectura; también quien no trae token, trae uno vencido o uno falsificado. |
| Estímulo | Pide el detalle de un reclamo que no es suyo o adjunta la evidencia de otro estudiante; una cuenta de solo lectura intenta cambiar el estado de un reclamo; alguien manda en el cuerpo un correo distinto del de su sesión. |
| Artefacto | Middlewares `requireStudentAuth` y `requireAdminAuth`, y las consultas filtradas por el correo de la sesión, en [backend/server.js](../sistema-reclamos/backend/server.js). |
| Entorno | Operación normal, con la suite corriendo sin credenciales reales. |
| Respuesta | Se rechaza la operación sin revelar datos: 401 sin token, vencido o falsificado; 404 para el reclamo ajeno, sin distinguir entre «no existe» y «no es tuyo»; 403 para la evidencia ajena y para cualquier escritura desde una cuenta de solo lectura. El correo que decide de quién son los datos sale siempre del token, nunca del cuerpo de la petición. |
| Medida | 100 % de las combinaciones de la matriz con el código esperado, y 0 campos del reclamo ajeno en el cuerpo de cualquier respuesta rechazada. La matriz tiene 26 casos: las rutas de estudiante `GET /api/reclamos/mine/:id` y `POST /api/reclamos/evidencias`, por los actores sin token, vencido, falsificado, dueño y ajeno (10 casos); las rutas de admin `PATCH /api/admin/reclamos/:id`, `PUT /api/admin/reclamos/:id/cursos-resueltos` y `POST /api/admin/reclamos/:id/responder`, por los actores sin token, vencido, falsificado, solo lectura y escritura (15 casos); y un caso en que el cuerpo trae un correo distinto del de la sesión (1 caso). |
| Instrumento | Suite en `node:test`. Los tokens de estudiante se firman con un `JWT_SECRET` de prueba; los de admin los resuelve un verificador falso que se inyecta en lugar de Firebase. «0 campos ajenos» se comprueba buscando en el cuerpo de la respuesta los datos del otro estudiante, que no deben aparecer. La corre CI en cada push. |

Para que la suite pueda importar la aplicación hace falta un cambio previo en el código: hoy `server.js` llama a `app.listen` al importarse y no exporta `app`, así que hay que exportarla, separar el arranque e inyectar el verificador. Ese cambio se hace en la semana 10, junto con la suite.

## E4. Modificabilidad: cambiar una regla de cursos resueltos

| Parte | Contenido |
|---|---|
| Fuente | El Tercio. |
| Estímulo | Pide cambiar una regla de los cursos resueltos; el caso que se ensaya es conservar 100 entradas de historial en lugar de 50. |
| Artefacto | Dominio de la rodaja: [backend/dominio/cursosResueltos.js](../sistema-reclamos/backend/dominio/cursosResueltos.js) y sus pruebas. |
| Entorno | Tiempo de desarrollo, con el sistema en producción. |
| Respuesta | El cambio se hace en el dominio y se prueba sin Supabase, sin Firebase y sin credenciales. No cambian el adaptador, el handler, el contrato HTTP ni el panel. |
| Medida | En el simulacro, 0 archivos modificados fuera de `backend/dominio/` y `backend/tests/`. Como dato de apoyo, `npm test` en verde con las variables de entorno vacías. |
| Instrumento | **Simulacro:** un integrante abre una rama que no se fusiona, cambia el límite del historial de 50 a 100 en `cursosResueltos.js` y su prueba, y corre `git diff --stat` contra `main`. Se hace una vez, antes de la semana 9, y el resultado se anota en `docs/mediciones/e4.md`. **Regla de arquitectura:** `dominio-limpio`, escrita con dependency-cruiser en `.dependency-cruiser.cjs` y activa en CI con `npm run arch:check`. «Sin red» se comprueba corriendo las pruebas con `SUPABASE_URL` y las demás credenciales vacías: si pasan, no usan red. |

La medida ya no se apoya en los 12 casos de prueba en 0,07 s, que miden la velocidad de las pruebas y no la modificabilidad. Tampoco depende de la regla para detectar límites repetidos: una búsqueda del 40 no encuentra otra copia del límite de cursos resueltos fuera del dominio; el 30 de `server.js` es otra regla, la de la creación de un reclamo.

## E5. Confiabilidad: falla del proveedor de correo

| Parte | Contenido |
|---|---|
| Fuente | Brevo, el proveedor principal de correo, deja de aceptar envíos: clave inválida (401), cuota del día agotada (429) o respuesta lenta. |
| Estímulo | El sistema debe enviar un código de verificación, la confirmación de un reclamo o la respuesta del Tercio. |
| Artefacto | Función `sendEmail` de la API, con la cadena de proveedores Brevo, Resend y Mailjet. |
| Entorno | Docker Compose con un servidor falso que imita las tres APIs de correo y se puede poner en modo correcto, 401, 429 o lento. No se llama a ningún proveedor real, así que no se gasta cuota ni se toca producción. |
| Respuesta | El correo sale por el siguiente proveedor disponible sin que nadie intervenga. Si fallan los tres, la API responde con error y el panel lo muestra. La respuesta al estudiante solo queda en el historial (`respuestas_reclamo`) si el correo salió. |
| Medida | Con Brevo en cada modo de falla, los 100 envíos de la corrida son aceptados por otro proveedor. El servidor falso cuenta las llamadas a cada proveedor: 100 intentos a Brevo y 100 a Resend, y 0 a Mailjet. 0 respuestas en el historial sin correo enviado. La demora adicional se mide, pero solo es comparable para 401 y 429, que responden de inmediato. |
| Instrumento | Un script envía los 100 correos contra la API en Compose, y el conteo sale del registro del servidor falso. Lo corre quien arma Compose, en la semana 11, y deja el resultado en `docs/mediciones/e5.md`. |

El modo lento hoy debe fallar: `sendEmail` no tiene timeout, así que una respuesta lenta deja la petición colgada en lugar de pasar al siguiente proveedor. Ese resultado es el hallazgo que justifica agregarlo. Para que el servidor falso reciba las llamadas hace falta un cambio previo en el código: las URL de los tres proveedores están escritas directamente en `server.js` y tienen que poder configurarse.

## E6. Auditabilidad: quién decidió y cuándo

| Parte | Contenido |
|---|---|
| Fuente | La coordinación de la facultad, o un estudiante que cuestiona una decisión. |
| Estímulo | Pregunta quién decidió matricular o retirar un curso-sección de un reclamo, quién cambió su estado y cuándo. |
| Artefacto | Historial dentro de la columna `reclamos.cursos_resueltos`, tabla `activity_log` y tabla `respuestas_reclamo`. |
| Entorno | Docker Compose con PostgreSQL, nunca producción. |
| Respuesta | Cada decisión sobre cursos, cada cambio de estado y cada respuesta enviada queda registrada con su autor, tomado del token verificado y no del cuerpo de la petición, y con su fecha y detalle. Un reclamo en estado `MATRICULADO` ya no puede cambiar de estado (409). |
| Medida | El denominador son las decisiones que la propia prueba ejecuta: 30 cambios de estado, 30 guardados de cursos resueltos (con altas y bajas) y 30 respuestas, 90 en total. 100 % de ellas con autor y fecha, y el autor coincide con la identidad autenticada aunque el cuerpo diga otra. |
| Instrumento | La prueba HTTP existente (*comunica resultado y registra auditoría con identidad autenticada*), ampliada a los tres tipos de decisión y corriendo en CI. Después, una consulta SQL sobre `activity_log` en Compose cruza las 90 decisiones que la prueba sabe que ejecutó con las filas encontradas, para detectar las que faltan. Lo corre quien arma Compose, en la semana 11, y deja el resultado en `docs/mediciones/e6.md`. |

Un riesgo conocido: `logActividad` no espera ni reintenta, así que si Supabase falla en ese instante la decisión se guarda pero su registro se pierde. La corrida incluye un caso con esa falla inyectada (un cliente de base que rechaza la inserción en `activity_log`); hoy se espera que muestre filas faltantes, y por eso E6 no se declara cumplido todavía.

## Crítica cruzada

Pregunta única para cada escenario: **¿Con qué instrumento concreto se mide esto, y quién lo va a correr?**

**Equipo revisor asignado:** Equipo 3.

Observaciones tal como las recibimos y la corrección que aplicamos a cada escenario. La columna «¿Pasa?» es la valoración del Equipo 3.

| ID | Observación | ¿Pasa? | Corrección aplicada |
|---|---|---|---|
| E1 | k6 y SQL están claros, pero el cruce no. k6 no guarda los números REC-2026-NNNN que recibe; hay que decir cómo se exportan (por ejemplo handleSummary o --out json) y qué consulta los compara con las filas. Faltan también los 200 tokens de estudiante válidos: ¿quién los genera y cómo, si el entorno es sin Firebase? La medida exige «0 duplicados por reenvío», pero la prueba descrita (10 % de reenvíos) no dice que sean simultáneos. Los propios riesgos del documento admiten que ahí está la carrera. Además, «0 perdidos» choca con el 503 por diseño: ¿un 503 final cuenta como perdido o k6 reintenta? | Sí, falta el cómo y el quién | `handleSummary` exporta cada número recibido y una consulta SQL lo cruza con las filas. Un script firma los 200 tokens con el `JWT_SECRET` de Compose. Los reenvíos salen en un mismo `http.batch`. «Perdido» se define y el 503 se cuenta aparte, sin reintento. Lo corre quien arma Compose. |
| E2 | k6 es nombrado, pero «1 500 reclamos de ejemplo» no tiene instrumento: ¿qué script los siembra y quién lo mantiene? El riesgo del límite de 1 000 filas es de PostgREST. Si Compose levanta solo PostgreSQL, ese riesgo nunca aparecería y la prueba daría un falso verde. El umbral de 1,5 s no tiene línea base ni dice en qué máquina se mide, y «antes y después de una sola mejora» no dice cuál. | Sí, entorno dudoso | `scripts/sembrar-reclamos.js` siembra los reclamos y lo mantiene quien arma Compose. El entorno incluye PostgREST. Se mide primero la línea base, anotando la máquina, y la única mejora es paginar la bandeja. |
| E3 | node:test está claro, pero «al menos 8 casos» no sale de ninguna lista. Con 8 casos «100 %» es casi trivial; lo útil sería una matriz ruta × tipo de actor. Faltan además token ausente, vencido o falsificado. La respuesta dice que el correo sale del token y nunca del cuerpo, pero ningún caso de la medida lo verifica. Tampoco se explica cómo la suite obtiene tokens sin credenciales reales (¿verificador falso inyectado?). «0 campos ajenos» no dice cómo se comprueba. | Sí | La medida pasa a una matriz de 26 casos, ruta × actor, que incluye token ausente, vencido y falsificado, y el caso del correo en el cuerpo. Los tokens de estudiante se firman con un secreto de prueba y los de admin los resuelve un verificador falso inyectado. «0 campos ajenos» se comprueba buscando en la respuesta los datos del otro estudiante. |
| E4 | No pasa. dominio-limpio no se identifica como herramienta (¿ESLint, dependency-cruiser, un script?). Además la medida se calcula sobre «el commit del cambio», pero ese cambio no existe: alguien tendría que hacer el simulacro (pasar 50 a 100 entradas) y medir. «Ya se cumple» se apoya en 12 pruebas en 0,07 s, que mide velocidad de pruebas, no modificabilidad. La regla tampoco detecta que el límite de 40 cursos esté duplicado en el handler o en el panel. «Sin red» no dice cómo se comprueba. | No del todo | `dominio-limpio` se identifica como regla de dependency-cruiser. La medida pasa a ser un simulacro de 50 a 100 entradas, que se hace una vez y deja de decir «ya se cumple». Los 12 casos de 0,07 s quedan como dato de apoyo. Se verificó que el límite de 40 no está repetido fuera del dominio. «Sin red» se comprueba con las credenciales vacías. |
| E5 | «Buzón de prueba» no es una herramienta (¿Mailpit? ¿un Gmail?). No dice si Resend y Mailjet se llaman reales, lo que contradice «nunca contra producción» y gasta cuota, o si hay mocks. Una clave de Brevo inválida da un 401 inmediato, que no equivale a una caída (timeout) ni a cuota agotada (429). Con 401 los «3 s de demora» casi no se prueban. Falta el script que envía los 100 correos. Y depende de Compose, que se arma en esa misma semana 11. | Parcial | La herramienta es un servidor falso de las tres APIs, sin llamadas reales. Se prueban 401, 429 y lento. La medida principal pasa a ser el conteo de llamadas por proveedor, y la demora solo se compara en 401 y 429. Un script envía los 100 correos. La dependencia de Compose se reconoce abajo. |
| E6 | La prueba HTTP existente sirve para su caso, pero «100 % de decisiones» no tiene denominador: esa prueba cubre un flujo (comunicar resultado), no matricular ni retirar. Una consulta sobre activity_log no puede detectar una fila que falta; haría falta cruzarla con los cambios de estado reales, y el estado no se versiona. Peor, el documento reconoce que logActividad puede perder el registro si Supabase falla, así que «Ya se cumple» es dudoso y ninguna medida inyecta esa falla. No dice sobre qué base corre la consulta (¿producción?) ni quién. | Parcial | El denominador son 90 decisiones que la propia prueba ejecuta (30 de cada tipo) y la consulta las cruza con `activity_log`. Se agrega un caso con la falla inyectada. Corre sobre la base de Compose, nunca producción, y se quita «ya se cumple». |

**Dependencia reconocida de la crítica a E5.** E5 y E6 se miden en el entorno de Compose, que se arma en esa misma semana 11. Si Compose se atrasa, esas dos mediciones se atrasan con él; E3 y E4 no dependen de Compose y se hacen antes.

## Antes y después de los escenarios

### De la versión revisada a la corregida

La versión que revisó el Equipo 3 y la que quedó después de aplicar su crítica.

| Escenario | Antes de la crítica | Después de la crítica |
|---|---|---|
| E1 | k6 y consulta SQL sin explicar cómo se cruzan; reenvíos de un 10 % sin decir que son simultáneos; «0 perdidos» sin tratar el 503. | Exportación con `handleSummary` y consulta de cruce; 200 tokens firmados con el secreto de prueba; reenvíos en un mismo `http.batch`; «perdido» definido y 503 contado aparte. |
| E2 | 1 500 reclamos «de ejemplo» sin script; umbral de 1,5 s sin línea base ni máquina. | Script de siembra, PostgREST en el entorno, línea base con la máquina anotada y una sola mejora: paginar la bandeja. |
| E3 | «Al menos 8 casos» sin lista; sin token ausente, vencido ni falsificado; sin explicar de dónde salen los tokens. | Matriz de 26 casos ruta × actor, con los tres estados del token y el correo en el cuerpo; verificador falso para el admin. |
| E4 | «Ya se cumple» con 12 pruebas en 0,07 s; herramienta de la regla sin nombrar; medida sobre un cambio que no existía. | Simulacro de 50 a 100 entradas, dependency-cruiser nombrado y estado «por medir». |
| E5 | «Buzón de prueba» sin herramienta; clave inválida que no equivale a caída ni a cuota; sin script de envío. | Servidor falso de las tres APIs con modos 401, 429 y lento; conteo de llamadas por proveedor; script de 100 envíos. |
| E6 | «100 % de decisiones» sin denominador; consulta que no detecta filas faltantes; «ya se cumple» pese al riesgo conocido. | 90 decisiones ejecutadas por la prueba como denominador, cruce con `activity_log`, caso con la falla inyectada y «ya se cumple» retirado. |

## Priorización

Puntuamos cada escenario por su impacto en el estudiante (qué pasa si no se cumple) y por su dificultad técnica (cuánto cuesta cumplirlo). La prioridad sale del impacto; la dificultad nos dice cuánto esfuerzo reservar.

| Prioridad | Escenario | Impacto | Dificultad | Decisión que lo atiende |
|---|---|---|---|---|
| 1 | E1 Disponibilidad | Alto | Alta | [ADR-0003](adr/0003-secuencia-para-numerar-reclamos.md): la secuencia de PostgreSQL numera los reclamos. |
| 2 | E4 Modificabilidad | Alto | Media | [ADR-0001 y ADR-0002](adr/), vigilados por la regla `dominio-limpio`. |
| 3 | E6 Auditabilidad | Alto | Baja | ADR-0002: el caso de uso registra autor y fecha en el historial; el autor sale del token. |
| 4 | E3 Seguridad | Alto | Media | Controles existentes en `requireStudentAuth` y `requireAdminAuth`; la evidencia automatizada llega en la semana 10. |
| 5 | E5 Confiabilidad | Medio | Baja | Cadena de proveedores de correo, anterior a este ciclo; se pone a prueba en la semana 11. |
| 6 | E2 Rendimiento | Medio | Media | Se mide en la semana 12 antes de optimizar nada. |

Esa prioridad guió las decisiones. Perder un reclamo en el cierre de matrícula puede dejar a un estudiante sin sus cursos, así que E1 va primero y es el único escenario que justificó poner lógica en la base de datos: en el ADR-0003 aceptamos depender de una función de PostgreSQL a cambio de una numeración atómica. E4 va segundo porque es el que más frena al equipo: cualquier cambio de reglas pasaba por un archivo de 2 351 líneas y no se podía probar sin credenciales. Atenderlo motivó el ADR-0001 y el ADR-0002, y por él aceptamos más archivos y una composición manual. E6 casi no cuesta, porque los registros ya existían, y la rodaja lo refuerza al tomar el autor del token. E3 tiene impacto alto, pero sus controles ya funcionan en producción; lo que falta es la prueba automatizada. E5 y E2 se medirán antes de cambiar nada.

La crítica del Equipo 3 no cambió el orden, pero sí el estado de dos escenarios: E4 y E6 dejaron de figurar como «ya se cumple» y pasan a «por medir», porque el simulacro de E4 no se había hecho y la pérdida de registros de E6 no se había puesto a prueba.

## Riesgos que las mediciones tienen que confirmar o descartar

- **E1.** La comprobación de reenvíos lee primero y escribe después: busca un reclamo del mismo correo con la misma descripción en los últimos 10 minutos y, si no lo encuentra, inserta. Si las dos peticiones de un doble clic llegan a la vez, las dos pueden no encontrar nada y crear dos reclamos. Por eso los reenvíos de la prueba salen simultáneos, y se espera que la medida de duplicados falle hasta corregirlo.
- **E2.** La ruta del panel pide `select=*` sin paginar, y el propio `server.js` documenta en `sbRestTodo` que PostgREST corta las respuestas en 1 000 filas sin avisar. Si ese límite sigue activo, con más de 1 000 reclamos el panel dejaría de mostrar los más antiguos. Por eso el entorno incluye PostgREST.
- **E5.** `sendEmail` no tiene timeout: un proveedor que responde lento deja la petición colgada en lugar de pasar al siguiente. El modo lento de la prueba tiene que mostrarlo.
- **E6.** `logActividad` no espera ni reintenta, así que si Supabase falla en ese instante la decisión se guarda pero su registro en `activity_log` se pierde. El historial dentro de `cursos_resueltos`, en cambio, se guarda junto con la decisión. La corrida inyecta esa falla.
