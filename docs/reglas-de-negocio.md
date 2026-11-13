# Reglas de negocio

Aquí listamos las reglas de negocio que el sistema cumple hoy. Para cada una pusimos en qué parte del código está y si alguna prueba la verifica. Casi todas viven en `sistema-reclamos/backend/server.js`; cuando una está en otro archivo, lo indicamos. Lo revisamos sobre el commit `947db6c`.

De las 40 reglas, solo 4 tienen prueba, todas de la rodaja de cursos resueltos. El resto está dentro de las rutas de `server.js` y no tiene ninguna.

## Acceso

| # | Regla | Dónde está | Prueba |
|---|---|---|---|
| RN-01 | Solo entran correos `@uni.pe`. Hay una lista corta de excepciones que aprueba el Tercio. | `correoPermitido()`, `CORREOS_EXCEPCION`, `POST /api/auth/send-code` | Sin prueba |
| RN-02 | El código de acceso tiene 4 dígitos y vence en 5 minutos. | `POST /api/auth/send-code`, `POST /api/auth/verify-code` | Sin prueba |
| RN-03 | Con 5 intentos fallidos, el código deja de servir y hay que pedir otro. | `MAX_INTENTOS_CODIGO`, `POST /api/auth/verify-code` | Sin prueba |
| RN-04 | Un correo puede pedir como máximo 5 códigos cada 15 minutos. | `limiteEnvioCodigo` | Sin prueba |
| RN-05 | La sesión del estudiante dura 24 horas. | `POST /api/auth/verify-code` | Sin prueba |
| RN-06 | Al panel solo entran los correos de `ADMIN_EMAILS`. Tener una cuenta de Firebase no basta. | `requireAdminAuth()` | Sin prueba |
| RN-07 | Las cuentas de solo lectura pueden mirar el panel, pero no cambiar nada. | `requireAdminAuth()`, `esSoloLectura()` | Sin prueba |
| RN-08 | Solo el administrador principal abre o cierra la ventana de reclamos, activa los modos (almuerzo, almuerzo festivo, mantenimiento, Tefi durmiendo y despedida) e indexa documentos para Tefi. | `SUPER_ADMIN_EMAIL`, las rutas `POST /api/admin/*` de cada modo, `POST /api/rag/upload` | Sin prueba |

## Reclamos

| # | Regla | Dónde está | Prueba |
|---|---|---|---|
| RN-09 | Los reclamos solo se reciben con la ventana abierta. El administrador principal puede enviar aunque esté cerrada, para probar. Si no se puede leer el interruptor, se asume abierta. | `puedeEnviarReclamo()`, `reclamosHabilitados()`, `POST /api/reclamos` | Sin prueba |
| RN-10 | Con Tefi durmiendo no se reciben reclamos. | `tefiDurmiendoActivo()`, `POST /api/reclamos` | Sin prueba |
| RN-11 | Con el ciclo cerrado (modo despedida) no se reciben reclamos, documentos ni pruebas, salvo de los correos de `EXCEPCIONES_DESPEDIDA`. | `despedidaActivaPara()`, `POST /api/reclamos`, `POST /api/docs/upload`, `POST /api/reclamos/evidencias` | Sin prueba |
| RN-12 | Un reclamo necesita categoría y descripción. | `POST /api/reclamos` | Sin prueba |
| RN-13 | Los cursos tienen que existir en el catálogo y la sección tiene que ser de ese curso; los demás se descartan sin aviso. El nombre del curso sale del catálogo y cada lista admite hasta 30 cursos. | `CATALOGO_CURSOS`, `sanearCursos`, `POST /api/reclamos` | Sin prueba |
| RN-14 | Si un estudiante reenvía la misma descripción dentro de 10 minutos, se le devuelve el reclamo que ya tenía. | `VENTANA_DUPLICADO_MS`, `POST /api/reclamos` | Sin prueba |
| RN-15 | Cada reclamo recibe un número `REC-AAAA-NNNN` de una secuencia de PostgreSQL. Si tras 10 intentos no se asigna, la API responde 503. | `POST /api/reclamos` y `sistema-reclamos/sql/secuencia_reclamos.sql` (ADR-0003) | Sin prueba |
| RN-16 | Todo reclamo empieza en `PENDIENTE`. | `POST /api/reclamos` | Sin prueba |
| RN-17 | Hay seis estados posibles: `PENDIENTE`, `EN_REVISION`, `ACEPTADO`, `ACEPTADO_PARCIALMENTE`, `RECHAZADO` y `MATRICULADO`. | `ESTADOS_RECLAMO`, `PATCH /api/admin/reclamos/:id` | Sin prueba |
| RN-18 | `MATRICULADO` es final: después ya no se puede cambiar de estado (409). | `ESTADO_FINAL`, `PATCH /api/admin/reclamos/:id` | Sin prueba |
| RN-19 | La especialidad solo se corrige a una de las cuatro carreras de la FIIS, y se guarda la que declaró el estudiante. | `ESPECIALIDADES_FIIS`, `PATCH /api/admin/reclamos/:id` | Sin prueba |
| RN-20 | Cada estudiante ve solo sus reclamos. Si pide uno ajeno, recibe 404, como si no existiera. | `requireStudentAuth()`, `GET /api/reclamos/mine`, `GET /api/reclamos/mine/:id` | Sin prueba |
| RN-21 | El estudiante ve el último estado que se le comunicó por correo; mientras nadie le escriba, ve `PENDIENTE`. La nota interna y la decisión sobre los cursos no se le muestran. | `GET /api/reclamos/mine`, `GET /api/reclamos/mine/:id` | Sin prueba |

