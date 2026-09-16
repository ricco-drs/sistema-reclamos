# Módulo M3 – Atributos de Calidad y Escenarios

**Responsable:** Christopher Albino  
**Módulo:** M3 – Evaluación y Resolución de Casos  
**Sistema:** TEFIIS – Sistema de Gestión de Reclamos Estudiantiles

---

## Atributos de Calidad Identificados

| # | Atributo | Justificación |
|---|---|---|
| 1 | Disponibilidad | Los miembros TEFIIS deben poder acceder al panel de casos en cualquier momento para no retrasar la atención de reclamos. |
| 2 | Rendimiento | La carga del expediente y el envío de notificaciones por correo deben ser rápidos para no entorpecer el flujo de trabajo. |
| 3 | Seguridad | Los expedientes contienen datos sensibles de los estudiantes; únicamente los miembros TEFIIS autenticados deben poder acceder a ellos. Usuarios externos o estudiantes no deben poder visualizar casos ajenos. |
| 4 | Confiabilidad | El envío automático de correos al estudiante es crítico; un fallo silencioso dejaría al estudiante sin respuesta sin saberlo. |
| 5 | Usabilidad | El panel de gestión con indicadores de espera prolongada debe ser intuitivo para que el miembro TEFIIS priorice sin necesidad de capacitación. |

---

## Riesgos e Interacciones entre Atributos

| Interacción | Descripción |
|---|---|
| Seguridad vs. Rendimiento | Las validaciones de autenticación y autorización en cada solicitud pueden incrementar ligeramente la latencia al cargar expedientes. |
| Confiabilidad vs. Rendimiento | Los reintentos de envío de correo ante fallos pueden introducir demoras adicionales en el flujo de notificación. |
| Disponibilidad vs. Seguridad | Mecanismos de alta disponibilidad (replicación, failover) deben garantizar que la autenticación y autorización no se vean comprometidas en escenarios de recuperación. |

---

## Restricciones Identificadas

| ID | Restricción |
|---|---|
| R-01 | El correo de notificación debe enviarse al correo **institucional** del estudiante (no correo personal). |
| R-02 | El umbral de espera prolongada es configurable por el administrador del sistema, no codificado en el módulo. |
| R-03 | El módulo M3 no puede modificar datos ingresados en M2 (campos de apertura del caso son de solo lectura). |
| R-04 | El sistema de correos debe integrarse con el servidor SMTP institucional existente. |

---

## Escenarios de Atributos de Calidad (6 Partes)

> **Formato de escenario:** Fuente del estímulo → Estímulo → Entorno → Artefacto → Respuesta → Medida de respuesta

---

### ESC-M3-01 – Disponibilidad: Acceso al panel durante alta concurrencia

| Parte | Descripción |
|---|---|
| **Fuente del estímulo** | Múltiples miembros TEFIIS (hasta 10 simultáneos: 6 titulares + miembros de apoyo) al inicio de la jornada académica. |
| **Estímulo** | Acceso concurrente al panel de gestión de casos del módulo M3. |
| **Entorno** | Horario pico (8:00 a.m. – 9:00 a.m.), sistema en operación normal. |
| **Artefacto** | Panel principal del módulo M3 (listado de casos asignados). |
| **Respuesta** | El sistema atiende todas las solicitudes concurrentes sin degradación visible. |
| **Medida de respuesta** | El panel carga correctamente para todos los usuarios en un tiempo máximo de **3 segundos**, con una disponibilidad del **95%** mensual (equivalente a no más de ~36 horas de caída acumulada al mes). |

---

### ESC-M3-02 – Rendimiento: Carga del expediente completo de un caso

