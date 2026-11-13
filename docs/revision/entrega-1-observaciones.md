# Observaciones del docente: Entrega 1

Revisión del 20 de octubre de 2026 sobre el commit `c42fa5d`, el que declara el informe. La entrega llegó el martes 20 a las 09:22, después del sábado 17 a las 08:00 pero dentro del plazo de tardanza, así que la nota lleva 3 puntos menos, como dice el enunciado.

La nota ya está en UNIVIRTUAL. Este archivo es el detalle de por qué, y sirve para la entrega final.

**Cómo se cierra.** Respondan en un comentario de este pull request qué van a hacer con cada viñeta de las secciones 1 a 9. Lo que decidan no hacer también vale, siempre que quede escrito el porqué. Cuando hayan respondido todas, intégrenlo con **Squash and merge** (no con *Close pull request*) y borren la rama, como vimos en el taller: así este archivo queda en `docs/revision/` y el issue se cierra solo.

## Lo que está bien hecho

- **La rodaja es sólida y está bien verificada.** La capacidad de cursos resueltos entra por la ruta real del panel, pasa por el caso de uso y se guarda por el puerto `RepositorioCursosResueltos`, con dos adaptadores que pasan la misma prueba.
- **La regla `dominio-limpio` sí vigila.** Le agregué a propósito un import de infraestructura al dominio y falló. La CI de `c42fa5d` está en verde con las 12 pruebas.
- **Los escenarios dicen con qué se miden y quién los corre**, y aplicaron la crítica del Equipo 3 con un antes y un después.
- **Los tres ADR comparan alternativas reales con su costo**, y las consecuencias incluyen las negativas.

## 1. Escenarios de calidad

- **El orden no sale del criterio que declaran.** Dicen que la prioridad sale del impacto, pero cuatro escenarios tienen impacto Alto (E1, E4, E6 y E3). El texto da razones para ese orden, pero no salen del criterio declarado. Agreguen el criterio de desempate a la regla de priorización.
- **Varios instrumentos dependen de piezas que todavía no existen**: `pruebas/generar-tokens.js` y `scripts/sembrar-reclamos.js` están «por crear», y el entorno de Docker Compose llega en la semana 11. Pónganles un responsable con nombre y la semana en que cada pieza estará lista: hoy dicen «quien arma Compose».

## 2. Modelo C4

- **El nivel de componentes no coincide con el código.** Describe seis fronteras lógicas que siguen dentro de `server.js`, y no muestra el puerto ni los dos adaptadores de la rodaja, que son justamente lo que separaron.
- **El pie de la figura 3.2 dice que las dos aplicaciones viven en repositorios distintos**, pero el panel ya está en `sistema-admin/` de este mismo repositorio.

## 3. Decisiones de arquitectura

- **El contexto del ADR-0001 del informe está desactualizado**: dice que el panel está en el repositorio `sistema-admin`, aparte. El archivo `docs/adr/0001` del repositorio ya lo corrige, pero el informe no coincide con él.
- **Falta el ADR de la unión de los dos repositorios.** Se lo pedí en el pull request #1 de la semana 3: unirlos fue una decisión de arquitectura y tiene que quedar escrita.

## 4. Rodaja vertical

Le falta poco para estar completa:

- El dominio es delgado: dos funciones puras, sin una entidad.
- `ErrorDeCursos` lleva el código HTTP dentro del dominio (ya lo reconocen en el informe).
- La regla no impide que `aplicacion/` importe infraestructura ni que el dominio importe paquetes de npm como `express`. Amplíenla.

## 5. Informe y repositorio

- **El informe no cuenta lo mismo que el repositorio.** El registro de versiones pone el C4 el 23/09, pero sus commits son del 17 al 20 de octubre. Además, el ADR-0001, la figura 3.2 y la sección 8 siguen describiendo dos repositorios.
- **El comando de la tabla 1.2 no funciona tal como está escrito**: el `cd sistema-reclamos` lleva a la raíz del clon, y el `package.json` está en `sistema-reclamos/sistema-reclamos`.
- **El README de la raíz no permite correr el sistema**: solo dice `npm install` y `npm run dev`, que levanta la interfaz; no dice que la API se levanta con `npm run server` ni qué variables y servicios necesita.
- El informe de participación pone un puntaje por cada responsabilidad en lugar de uno por integrante, como pide la plantilla.

## 6. Git, con lo que vimos en el taller