## Comunicación con el estudiante

| # | Regla | Dónde está | Prueba |
|---|---|---|---|
| RN-22 | La confirmación de un reclamo solo se manda a su dueño, con los datos guardados en la base. | `POST /api/reclamos/confirmar` | Sin prueba |
| RN-23 | La respuesta del Tercio no puede ir vacía y va al correo guardado en el reclamo. | `POST /api/admin/reclamos/:id/responder` | Sin prueba |
| RN-24 | Cada respuesta enviada queda guardada con su estado, mensaje, autor y fecha; las anteriores no se pierden. | `POST /api/admin/reclamos/:id/responder`, tabla `respuestas_reclamo` | Sin prueba |
| RN-25 | Los correos salen por Brevo; si falla, por Resend, y si también falla, por Mailjet. | `sendEmail()` | Sin prueba |

## Cursos resueltos

| # | Regla | Dónde está | Prueba |
|---|---|---|---|
| RN-26 | Cada lista tiene hasta 40 cursos, y cada curso lleva código y sección, guardados en mayúsculas. | `backend/dominio/cursosResueltos.js`: `cursosValidos()` | *dominio: normaliza código y sección y limita nombre*; *dominio: rechaza listas incorrectas, exceso y cursos incompletos*; *caso de uso: entrada inválida nunca consulta ni guarda* |
| RN-27 | El historial guarda las últimas 50 decisiones, con autor y fecha. | `backend/dominio/cursosResueltos.js`: `prepararCursosResueltos()` | *dominio: conserva 49 entradas previas y añade autor y fecha sin mutar* |
| RN-28 | El autor de la decisión es el administrador que inició sesión, diga lo que diga la petición. | `backend/presentacion/guardarCursosHandler.js`: `crearGuardarCursosHandler()` | *HTTP: comunica resultado y registra auditoría con identidad autenticada* |
| RN-29 | No se registran cursos de un reclamo que no existe (404). | `backend/aplicacion/guardarCursosResueltos.js`: `crearGuardarCursosResueltos()` | *caso de uso: inexistencia y desaparición al guardar producen 404* |

## Documentos y pruebas

