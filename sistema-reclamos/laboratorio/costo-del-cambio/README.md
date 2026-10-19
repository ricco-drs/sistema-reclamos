# El mismo caso, dos veces

Material del laboratorio **Lab04-05** de SW708 Arquitectura de Soluciones de Software, sección U, UNI FIIS.

Acá hay un sistema chiquito de **préstamo de equipos del laboratorio**, resuelto de dos formas. No tienes que construirlas: ya están hechas y las dos funcionan igual. Lo que vas a hacer es **medir qué cuesta cambiarlas**.

## Las dos versiones

| | Qué es | Dónde está |
|---|---|---|
| **Versión A** | Un solo paquete, sin separación. El servicio valida, arma el objeto y escribe en la base, y las reglas están repetidas en cada forma de prestar. | `version-a/` |
| **Versión B** | Por capas, con la dependencia dirigida hacia el dominio. El dominio declara la interfaz `RepositorioDePrestamos` y la infraestructura la implementa. Las reglas viven en un solo lugar. | `version-b/` |

Las dos hacen lo mismo: prestar un equipo, prestarlo de forma urgente con quien autoriza, devolverlo y listar los préstamos de un alumno. Las dos tienen sus pruebas en verde.

## Antes de empezar

Necesitas **JDK 21 o superior** y **Maven**. Comprueba que las dos versiones arrancan limpias:

```
cd version-a && mvn test
cd ../version-b && mvn test
```

Las dos deben terminar en `BUILD SUCCESS`. Si alguna no arranca, resuélvelo ahora: el reloj todavía no empezó.

## Qué vas a hacer

1. Lee las dos versiones por encima, cinco minutos cada una. No corrijas nada.
2. El cambio que tienen que implementar está en `REQUISITO.md`. **Ábranlo recién cuando estén sentados y listos para empezar a medir, porque el cronómetro arranca ahí. Si lo leen antes, los minutos dejan de medir la estructura y pasan a medir cuánto lo pensaron de antemano, y la comparación entre las dos versiones se cae.**
3. Impleméntalo primero en la versión A, con el reloj corriendo, hasta que las pruebas vuelvan a verde. Anota los cinco números.
4. Haz lo mismo en la versión B, sin mirar lo que hicieron en A.
5. Llena `cuadro-costo-del-cambio.md` y saca una conclusión que se apoye en los números.

## Los cinco números

Por cada versión, al terminar:

1. **Minutos** desde que arrancó el reloj hasta la prueba en verde.
2. **Archivos tocados.** Lo dice `git status --short`, no la memoria.
3. **Líneas agregadas y borradas.** Lo dice `git diff --stat`.
4. **Pruebas que se rompieron** en el camino, aunque después las hayan arreglado.
5. **Lugares donde hubo que buscar** antes de saber dónde tocar.

El quinto es el más revelador y el que más se olvida. Anótalo apenas pase.

## Qué se entrega

En el repositorio de tu equipo, no en este:

- `docs/costo-del-cambio.md` con el cuadro de las dos versiones y la conclusión.
- `docs/adr/` con los dos ADR. Uno es la elección del estilo para su propio sistema.
- La rodaja vertical de su sistema, con su prueba de dominio en verde.
- `docs/bitacora-ia.md` con las dos declaraciones.

## La IA en este laboratorio

Son dos reglas distintas, porque junta dos semanas.

- **En los dos ADR sí se puede usar**, solo como generadora de alternativas: que proponga opciones, ustedes agregan la que no se les ocurrió, eligen y explican por qué descartaron las demás. Las consecuencias las escribe una persona.
- **En el cuadro del costo del cambio y en la rodaja vertical no se usa**, ni para medir ni para escribir el código.

Las dos cosas se declaran en `docs/bitacora-ia.md`.