| Parte | Descripción |
|---|---|
| **Fuente del estímulo** | Miembro TEFIIS que selecciona un caso del panel para revisarlo. |
| **Estímulo** | Solicitud de carga del expediente completo (datos del estudiante, documentos adjuntos, historial de estados). |
| **Entorno** | Operación normal con expediente de tamaño estándar (hasta 5 archivos adjuntos, 10 MB en total). |
| **Artefacto** | Vista de detalle del caso dentro del módulo M3. |
| **Respuesta** | El sistema despliega todos los datos del expediente sin necesidad de recargas adicionales. |
| **Medida de respuesta** | El expediente completo se carga en un tiempo máximo de **2 segundos** bajo condiciones normales de red. |

---

### ESC-M3-03 – Seguridad: Acceso externo no autenticado a expedientes de casos

| Parte | Descripción |
|---|---|
| **Fuente del estímulo** | Un usuario externo (estudiante o persona sin cuenta en el sistema) intenta acceder directamente a la URL de un expediente de caso. |
| **Estímulo** | Solicitud HTTP directa a la ruta de detalle de un caso sin sesión activa de miembro TEFIIS. |
| **Entorno** | Sistema en operación normal; el usuario no está autenticado. |
| **Artefacto** | Módulo de autenticación y rutas protegidas del módulo M3. |
| **Respuesta** | El sistema redirige al usuario a la pantalla de inicio de sesión, bloquea la visualización del expediente y registra el intento de acceso. |
| **Medida de respuesta** | El acceso es bloqueado en el **100%** de los intentos no autenticados; la redirección ocurre en menos de **1 segundo** sin exponer ningún dato del expediente. |

---

### ESC-M3-04 – Confiabilidad: Fallo en el envío del correo de notificación

| Parte | Descripción |
|---|---|
| **Fuente del estímulo** | El servidor SMTP institucional presenta una interrupción temporal. |
| **Estímulo** | El sistema intenta enviar el correo de notificación al estudiante tras registrarse el dictamen, pero la conexión falla. |
| **Entorno** | Operación con fallo parcial del servicio de correo externo. |
| **Artefacto** | Servicio de notificación por correo del módulo M3. |
| **Respuesta** | El sistema registra el fallo, reintenta el envío hasta **3 veces** con intervalos de 5 minutos, y marca el estado de la notificación como "Pendiente" o "Fallido" en el expediente. |
| **Medida de respuesta** | El correo es entregado exitosamente en al menos el **95%** de los casos dentro de los **15 minutos** posteriores al dictamen; los fallos persistentes quedan registrados para revisión manual. |

---

### ESC-M3-05 – Usabilidad: Identificación de casos con larga espera

| Parte | Descripción |
|---|---|
| **Fuente del estímulo** | Miembro TEFIIS nuevo que accede al panel de gestión por primera vez. |
| **Estímulo** | El miembro intenta identificar cuáles casos tienen mayor urgencia de atención entre un listado de 20 casos activos. |
| **Entorno** | Operación normal; el miembro no ha recibido capacitación previa específica sobre el módulo. |
| **Artefacto** | Panel de gestión de casos del módulo M3 con indicadores de espera prolongada. |
| **Respuesta** | El sistema muestra indicadores visuales claros (color, etiqueta de tiempo) que permiten al miembro identificar los casos más antiguos sin necesidad de instrucciones adicionales. |
| **Medida de respuesta** | El miembro es capaz de identificar y seleccionar el caso de mayor espera en un tiempo máximo de **30 segundos** en su primer uso, sin asistencia. |

---

## Listado Consolidado de Escenarios

| ID | Atributo | Escenario | Medida Clave |
|---|---|---|---|
| ESC-M3-01 | Disponibilidad | Acceso concurrente al panel de gestión | Carga en ≤ 3s, disponibilidad 95% mensual |
| ESC-M3-02 | Rendimiento | Carga del expediente completo | Carga en ≤ 2s |
| ESC-M3-03 | Seguridad | Acceso externo no autenticado a expedientes | Bloqueo en 100%, redirección en ≤ 1s |
| ESC-M3-04 | Confiabilidad | Fallo en envío de correo de notificación | Entrega en 95% dentro de 15 min |
| ESC-M3-05 | Usabilidad | Identificación de casos con larga espera | Tarea completada en ≤ 30s sin asistencia |