| # | Regla | Dónde está | Prueba |
|---|---|---|---|
| RN-30 | Solo se aceptan PDF, de a uno: hasta 15 MB los documentos y hasta 10 MB la prueba de un reclamo. | `soloPdf()`, `MAX_PDF_BYTES`, `MAX_EVIDENCIA_BYTES` y el manejador final de errores | Sin prueba |
| RN-31 | Cada estudiante guarda tres documentos: ficha académica, avance curricular y boleta de matrícula. | `DOC_FIELD_BY_TIPO`, `POST /api/docs/upload` | Sin prueba |
| RN-32 | Cada estudiante solo puede ver o borrar sus propios archivos. | `rutaDentroDe()`, `GET /api/docs/signed-url`, `DELETE /api/docs/:email/:tipo`, `DELETE /api/reclamos/evidencias` | Sin prueba |
| RN-33 | Un reclamo lleva como máximo una prueba, y tiene que haberla subido el mismo estudiante; si no, la API responde 403. | `MAX_EVIDENCIAS`, `esEvidenciaPropia()`, `POST /api/reclamos` | Sin prueba |
| RN-34 | El Tercio ve los documentos de cualquier estudiante con un enlace firmado que vence en 10 minutos. | `createSignedUrl()`, `GET /api/admin/docs/signed-url` | Sin prueba |
| RN-35 | Si se vuelven a extraer los datos de los PDF, se mantienen el teléfono y el turno que escribió el estudiante. | `PUT /api/admin/estudiantes/:email/datos` | Sin prueba |

## Tefi

| # | Regla | Dónde está | Prueba |
|---|---|---|---|
| RN-36 | En modo almuerzo o almuerzo festivo, Tefi no responde (503), pero los reclamos siguen funcionando. | `modoAlmuerzoActivo()`, `modoAlmuerzoFestivoActivo()`, `POST /api/rag/ask` | Sin prueba |
| RN-37 | La conversación con Tefi solo se guarda si hay sesión. | `emailDeSesionOpcional()`, `guardarTurnoConversacion()`, `POST /api/rag/ask` | Sin prueba |

## Auditoría

| # | Regla | Dónde está | Prueba |
|---|---|---|---|
| RN-38 | Las acciones importantes quedan en el registro de actividad con su autor: inicios de sesión, documentos, reclamos nuevos, cambios de estado, respuestas, cursos resueltos y cambios de modo. Si el registro falla, la acción sigue adelante. | `logActividad()` | Solo la de cursos resueltos: *HTTP: comunica resultado y registra auditoría con identidad autenticada* |
| RN-39 | Cualquier miembro del Tercio puede leer las conversaciones con Tefi, y cada consulta queda registrada. | `GET /api/admin/conversaciones/:email` | Sin prueba |
| RN-40 | El historial completo de actividad es solo del administrador principal; quién atendió cada reclamo lo ve todo el Tercio. | `GET /api/admin/activity`, `GET /api/admin/reclamos-atendidos` | Sin prueba |

## Reglas que hoy solo cumple la interfaz

Estas las respeta la aplicación de estudiantes, pero la API no las revisa. Quien llame a la API directamente se las salta.

| Regla | Dónde está | Qué hace la API |
|---|---|---|
| El código UNI tiene 7 u 8 dígitos y una letra al final. | `sistema-reclamos/src/features/admin/hooks/useReclamos.ts` | Guarda el código como llega. |
| Quien dijo que se matriculó tiene que subir su boleta. | `sistema-reclamos/src/features/admin/hooks/useReclamos.ts` | No lo revisa. |
| Para hablar con Tefi hay que iniciar sesión. | `sistema-reclamos/src/features/chat/components/ChatArea.tsx` | `POST /api/rag/ask` responde también sin sesión. |
| Con el modo mantenimiento, la aplicación de estudiantes se bloquea. | `sistema-reclamos/src/App.tsx` | Ninguna ruta lo aplica; la API solo guarda y devuelve el valor. |
| Con Tefi durmiendo o con el ciclo cerrado, no se puede consultar a Tefi. | `sistema-reclamos/src/App.tsx` | `POST /api/rag/ask` solo revisa los modos almuerzo, así que responde igual. |
