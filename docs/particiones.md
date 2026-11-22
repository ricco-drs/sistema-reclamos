# Particiones del backend (Lab09)

> **Estado:** confirmada. Ricco confirmó la partición B (por módulos de negocio) en la revisión del #42. El #50 la lleva al build en dos partes: la primera declara los workspaces, mueve `reclamos`, crea `notificaciones` y `compartido` y amplía las reglas; la segunda reparte las 39 rutas restantes y deja `server.js` como punto de arranque. Ver [Cómo quedó en el build](#cómo-quedó-en-el-build).

## Qué se parte y por qué

El backend es un solo paquete. `server.js` tiene 2 351 líneas y 41 rutas, con HTTP, SQL, correo y reglas mezclados ([acoplamiento, 17/10](acoplamiento/2026-10-17.md)). Fuera de él hay unas pocas piezas ordenadas: los cursos resueltos (ADR-0002), el registro de reclamos con su evento (#27) y el enviador de correo con timeout (#34). Todas están repartidas en carpetas por capa: `dominio/`, `aplicacion/`, `infraestructura/` y `presentacion/`.

Las dos alternativas parten el **código y el build**, no el despliegue: el sistema sigue siendo un proceso y una base de datos. Es un monolito modular, no microservicios.

## Partición A: por capas técnicas

La que haríamos sin pensarlo mucho, porque sigue las carpetas que ya existen: un paquete por capa, compartido por todas las partes del negocio.

| Paquete | Qué contiene |
|---|---|
| `dominio` | Las reglas de todas las partes: reclamos, cursos resueltos, interruptores, documentos y Tefi. |
| `aplicacion` | Los casos de uso de todas las partes. |
| `infraestructura` | PostgREST, correo, almacenamiento, Gemini y el bus de eventos. |
| `presentacion` | Las 41 rutas de Express y los middlewares de sesión. |

Las dependencias van hacia adentro: `presentacion` → `aplicacion` → `dominio`, e `infraestructura` implementa los puertos del dominio. Son las reglas que ya vigila dependency-cruiser.

## Los cuatro rastros

La partición B sale de estos cuatro rastros, no de las carpetas.

**1. La palabra cambia de significado.**

- **«Estado»** no es lo mismo para el Tercio que para el estudiante. Para el Tercio es el estado de trabajo, que va y viene mientras delibera (`PENDIENTE`, `EN_REVISION`, `ACEPTADO`…). Para el estudiante es el último estado que se le comunicó por correo: `GET /api/reclamos/mine/:id` lo arma desde `respuestas_reclamo`, no desde el estado interno (`backend/modulos/reclamos/presentacion/rutas.js`).
- **«Cursos»** son, para el estudiante, los que pidió retirar o matricular. Para el Tercio son los que de verdad se resolvieron (`cursos_resueltos`, ADR-0002), y esos el estudiante no los ve.
- **«Documento»** del SIGA es del estudiante y se reutiliza de un reclamo al siguiente. La prueba (evidencia) es de un solo reclamo.

Los dos primeros casos ocurren dentro del reclamo y sobre la misma tabla, así que no los separamos: separarlos dejaría dos módulos escribiendo la misma tabla. El tercero sí marca una frontera entre `documentos` y `reclamos`.

**2. Las cosas cambian juntas.** Este rastro casi no ayuda, y lo decimos así: de los 65 commits de `develop` (sin contar merges), solo 5 tocan el backend, y uno de ellos es el traslado de la carpeta. Se cuentan con:

```
git rev-list --count --no-merges origin/develop
git rev-list --count --no-merges origin/develop -- sistema-reclamos/backend
```

Con una muestra tan chica no se puede sostener una frontera. Lo poco que hay apunta al mismo lado: `3f5c8ae` (registro de reclamos) y `dbbc5db` (cursos resueltos) tocan tres o cuatro capas de una sola capacidad, `603d2e4` solo el correo y `c60a88f` solo una prueba. Ninguno toca dos capacidades a la vez.

**3. Hay un dueño distinto.**

- El **Tercio** pide cambios en la bandeja, los estados, los cursos resueltos y las respuestas.
- El **administrador principal** es dueño de los interruptores, del historial de actividad y del corpus de Tefi: Los módulos `configuracion` y `tefi` exigen su correo en las seis rutas de interruptores, en `/api/admin/activity` y al indexar documentos de Tefi.
- El **estudiante** es dueño de su registro, de sus documentos y de sus preguntas a Tefi.

**4. Los datos tienen ciclos distintos.**

- `app_settings` (interruptores) se lee en cada reclamo y en cada pregunta a Tefi, con una caché de 10 s, y se escribe pocas veces y a mano.
- `reclamos` se escribe en ráfagas al cierre del plazo (E1), y después el Tercio lo actualiza de uno en uno.
- `documentos_estudiante` se escribe una vez por estudiante y se reutiliza en sus reclamos.
- `conversaciones` crece con cada pregunta a Tefi y nadie la modifica.

## Partición B: por módulos de negocio

Un módulo por cada capacidad que muestran los rastros. Cada uno tiene adentro sus propias capas y registra sus rutas.

| Módulo | Rutas | Qué contiene | Rastro que lo separa |
|---|---|---|---|
| `reclamos` | 12 | Registro, consulta del estudiante, bandeja, estados, cursos resueltos, respuestas por correo, confirmación heredada y pruebas adjuntas. | Dueño (el Tercio) y ciclo de datos (ráfagas al cierre). |
| `notificaciones` | 0 | Los consumidores de `ReclamoRegistrado`: el correo de confirmación al estudiante y el expediente a M2. Se agregó al implementar el #50. | Reacciona a lo que pasa en `reclamos` sin escribir sus tablas, y sus fallas (el correo, M2) no deben tocar el registro (E5). |
| `configuracion` | 14 | Ventana de reclamos, modos almuerzo, mantenimiento, Tefi durmiendo y despedida, `/health` y el historial de actividad. | Dueño (el administrador principal) y ciclo de datos (se lee siempre, se escribe a mano). |
| `documentos` | 8 | Documentos del SIGA del estudiante, los datos extraídos y los enlaces firmados. | Palabra («documento» frente a «prueba») y ciclo de datos (una vez por estudiante). |
| `tefi` | 5 | Consultas a Tefi, carga de la base de conocimiento y auditoría de conversaciones. | Ciclo de datos (crece con cada pregunta). |
| `acceso` | 2 | Código de 4 dígitos por correo y sesión del estudiante; verificación de la sesión del admin. | Lo usan todos los módulos y no es de ninguno. |
| `compartido` | 0 | Cliente de PostgREST, envío de correo con sus proveedores, registro de actividad y almacenamiento. | Técnico, sin reglas de negocio. |

Un módulo **no importa a otro**. Lo que uno necesita del otro se lo pasa `server.js` al arrancar, como ya hace el #27: el registro de reclamos recibe la política de recepción (que lee los interruptores de `configuracion`) por un puerto, sin importarla. Todos pueden importar `compartido`, y `compartido` no importa ningún módulo.

## Confrontación con los escenarios

Las cuatro preguntas del paso 3, escenario por escenario y en el orden de prioridad del informe (tabla 2.7).

**Partición A, por capas:**

| Escenario | ¿Cuántos módulos toca? | ¿Necesita datos del otro lado? | ¿Escala solo? | ¿Se prueba sin levantar todo? |
|---|---|---|---|---|
| **E1** Disponibilidad: 200 reclamos al cierre | Cuatro paquetes: el registro está en `presentacion`, `aplicacion`, `dominio` e `infraestructura` (el #27 tocó tres de ellos). | Sí, y sin contrato: los interruptores viven en los mismos paquetes, y nada impide que el registro lea `app_settings` directamente. | No: un solo proceso. | Sí: el caso de uso se prueba con dobles. |
| **E4** Modificabilidad: historial de 50 a 100 | Uno: `dominio`. | No. | No aplica: no hay carga. | Sí. |
| **E3** Seguridad: matriz ruta × actor | Dos: los middlewares en `presentacion` y las consultas filtradas por correo en `infraestructura`. | No. | No aplica. | Solo montando las 41 rutas: todas viven en `presentacion`. |
| **E6** Auditabilidad: autor y fecha de cada decisión | Tres: el historial en `dominio`, el registro de actividad en `infraestructura` y el autor del token en `presentacion`. | Escribe `activity_log`, que escriben todas las partes. | No aplica. | Sí: la prueba de la rodaja comprueba que el autor sale del token. |
| **E2** Rendimiento: la bandeja con 1 500 reclamos | Dos: la ruta en `presentacion` y la consulta paginada en `infraestructura`. | No. | No: la lectura del panel cae en el mismo proceso que los envíos de los estudiantes. | No: se mide con k6 sobre Compose. |
| **E5** Confiabilidad: si Brevo falla, otro proveedor envía | Uno: el enviador de correo en `infraestructura`. | No. | No aplica. | Sí: hay pruebas con proveedores falsos (#34). |

**Partición B, por módulos:**

| Escenario | ¿Cuántos módulos toca? | ¿Necesita datos del otro lado? | ¿Escala solo? | ¿Se prueba sin levantar todo? |
|---|---|---|---|---|
| **E1** Disponibilidad | Uno: `reclamos`. | Sí, los interruptores de `configuracion`, pero por contrato: el puerto `PoliticaDeRecepcion` que inyecta `server.js`. | No: un solo proceso. Pero es justo el módulo que recibe la carga del cierre, y queda aislado si algún día hay que sacarlo. | Sí, con dobles en la frontera: la política y el repositorio en memoria. |
| **E4** Modificabilidad | Uno: `reclamos`. | No. | No aplica. | Sí. |
| **E3** Seguridad | Dos: las cinco rutas de la matriz son de `reclamos`, y los middlewares son de `acceso`. | Sí, los middlewares de `acceso`, por contrato: `server.js` se los pasa. | No aplica. | Sí: se monta solo `reclamos`, con un verificador falso de Firebase, sin las otras 36 rutas. |
| **E6** Auditabilidad | Uno: `reclamos`, más el registro de actividad de `compartido`. | Escribe `activity_log`, pero a través de `compartido`, no directo. | No aplica. | Sí. |
| **E2** Rendimiento | Uno: `reclamos`. | No. | No: un solo proceso, igual que en A. | No: se mide con k6 sobre Compose. |
| **E5** Confiabilidad | Ninguno: el correo está en `compartido`. | No. | No aplica. | Sí: hay pruebas con proveedores falsos (#34). |

**Resumen.** Las dos particiones ordenan el código, no lo que pasa en ejecución, así que ninguna cambia por sí sola si E1, E2 o E5 cumplen su medida. Lo que cambia es cuánto hay que tocar y si la frontera la protege el build.

| Prioridad | Escenario | Ventaja | Por qué |
|---|---|---|---|
| 1 | E1 | **B** | Un módulo en vez de cuatro paquetes, y los interruptores llegan por contrato en vez de por acceso libre. |
| 2 | E4 | **B** | Las dos cumplen la medida con un archivo de dominio. Pero en B el build impide que otro módulo dependa del dominio de reclamos, y en A eso depende de que nadie se equivoque. |
| 3 | E3 | **B** | La matriz se prueba montando solo `reclamos`. |
| 4 | E6 | **B** | Un módulo y `compartido`, en vez de tres paquetes. |
| 5 | E2 | **B**, leve | Paginar toca un módulo en vez de dos paquetes. La medida depende de la consulta, no de la partición. |
| 6 | E5 | Empate | El correo vive en un solo lugar en las dos. |

## Criterio de desempate

Lo fijamos antes de comparar: se recorren los escenarios en el orden de prioridad del informe (E1, E4, E3, E6, E2, E5) y decide el primero donde una partición tiene ventaja. Así no se elige el criterio a la medida del resultado. En este caso no hizo falta, porque B tiene ventaja desde E1.

## La elegida: B, por módulos de negocio

En E1, el escenario más importante, cumplirlo con A obliga a tocar cuatro paquetes y deja que el registro lea los interruptores sin contrato; con B, todo queda en `reclamos` y lo que necesita de `configuracion` le llega por un puerto. En E4, las dos cumplen la medida, pero solo en B el build impide que otra parte dependa del dominio de reclamos. A no gana en ningún escenario: lo único que tiene a favor es que no obliga a mover nada.

Además, es la partición que ya nos comprometimos a medir: el [informe de acoplamiento](acoplamiento/2026-10-17.md) dice que la partición habrá funcionado si aparecen módulos de reclamos, acceso, Tefi, documentos y configuración.

## Las cuatro señales del monolito distribuido

Revisadas para la elegida:

1. **Se despliegan juntos o no funcionan.** Se despliegan juntos a propósito: es un monolito modular, con un solo despliegue. La señal habla de servicios separados que no se pueden publicar por separado, y aquí no hay servicios separados, ni red ni versiones entre ellos que coordinar. Lo que B asegura es que un módulo cambie sin tocar a los demás, y eso lo vigila el build.
2. **Comparten la misma base de datos.** Es una sola base, pero cada tabla la escribe un solo módulo: `reclamos` y `respuestas_reclamo` (reclamos), `documentos_estudiante` (documentos), `app_settings` (configuracion), y `conversaciones` y `chat_historial` (tefi). Esta señal juega a favor de B. La excepción es `activity_log`: la escriben todos a través de `compartido`, y la leen `reclamos` (quién atendió cada reclamo) y `configuracion` (el historial). Es un registro al que solo se le agregan filas, pero queda como el punto a vigilar.
3. **Un cambio de contrato rompe a tres.** `ReclamoRegistrado` lo consumen dos (el correo y M2) y lleva `version`; el puerto `PoliticaDeRecepcion` lo usa solo `reclamos`. El contrato que sí alcanza a todos es el de `compartido` (PostgREST, correo y actividad), y por eso `compartido` se mantiene chico y sin reglas de negocio.
4. **Una caída deja todo inservible.** Si cae el proceso o Supabase, cae todo, en A y en B: es el precio de un solo despliegue y una sola base. Pero las fallas de lo externo quedan en su módulo: si Gemini falla, solo falla `tefi`; si el correo o M2 fallan, el reclamo igual se registra, porque el bus no espera a los consumidores (#27).

Ninguna de las cuatro descarta B. La 2 y la 4 dejan dos cosas a vigilar: `activity_log` y la base única.

## Qué gana, qué pierde y qué nos haría cambiar de idea

**Gana:** E1, E4 y E6 quedan dentro de un módulo; las dependencias entre módulos son puertos explícitos que inyecta `server.js`; el build impide cruzar las fronteras; y `reclamos` queda aislado si algún día el cierre del plazo pide escalarlo aparte.

**Pierde:**

- Hay que mover lo que ya existe: los archivos de las rodajas pasan de `backend/dominio/`, `backend/aplicacion/`, etc. a `backend/modulos/reclamos/` y a `backend/compartido/`. Con A no habría que mover nada.
- Hay más reglas: las de capa dentro de cada módulo, más las de independencia entre módulos.
- `acceso` hay que pasárselo a cada módulo, en vez de tenerlo junto a todas las rutas.
- `compartido` puede volverse un cajón de sastre si no se vigila.

**Cambiaríamos de idea si:**

- después de partir, los commits del backend tocan dos o más módulos a la vez de forma habitual (se mide con `git log` por carpeta en la semana 13);
- cada semana aparecen puertos nuevos entre módulos, porque eso querría decir que la frontera corta por la mitad de una capacidad;
- un módulo necesita leer las tablas de otro, en vez de pedírselo por un puerto;
- `compartido` empieza a recibir reglas de negocio.

## Cómo quedó en el build

Ricco preparó los workspaces, el registro de reclamos y sus consumidores en el #67. Lenin completó la migración de rutas y las pruebas de integración del #50.

- **Build.** `sistema-reclamos/package.json` declara los workspaces de npm `backend/compartido` y `backend/modulos/*`. Cada módulo tiene su `package.json`, con su nombre bajo `@tefiis/`, sus dependencias explícitas y un `exports` que solo deja entrar por su `index.js`: si alguien importa `@tefiis/reclamos/dominio/reclamo.js`, Node lo rechaza. `server.js` importa cada módulo por su paquete.
- **Esto no reabre el ADR-0005.** Ese ADR descartó un monorepo con workspaces que uniera la aplicación de estudiantes y el panel, porque obligaba a cambiar la instalación y la construcción en Railway, Cloudflare y Firebase Hosting. Estos workspaces viven solo dentro de `sistema-reclamos/`: el panel no se toca, y Railway y Cloudflare siguen construyendo desde `sistema-reclamos/`, como hoy. `npm ci` y `npm install` enlazan los módulos solos.
- **Reglas de límites**, en `.dependency-cruiser.cjs`, con la misma herramienta de la semana 6:
  - las tres reglas de capas (`dominio-limpio`, `aplicacion-sin-infraestructura`, `dominio-sin-paquetes`), ahora dentro de cada módulo; además, el dominio y la aplicación no pueden importar `compartido`, que es técnico;
  - `modulo-no-importa-otro-modulo`: desde `modulos/X/` hacia `modulos/Y/`, con Y distinto de X, sea por el paquete o por una ruta relativa;
  - `compartido-no-importa-modulos` y `modulo-no-importa-el-arranque`: `compartido` no depende de ningún módulo, y ningún módulo depende de `server.js`;
  - `entrada-publica-de-los-modulos` y `entrada-publica-de-compartido`: desde fuera, solo se entra por el `index.js`;
  - `paquetes-declarados`: cada módulo declara en su `package.json` los paquetes de npm que importa. Por ejemplo, `reclamos` declara `express` porque registra sus rutas.
- **Implementación:**
  - `reclamos` agrupa el registro y su evento, la bandeja, el seguimiento del estudiante, las respuestas, las evidencias y los cursos resueltos. Recibe la política de recepción, la sesión y el acceso a archivos desde el arranque.
  - `notificaciones`, **nuevo**, acordado con Roy: los dos consumidores de `ReclamoRegistrado`, `componerConfirmacion` y el cliente de M2. Ninguno de los cinco módulos de la tabla calzaba con ellos, y el Lab10 (paso 6) pide que el consumidor viva en un módulo distinto del que publica. No importa a `reclamos`: el nombre del evento se lo pasa `server.js`, de cada evento usa solo `id`, `email`, `nombre` y `categoria`, y la descripción la lee por el puerto `FuenteDeExpedientes`, que define él e implementa `reclamos` (`obtenerParaExpediente`). El evento sigue en la versión 1, sin la descripción. `backend/tests/flujoReclamoRegistrado.test.js` prueba ese contrato fuera de los dos módulos.
  - `acceso` emite y verifica sesiones de estudiante, verifica tokens de Firebase y controla los permisos del panel. Los demás módulos reciben sus middlewares al arrancar.
  - `configuracion` concentra los interruptores, el historial de actividad y `/health`. Entrega por función los modos que consultan `reclamos`, `documentos` y `tefi`, y lee el nombre del store del RAG desde `app_settings`.
  - `documentos` guarda los documentos académicos y datos extraídos, firma enlaces y facilita la comprobación de propiedad y el almacenamiento de evidencias que usa `reclamos`.
  - `tefi` agrupa RAG, historial de chat y auditoría de conversaciones. Solo este módulo usa Gemini en el backend.
  - `compartido` contiene el cliente de PostgREST, el almacenamiento, el registro de actividad, el envío y las plantillas de correo, el bus y los utilitarios HTTP.
- **Pruebas por módulo.** `npm run test:modulos` ejecuta las suites propias de `acceso`, `reclamos`, `notificaciones` y `compartido`. `reclamos` se monta en un Express aparte con sesiones de prueba. `acceso` prueba el inicio de sesión y los permisos con un verificador de Firebase simulado. Las pruebas que cruzan módulos están en `backend/tests/` y en `pruebas/probar-registro-con-bus.mjs`.
- **El catálogo de cursos** (`src/data/cursos_secciones.json`) se queda donde está, porque también lo importa `useReclamos.ts`, del front. Lo lee `server.js` y se lo pasa a `reclamos`, así que ningún módulo lo importa.
- **Arranque.** `server.js` conecta los módulos y sus consumidores, monta los routers y aplica CORS y el manejo de errores HTTP. El contrato de las 41 rutas conserva sus métodos, URLs y requisitos de sesión.

## Cómo se comprueba

- La captura del build en rojo con un import prohibido de cada regla nueva, y en verde al quitarlo, como en el #23. La salida está en [lab09-reglas-de-limites.txt](evidencias/lab09-reglas-de-limites.txt).
- En la semana 13, los mismos comandos del [informe de acoplamiento](acoplamiento/2026-10-17.md#qué-se-compara-en-la-semana-13): aparecen los seis módulos, con el dominio de cada uno en I cercano a 0, y las reglas siguen en verde.
