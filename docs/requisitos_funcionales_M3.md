# Módulo M3 – Evaluación y Resolución de Casos

**Responsable:** Christopher Albino  
**Módulo:** M3  
**Sistema:** TEFIIS – Sistema de Gestión de Reclamos Estudiantiles

---

## Descripción del Módulo

El módulo de **Evaluación y Resolución de Casos** es el núcleo de procesamiento del sistema TEFIIS. Recibe los reclamos formalizados por el módulo M2 (Gestión y Trazabilidad del Reclamo), los evalúa conforme a las reglas y reglamentos institucionales, y emite una resolución formal. El resultado de cada resolución queda disponible para el módulo M1 (Autoservicio del Estudiante) y alimenta los datos analíticos del módulo M4 (Asistencia Inteligente y Análisis).

---

## Actores Involucrados

| Actor | Descripción |
|---|---|
| Miembro TEFIIS | Personal académico o administrativo encargado de revisar, resolver y gestionar los casos del sistema. |
| Sistema | Ejecuta las reglas automáticas: asignación, notificaciones por correo y monitoreo de casos con larga espera. |
| Estudiante | Receptor de la resolución; recibe notificaciones por correo electrónico al actualizar el estado de su caso. |

---

## Requisitos Funcionales

### RF-3.1 – Asignación Automática de Caso a Evaluador

**Historia de usuario:**  
Como miembro TEFIIS, quiero que el sistema asigne automáticamente cada reclamo recibido al miembro competente según el tipo de caso y su carga actual, para que los casos sean atendidos de forma equitativa y oportuna.

**Criterios de aceptación:**
- El sistema identifica el tipo de reclamo (académico, administrativo, económico) y selecciona al miembro TEFIIS habilitado con menor carga activa.
- El miembro TEFIIS asignado recibe una notificación (correo y/o notificación interna) en el momento de la asignación.
- Si no existe un evaluador disponible, el caso ingresa a una cola de espera con prioridad por fecha de ingreso.
- La asignación queda registrada con timestamp en el historial del caso.
- El miembro TEFIIS puede reasignar manualmente un caso a otro miembro disponible.

---

### RF-3.2 – Revisión del Expediente del Caso

**Historia de usuario:**  
Como miembro TEFIIS, quiero acceder al expediente completo del reclamo (datos del estudiante, evidencias adjuntas, comunicaciones previas y estados anteriores), para poder emitir un juicio informado y fundamentado.

**Criterios de aceptación:**
- El evaluador visualiza en una sola pantalla: datos del estudiante, descripción del reclamo, archivos adjuntos y el historial de estados (trazabilidad proveniente de M2).
- Los campos de apertura del caso son de solo lectura para el miembro TEFIIS.
- Los archivos adjuntos pueden ser descargados o visualizados en línea (PDF, imágenes).
- El sistema registra el acceso del miembro TEFIIS al expediente con fecha y hora.

---

### RF-3.3 – Registro del Dictamen o Resolución

**Historia de usuario:**  
Como miembro TEFIIS, quiero registrar el resultado de mi evaluación indicando si el reclamo es aprobado o rechazado, junto con la justificación correspondiente, para que el sistema formalice la resolución.

**Criterios de aceptación:**
- El miembro TEFIIS selecciona el resultado entre las opciones: **Aprobado** o **Rechazado**.
- El campo de justificación es obligatorio y debe contener un mínimo de 50 caracteres.
- La resolución queda registrada con el ID del miembro TEFIIS, la fecha y la hora de emisión.
- El estado del caso cambia automáticamente a **"Resuelto"** una vez confirmado el dictamen.
- El sistema registra la resolución en el historial del caso para trazabilidad.

---

### RF-3.4 – Visualización de Casos con Larga Espera

**Historia de usuario:**  
Como miembro TEFIIS, quiero que el sistema identifique y destaque visualmente los casos que llevan mucho tiempo sin recibir una resolución, para que pueda priorizarlos y atenderlos oportunamente.

**Criterios de aceptación:**
- El sistema calcula el tiempo de espera de cada caso a partir de la fecha de ingreso al módulo M3.
- Los casos cuyo tiempo de espera supere un umbral configurable (por ejemplo, 5 días hábiles) se marcan visualmente con un indicador de "espera prolongada" en el panel de gestión.
- El miembro TEFIIS puede filtrar la vista de casos por antigüedad: todos, con espera prolongada, recientes.
- El panel muestra el tiempo transcurrido desde la apertura del caso de forma legible (ej. "hace 8 días").
- El indicador de espera prolongada no implica vencimiento ni penalidad automática; es solo un apoyo visual para la gestión.

---

### RF-3.5 – Notificación Automática al Estudiante por Correo

**Historia de usuario:**  
Como miembro TEFIIS, quiero que el sistema notifique automáticamente al estudiante por correo electrónico cuando su caso reciba una resolución, para que esté informado del resultado sin necesidad de ingresar al sistema.

**Criterios de aceptación:**
- Al registrar el dictamen (aprobado o rechazado), el sistema envía automáticamente un correo al correo institucional del estudiante.
- El correo incluye: número de caso, resultado de la evaluación (aprobado/rechazado) y la justificación emitida por el miembro TEFIIS.
- El envío del correo se realiza en un tiempo máximo de **2 minutos** tras confirmar la resolución.
- En caso de fallo en el envío, el sistema reintenta el envío hasta 3 veces y registra el error si persiste.
- El miembro TEFIIS puede verificar desde el expediente si la notificación fue enviada exitosamente.

---

## Listado Consolidado

| ID | Nombre | Actor Principal | Prioridad |
|---|---|---|---|
| RF-3.1 | Asignación automática de caso a miembro TEFIIS | Sistema | Alta |
| RF-3.2 | Revisión del expediente del caso | Miembro TEFIIS | Alta |
| RF-3.3 | Registro del dictamen o resolución | Miembro TEFIIS | Alta |
| RF-3.4 | Visualización de casos con larga espera | Sistema / Miembro TEFIIS | Media |
| RF-3.5 | Notificación automática al estudiante por correo | Sistema | Alta |

---

## Interfaces con Otros Módulos

| Módulo | Tipo de Interfaz | Descripción |
|---|---|---|
| M2 – Gestión y Trazabilidad del Reclamo | Entrada | M3 recibe los casos formalizados y el historial de trazabilidad de M2. |
| M1 – Atención y Autoservicio del Estudiante | Salida | M3 actualiza el estado del caso visible para el estudiante en el módulo M1. |
| M4 – Asistencia Inteligente y Análisis | Salida | Los datos de resoluciones (tipo, resultado, tiempo de espera) alimentan el módulo analítico de M4. |
