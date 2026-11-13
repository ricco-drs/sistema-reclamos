# ADR-0005. Un solo repositorio con dos carpetas independientes

## Estado

Aceptado, 18/10/2026. Registrado a posteriori.

## Contexto

TEFIIS tiene dos aplicaciones web: la de estudiantes, junto con la API, y el panel del Tercio. Creamos las dos aplicaciones por separado porque no queríamos que los estudiantes llegaran al panel del Tercio desde su aplicación. El panel tiene otros usuarios, su propio inicio de sesión con Firebase y un despliegue aparte, y la aplicación de estudiantes no incluye ni su dirección ni su código. Las dos no comparten código.

Al empezar el curso, subimos cada aplicación a su propio repositorio: `ricco-drs/sistema-reclamos` y `ricco-drs/sistema-admin`. En la revisión de la semana 3, el profesor observó que el curso trabaja con un solo repositorio por equipo y que, con dos, el historial, los diagramas, los ADR y la evidencia quedaban repartidos.

Al analizarlo, vimos que el problema iba más allá de la entrega. Las dos aplicaciones forman un mismo sistema: el panel depende de la API, y el modelo C4 y los ADR describen ambas partes.

La API está desplegada en Railway, la aplicación de estudiantes en Cloudflare y el panel en Firebase Hosting, y al reorganizar no queríamos afectar esos despliegues.

## Decisión

Decidimos reunir ambas aplicaciones en `ricco-drs/sistema-reclamos`, con las carpetas `sistema-reclamos/` y `sistema-admin/`. La documentación (`docs/`) y la integración continua (`.github/`) las dejamos en la raíz porque son de todo el sistema.

Cada carpeta sigue siendo un proyecto independiente, con su propio `package.json` y `package-lock.json`, y se instala y despliega desde su ubicación. Hicimos la unión en los commits `b0fd232` y `d40ddae`; este último incorpora el panel con su commit `831de4b`. El repositorio `ricco-drs/sistema-admin` lo dejamos archivado.

## Alternativas consideradas

- **Mantener dos repositorios y declarar uno como el del proyecto.** No nos obligaba a mover archivos ni a cambiar rutas, pero la evidencia seguía repartida, los ADR y el modelo C4 quedaban separados de parte del código que describen y teníamos que coordinar dos pull requests cada vez que un cambio afectara a la API y al panel.
- **Reunir las aplicaciones en un repositorio con dos carpetas independientes.** Concentra el historial y la documentación sin cambiar la forma en que construimos y desplegamos cada aplicación. Es la alternativa que elegimos.
- **Fusionar las dos aplicaciones en una sola.** Evitaría instalar y desplegar dos proyectos, pero la aplicación pública de estudiantes cargaría también el código del panel, desde donde se accede a los documentos y datos de todos los estudiantes, y las dos sesiones quedarían en el mismo origen del navegador. Además, tendríamos que rehacer los despliegues. La descartamos porque mantenerlas separadas reduce lo que queda expuesto si falla la aplicación pública. La protección de los documentos no depende de esta separación: el bucket es privado y la API solo entrega URL firmadas después de verificar los permisos.
- **Crear un monorepo con npm workspaces.** Nos daba un único `package-lock.json` y la posibilidad de compartir los catálogos duplicados, pero teníamos que modificar la instalación y la construcción en Railway, Cloudflare y Firebase Hosting. La descartamos porque ese costo no se justifica por los pocos archivos que compartiríamos.

## Consecuencias

El trabajo del equipo queda en un solo historial, y un cambio en la API y su ajuste en el panel pueden entrar en el mismo pull request. Los despliegues no cambian: cada uno lo seguimos haciendo desde su carpeta.

Los catálogos siguen duplicados (`plan_software_2026.json` es idéntico en ambas carpetas), así que un cambio en el plan de estudios hay que aplicarlo dos veces.

La integración continua solo corre en `sistema-reclamos/`, por lo que no nos avisa si el panel deja de construir. Y como la carpeta se llama igual que el repositorio, la ruta de trabajo es `sistema-reclamos/sistema-reclamos`, algo que debemos indicar con claridad en las instrucciones de construcción.
