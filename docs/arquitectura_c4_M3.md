# Módulo M3 – Documentación de Arquitectura (Bosquejo C4)

**Responsable:** Christopher Albino  
**Módulo:** M3 – Evaluación y Resolución de Casos  
**Sistema:** TEFIIS – Sistema de Gestión de Reclamos Estudiantiles

---

## Nivel 1 – Diagrama de Contexto

El diagrama de contexto muestra el módulo M3 en relación con los actores que lo usan y los sistemas externos con los que interactúa. En este nivel se omiten los detalles técnicos internos; el objetivo es mostrar **quién usa el módulo** y **con qué sistemas se comunica**.

<img src="../../assets/c4_m3_nivel1_contexto.png" alt="Diagrama de Contexto M3" width="100%">

### Descripción de Elementos – Nivel 1

| Elemento | Tipo | Propósito |
|---|---|---|
| **Miembro TEFIIS** | Persona | Actor principal que opera el módulo: revisa expedientes, registra dictámenes y monitorea el panel de casos. |
| **Estudiante** | Persona | Actor externo que recibe pasivamente el resultado de su reclamo por correo; no interactúa directamente con M3. |
| **M3 – Evaluación y Resolución de Casos** | Sistema (módulo) | Núcleo de procesamiento: orquesta la asignación, evaluación y resolución de casos, y dispara las notificaciones automáticas. |
| **M2 – Gestión y Trazabilidad** | Sistema externo | Fuente de datos: provee los casos ya formalizados que M3 debe evaluar. |
| **M1 – Autoservicio del Estudiante** | Sistema externo | Consumidor de salida: muestra al estudiante el estado actualizado de su caso. |
| **M4 – Análisis Inteligente** | Sistema externo | Consumidor de datos: utiliza las resoluciones de M3 para alimentar dashboards y análisis. |
| **Servidor SMTP Institucional** | Sistema externo | Infraestructura de correo de la universidad usada para entregar las notificaciones al estudiante. |

---

## Nivel 2 – Diagrama de Contenedores

El diagrama de contenedores desglosa el interior del módulo M3 en sus principales bloques tecnológicos (contenedores). Cada contenedor es una unidad desplegable de forma independiente.

<img src="../../assets/c4_m3_nivel2_contenedores.png" alt="Diagrama de Contenedores M3" width="100%">

### Descripción de Elementos – Nivel 2

| Contenedor | Tecnología | Responsabilidad |
|---|---|---|
| **Aplicación Web (Frontend)** | React + Vite | Renderiza el panel de gestión de casos, la vista de expediente con historial, el formulario de dictamen y los indicadores de espera prolongada. Es la única interfaz con el Miembro TEFIIS. |
| **API de Negocio (Backend)** | Supabase Edge Functions / REST | Centraliza la lógica del dominio: asignación de casos, validación de dictámenes, consulta de expedientes y cálculo de tiempos de espera. Actúa como intermediario entre el frontend y la base de datos. |
| **Base de Datos** | PostgreSQL (Supabase) | Almacena de forma persistente todos los casos asignados a M3, los dictámenes emitidos, el historial de estados y el registro de notificaciones (enviadas, pendientes, fallidas). |
| **Servicio de Notificación** | Edge Function + Nodemailer | Se activa automáticamente al registrar un dictamen. Construye el mensaje de correo con el resultado y justificación, y lo despacha al servidor SMTP institucional con lógica de reintento. |

---

## Nivel 3 – Diagrama de Componentes

El diagrama de componentes desglosa el interior de la **API de Negocio**, mostrando los componentes lógicos que implementan cada requisito funcional del módulo.

<img src="../../assets/c4_m3_nivel3_componentes.png" alt="Diagrama de Componentes M3" width="100%">

### Descripción de Elementos – Nivel 3

| Componente | RF asociado | Responsabilidad |
|---|---|---|
| **Componente de Asignación** | RF-3.1 | Recibe los casos formalizados de M2, aplica la lógica de selección de miembro (menor carga activa) y registra la asignación con timestamp en la base de datos. |
| **Componente de Expediente** | RF-3.2 | Lee y consolida desde la base de datos todos los datos relevantes de un caso (información del estudiante, archivos adjuntos, historial de estados) y los expone en un único endpoint para el frontend. |
| **Componente de Dictamen** | RF-3.3 | Recibe y valida el resultado de la evaluación emitido por el Miembro TEFIIS. Verifica que la justificación cumpla el mínimo requerido, persiste la resolución, actualiza el estado del caso y dispara el evento hacia el Coordinador de Notificación. |
| **Monitor de Espera Prolongada** | RF-3.4 | Calcula periódicamente (o por demanda) el tiempo de espera de cada caso activo. Ordena el listado por antigüedad y marca aquellos que superan el umbral configurable como "espera prolongada". |
| **Coordinador de Notificación** | RF-3.5 | Responde al evento de dictamen registrado. Construye el payload del correo con el número de caso, resultado y justificación, y lo delega al Servicio de Notificación. También actualiza el registro de estado del envío en la base de datos. |

---

## Resumen de Flujo Principal (Happy Path)

<img src="../../assets/c4_m3_secuencia.png" alt="Diagrama de Secuencia M3" width="100%">

---

## Cómo guardar las imágenes

1. Genera cada diagrama en [plantuml.com/plantuml/uml/](https://www.plantuml.com/plantuml/uml/) usando el código PlantUML correspondiente.
2. Descarga cada imagen en formato **PNG**.
3. Crea la carpeta `docs/images/` dentro del repositorio si no existe.
4. Guarda cada PNG con exactamente este nombre:

| Diagrama | Nombre del archivo | Dónde guardarlo |
|---|---|---|
| Contexto (Nivel 1) | `c4_m3_nivel1_contexto.png` | carpeta `assets/` |
| Contenedores (Nivel 2) | `c4_m3_nivel2_contenedores.png` | carpeta `assets/` |
| Componentes (Nivel 3) | `c4_m3_nivel3_componentes.png` | carpeta `assets/` |
| Secuencia (Happy Path) | `c4_m3_secuencia.png` | carpeta `assets/` |
