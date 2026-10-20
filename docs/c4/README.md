# Modelo C4 de TEFIIS

Sección 3 del informe de arquitectura. Los tres niveles se derivan del archivo [workspace.dsl](workspace.dsl), escrito en Structurizr DSL. Cada figura modela fielmente lo que existe en el código del repositorio: los dos clientes que forman el sistema (la aplicación de estudiantes y el panel en `sistema-admin`), los servicios externos con los que se comunica y, en el tercer nivel, la arquitectura modular interna de la API TEFIIS.

Para el detalle de responsabilidad de cada elemento en una sola línea, consultar [leyenda.md](leyenda.md).

## Leyenda de Notación C4

| Forma y color | Tipo | Qué representa |
| :--- | :--- | :--- |
| **Silueta azul oscuro** | Persona (`Person`) | Quien usa el sistema: Estudiante UNI-FIIS, Miembro del tercio estudiantil o Administrador del sistema. |
| **Rectángulo azul** | Sistema (`Software System`) | TEFIIS visto como una sola caja central. |
| **Rectángulo gris** | Sistema externo | Servicios de terceros que el equipo consume pero no controla (Gemini, Proveedores de correo, Firebase, Servicio M2). |
| **Rectángulo azul medio** | Contenedor (`Container`) | Piezas que se ejecutan o despliegan por separado (frontends React o la API Express). Entre corchetes, su tecnología real. |
| **Cilindro azul medio** | Almacén de datos | Contenedores que persisten datos: la base PostgreSQL o el Storage de evidencias en Supabase. |
| **Rectángulo celeste** | Componente (`Component`) | Módulos lógicos de negocio que agrupan responsabilidades dentro de la API TEFIIS. |
| **Marco con borde azul** | Límite de sistema | Delimita los contenedores que forman parte de TEFIIS. |
| **Flecha con etiqueta** | Relación | Describe la acción mediante un verbo y, entre corchetes, el protocolo de red (`HTTPS`, `JSON/HTTPS`, `In-process`). |

---

## Figura 1. Contexto

![Contexto del sistema TEFIIS](img/Contexto.svg)

*Leyenda generada:* [Contexto-key.svg](img/Contexto-key.svg)

* **Qué muestra:** TEFIIS como una sola caja central, los tres actores que interactúan con él mediante portales web (Estudiante UNI-FIIS, Miembro del tercio estudiantil y Administrador del sistema) y los cuatro servicios externos de los que depende: Proveedores de correo (Brevo, Resend, Mailjet), Gemini API (RAG de Tefi), Firebase Authentication (seguridad del panel) y el Servicio M2 (recibe el expediente de cada reclamo).
* **Observación del equipo:** Brevo no es un punto único de falla porque el backend implementa respaldo automático en cascada: `Brevo -> Resend -> Mailjet` (`server.js:311-333`). No obstante, el modelado reveló que las llamadas carecen de timeout (pudiendo demorar la respuesta web si un proveedor se cuelga) y que, si los tres proveedores agotan su cuota a la vez, el envío falla síncronamente al no contar con una cola de reintentos en segundo plano. Por el contrario, Gemini y Firebase sí constituyen dependencias externas sin alternativa.

---

## Figura 2. Contenedores

![Contenedores de TEFIIS](img/Contenedores.svg)

*Leyenda generada:* [Contenedores-key.svg](img/Contenedores-key.svg)

* **Qué muestra:** La arquitectura de ejecución de TEFIIS en 5 contenedores: dos aplicaciones web cliente en React (`Aplicación de estudiantes` y `Panel del Tercio y Administración`), la `API TEFIIS` en Node.js 22 / Express 5, y dos almacenes de datos desacoplados en Supabase (`Base de datos PostgreSQL` y `Storage de Archivos`), junto con sus protocolos reales de red.
* **Observación del equipo:** Una sola API concentra todas las reglas de negocio y auditoría. El panel administrativo (`sistema-admin/`) y la aplicación de estudiantes (`sistema-reclamos/`) están en carpetas del mismo repositorio y dependen de forma síncrona de la misma API backend. Supabase cumple dos roles arquitectónicos distintos que se modelan por separado: persistencia relacional transaccional (PostgreSQL) y almacenamiento de evidencias PDF mediante URLs firmadas seguras (Storage). La aplicación de estudiantes llama directamente al Servicio M2 al enviar un reclamo, sin pasar por la API.

---

## Figura 3. Componentes

![Componentes de la API TEFIIS](img/Componentes.svg)

*Leyenda generada:* [Componentes-key.svg](img/Componentes-key.svg)

* **Qué muestra:** El interior del contenedor central (`API TEFIIS`), descompuesto en sus 6 componentes funcionales de negocio: `Autenticación y Autorización`, `Gestión de Reclamos y Cursos`, `Asistente Virtual Tefi (RAG)`, `Notificaciones`, `Auditoría y Trazabilidad` y `Gestión de Documentos`, mostrando sus interacciones internas y conexiones hacia los datos y servicios externos.
* **Observación del equipo:** El diagrama evidencia la arquitectura modular lógica del backend. En el código actual, varias de estas responsabilidades conviven en el archivo monolítico `server.js` y módulos de `backend/`. El modelo C4 delimita las fronteras de responsabilidad que servirán como mapa para la refactorización modular del backend.

---

## Decisiones de Modelado

- Las relaciones de contexto y de contenedores se declaran antes que las de componentes en [workspace.dsl](workspace.dsl) para que Structurizr preserve la claridad semántica de cada nivel.
- Se abre únicamente la `API TEFIIS` por ser el contenedor que concentra las reglas de negocio, manteniendo cerrados los demás.
- Cada componente agrupa una responsabilidad clara de negocio descrita en una sola línea, cumpliendo con la regla de mantener entre 4 y 8 componentes por contenedor.
- Todas las relaciones incluyen un verbo de acción y su protocolo formal (`JSON/HTTPS`, `In-process`, `Llamada a función`).