Lo bueno: la mayoría de los cambios entró por pull request (del #2 al #13), casi todas las ramas tienen tipo (`docs/`, `fix/`, `feat/`) y 36 de 55 commits usan prefijo. Lo que falta:

- **54 de los 69 commits son posteriores al sábado 17 a las 08:00**, la hora de entrega. El historial tiene que mostrar el trabajo de cada semana, no el cierre.
- Once commits del 17 al 20 se subieron directo a `main`, sin pull request, entre ellos `c42fa5d`.
- Hay mensajes repetidos: «Semana 03: modelo C4 del sistema en docs/c4/» está en tres commits con cambios distintos, y «Renombra los ADR a 0001 y 0002 y agrega el ADR-0003» quedó dos veces al rehacer la historia.
- Hay mensajes sin prefijo o con el texto por defecto de GitHub («Update docs/corpus-tefi.md», «add labo4-5»), títulos de pull request que solo repiten la rama («Feat/revision archivos») y mensajes en inglés mezclados con español.
- No abren issues, así que las ramas no llevan número de ticket (`tipo/numero-de-issue-descripcion`, como `feature/12-reserva-de-cupos`), y `adr/` y `c4/` no son tipos: los ADR y los diagramas van en `docs/`.
- No hay rama `develop`, como pide la Guía de Git (sección 3), y los pull requests entran con merge y no con squash.
- Las diez ramas ya integradas siguen en el remoto: se borran al integrarse.

## 7. Identidad unificada

Cada usuario de GitHub, a quién pertenece y cómo aparece hoy en el historial:

| Integrante | Usuario de GitHub | Cómo aparece en los commits | Qué corregir |
|---|---|---|---|
| Castro Aguirre, Lenin Giomar | @LenCastA | «Lenin Castro», siempre con el correo privado de GitHub | Su nombre completo y su correo @uni.pe |
| Albino Soto, Christopher Henrry | @Christopher-Albino | «Christopher Albino» y, en un merge hecho desde GitHub, «Christopher-Albino» (su perfil no tiene nombre) | Su nombre completo, también en su perfil de GitHub |
| Nuñez Villazana, Franz Pool | @fraponuvi | «fraponuvi» | Su nombre completo |
| Puris Ricaldi, Roy Farid | @RoyFarid | «Roy Farid Puris Ricaldi», con el correo privado de GitHub, y, en los merges hechos desde GitHub, «roy.wolf__» (el nombre de su perfil) | Su nombre completo en su perfil y su correo @uni.pe en `git config` |
| Rashuaman Sapallanay, Ricco Didier | @ricco-drs | «Ricco Didier Rashuaman Sapallanay» y, en los merges hechos desde GitHub, «Ricco» | Su nombre completo en su perfil de GitHub, y el @uni.pe como correo de lo que hace desde la web |

Cada integrante, en su máquina, con su nombre completo y su correo @uni.pe:

```bash
git config --global user.name "Nombres Apellidos"
git config --global user.email "su.correo@uni.pe"
```

En GitHub, pongan ese mismo nombre en su perfil (los merges hechos desde la web toman el nombre del perfil) y agreguen su correo @uni.pe en *Settings > Emails*, para que sus próximos commits queden enlazados a su cuenta.

Para juntar lo que ya está en el historial, agreguen un archivo `.mailmap` en la raíz, con una línea por cada identidad vieja:

```text
Nombres Apellidos <su.correo@uni.pe> Nombre-viejo <correo-viejo>
```

Eso ordena `git log` y `git shortlog`; la web de GitHub sigue mostrando el nombre original de cada commit.

## 8. Sus reglas de negocio actuales

Agreguen `docs/reglas-de-negocio.md` con las reglas de negocio que el sistema cumple hoy. Para cada una: qué dice la regla, dónde vive en el código (archivo y función) y qué prueba la verifica, o «sin prueba». El informe ya reconoce que casi todas siguen en `server.js`; esta lista es el mapa para la partición de la semana 9.

## 9. El pull request #1 sigue abierto

Las observaciones de la semana 3 siguen sin respuesta. Contesten ahí qué hicieron con cada punto e intégrenlo con **Squash and merge**. La rama de ese pull request está en mi fork, así que no tienen que borrarla.

## Prioridad sugerida

| Orden | Punto | Por qué primero |
|---|---|---|
| 1 | Poner el informe al día con el repositorio (5 y 2) | Hoy el informe describe dos repositorios |
| 2 | ADR de la unión de los repositorios y respuesta al PR #1 (3 y 9) | Es una decisión tomada que no está escrita |
| 3 | `docs/reglas-de-negocio.md` (8) | Es la base de la partición de la semana 9 |
| 4 | Componentes del C4 con la rodaja (2) | El modelo tiene que coincidir con el código |
| 5 | Identidad unificada y trabajo semanal en el historial (6 y 7) | Así se ve el aporte de cada uno |
