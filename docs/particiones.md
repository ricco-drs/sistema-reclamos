# Particiones del backend (Lab09)

> **Estado:** propuesta. La partición elegida falta confirmarla con Ricco, que parte el build y amplía las reglas de límites.

## Qué se parte y por qué

El backend es un solo paquete. `server.js` tiene 2 351 líneas y 41 rutas, con HTTP, SQL, correo y reglas mezclados ([acoplamiento, 17/10](acoplamiento/2026-10-17.md)). Fuera de él solo hay dos rodajas ordenadas: los cursos resueltos (ADR-0002) y el registro de reclamos con su evento (#27). Las dos están repartidas en carpetas por capa: `dominio/`, `aplicacion/`, `infraestructura/` y `presentacion/`.

Partir el backend sirve sobre todo a la modificabilidad (E4): que un cambio quede en un solo lugar y que el build impida que una parte dependa de lo que no debe. Las dos alternativas parten el **código y el build**, no el despliegue: el sistema sigue siendo un proceso y una base de datos.

## Partición A: por módulos de negocio

Un módulo por cada parte del negocio. Cada uno tiene adentro sus propias capas (`dominio/`, `aplicacion/`, `infraestructura/`, `presentacion/`) y registra sus rutas.

| Módulo | Rutas | Qué contiene |
|---|---|---|
| `reclamos` | 12 | Registro, consulta del estudiante, bandeja, estados, cursos resueltos, respuestas por correo y pruebas adjuntas. Las dos rodajas que ya existen. |
| `configuracion` | 14 | Ventana de reclamos, modos almuerzo, mantenimiento, Tefi durmiendo y despedida, `/health` y el historial de actividad. |
| `documentos` | 8 | Documentos del SIGA del estudiante, los datos extraídos y los enlaces firmados. |
| `tefi` | 5 | Consultas a Tefi, carga de la base de conocimiento y auditoría de conversaciones. |
| `acceso` | 2 | Código de 4 dígitos por correo y sesión del estudiante; verificación de la sesión del admin. |
| `compartido` | 0 | Lo que usan todos sin ser de ninguno: cliente de PostgREST, envío de correo con sus tres proveedores, registro de actividad y almacenamiento. |

Un módulo **no importa a otro**. Lo que uno necesita del otro se lo pasa `server.js` al arrancar, como ya hace el #27: el registro de reclamos recibe la política de recepción (que lee los interruptores de `configuracion`) por un puerto, sin importarla. Todos pueden importar `compartido`, y `compartido` no importa ningún módulo.

## Partición B: por capas técnicas

Un paquete por capa, compartido por todas las partes del negocio. Es extender a todo el sistema la forma que hoy tienen las dos rodajas.

| Paquete | Qué contiene |
|---|---|
| `dominio` | Las reglas de todas las partes: reclamos, cursos resueltos, interruptores, documentos y Tefi. |
| `aplicacion` | Los casos de uso de todas las partes. |
| `infraestructura` | PostgREST, correo, almacenamiento, Gemini y el bus de eventos. |
| `presentacion` | Las 41 rutas de Express y los middlewares de sesión. |

Las dependencias van hacia adentro: `presentacion` → `aplicacion` → `dominio`, e `infraestructura` implementa los puertos del dominio. Son las reglas que ya vigila dependency-cruiser.

## Cuadro por escenario

Los escenarios van en el orden de prioridad del informe (tabla 2.7). «Empate» quiere decir que las dos cumplen la medida del escenario igual de bien.

| Prioridad | Escenario | A: por módulos | B: por capas | Ventaja |
|---|---|---|---|---|
| 1 | **E1 Disponibilidad**: 200 reclamos al cierre del plazo, sin perdidos ni repetidos | Igual que hoy: la numeración sale de la secuencia de PostgreSQL y la partición no cambia el proceso ni la base. Todo el registro queda en `reclamos`. | Igual que hoy. El registro queda repartido entre `dominio`, `aplicacion` e `infraestructura`. | Empate |
| 2 | **E4 Modificabilidad**: subir el historial de 50 a 100 sin tocar nada fuera de `dominio/` y `tests/` | Se cambia un archivo en `reclamos/dominio/`. Ningún otro módulo depende de ese dominio, así que el cambio no alcanza a nadie más. | También es un archivo en `dominio/`, pero ese paquete lo comparten las cinco partes del negocio: todo el que importa el dominio queda alcanzado por el cambio, aunque no use los cursos resueltos. | **A** |
| 3 | **E6 Auditabilidad**: cada decisión con autor y fecha | El registro de actividad está en `compartido` y lo usan todos los módulos. | El registro de actividad está en `infraestructura`. | Empate |
| 4 | **E3 Seguridad**: matriz ruta × actor con el código esperado | Los middlewares de sesión están en `acceso` y `server.js` se los pasa a cada módulo. La matriz se prueba por HTTP, sin importar dónde viva cada ruta. | Las 41 rutas y los middlewares están juntos en `presentacion`. La matriz se prueba igual. | Empate |
| 5 | **E5 Confiabilidad**: si Brevo falla, otro proveedor envía | La cadena de proveedores vive en un solo lugar, `compartido`. | La cadena de proveedores vive en un solo lugar, `infraestructura`. | Empate |
| 6 | **E2 Rendimiento**: la bandeja con 1 500 reclamos en menos de 1,5 s | La partición no cambia la consulta ni el proceso. Paginar la bandeja toca solo `reclamos`. | La partición no cambia la consulta ni el proceso. Paginar toca `infraestructura` y `presentacion`. | Empate |

Que casi todo empate es lo esperado: las dos particiones ordenan el código, no lo que pasa en ejecución. E1, E2 y E5 se juegan en la base, en la red y en los proveedores, y ninguna partición los toca.

## Criterio de desempate

Se recorre el cuadro en el orden de prioridad del informe (E1, E4, E6, E3, E5, E2) y decide el primer escenario donde una partición es mejor. Ese orden ya estaba fijado antes de comparar las particiones, así que no se elige el criterio a la medida del resultado.

## La elegida: A, por módulos de negocio

E1, el escenario más importante, empata. Decide E4, el segundo: en A, un cambio de reglas queda dentro de su módulo y no alcanza a las demás partes del negocio; en B, el dominio de todo el sistema es un solo paquete.

Además, es la partición que el equipo ya se comprometió a medir: el [informe de acoplamiento](acoplamiento/2026-10-17.md) dice que la partición habrá funcionado si aparecen módulos de reclamos, acceso, Tefi, documentos y configuración, y si el backend deja de importar `src/data`.

Lo que se acepta a cambio:

- **Mover lo que ya existe.** Los archivos de las dos rodajas pasan de `backend/dominio/`, `backend/aplicacion/`, etc. a `backend/modulos/reclamos/`. Con B no habría que mover nada.
- **Más reglas.** Las tres reglas de capa se aplican dentro de cada módulo, y se suman las de independencia entre módulos.
- **Que `compartido` no se vuelva un cajón de sastre.** Solo entra lo técnico que usan dos módulos o más, sin reglas de negocio, y no puede importar ningún módulo.

## Qué cambia en el build y en las reglas

Esto lo implementa Ricco y la forma exacta la decide él; aquí queda lo que la partición pide.

- **Build.** `sistema-reclamos/package.json` declara los módulos como workspaces de npm (`backend/compartido` y `backend/modulos/*`), cada uno con su `package.json` y sus dependencias explícitas: por ejemplo, Gemini solo en `tefi` y `firebase-admin` solo en `acceso`.
- **Reglas de límites**, en `.dependency-cruiser.cjs`:
  - las tres reglas actuales (`dominio-limpio`, `aplicacion-sin-infraestructura`, `dominio-sin-paquetes`), aplicadas dentro de cada módulo;
  - un módulo no importa a otro: desde `modulos/X/` hacia `modulos/Y/`, con Y distinto de X;
  - `compartido` no importa ningún módulo;
  - ningún archivo del backend importa `src/` (el catálogo de cursos pasa a `reclamos`).
- **Arranque.** `server.js` queda como el único lugar que conecta los módulos: crea `compartido`, le pasa a cada módulo lo que necesita y registra sus rutas.

## Cómo se comprueba

- La captura del build en rojo con un import prohibido de cada regla nueva, y en verde al quitarlo, como en el #23.
- En la semana 13, los mismos comandos del [informe de acoplamiento](acoplamiento/2026-10-17.md#qué-se-compara-en-la-semana-13): aparecen los cinco módulos, con el dominio de cada uno en I cercano a 0; el backend no importa `src/data`; y las reglas siguen en verde.
