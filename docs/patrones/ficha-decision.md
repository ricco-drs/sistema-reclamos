# Fichas de decisión de patrones

Laboratorio 7 de SW708, equipo 2. Tres fragmentos de código, tres decisiones. El orden es el del laboratorio: primero el problema, después el patrón.

# Ficha de decisión, Fragmento A

## Problema que se repite
Un `if` encadenado que crece cada vez que el negocio agrega un tipo de comprobante. Cada tipo nuevo obliga a editar la misma función, que ya funciona y ya está probada.

## Patrón evaluado
Strategy, con una clase por tipo de comprobante. Alternativa mirada: una tabla de funciones indexada por tipo, que es Strategy en su forma mínima.

## Decisión
SE APLICA, como tabla de funciones indexada por tipo y no como jerarquía de clases.

## Motivo, en una frase
Lo que cambia (el tipo de comprobante) está separado de lo que no cambia (elegir y ejecutar), y agregar un tipo pasa a ser agregar una entrada.

## Qué se pierde al aplicarlo
Un salto de indirección: para leer el flujo completo hay que mirar la tabla y cada función. Y si los tipos dejaran de crecer, sería una estructura que no se justifica.

# Ficha de decisión, Fragmento B

## Problema que se repite
Dos clases casi iguales que hablan con dos proveedores distintos. El flujo se repite y solo cambia el formato de cada proveedor, así que quien las usa tiene que saber cuál es cuál.

## Patrón evaluado
Adapter: una interfaz común y un adaptador por proveedor. Alternativas miradas: una sola clase con un `if` por proveedor, o Template Method con el flujo en una clase base.

## Decisión
SE APLICA.

## Motivo, en una frase
Cada formato queda encerrado en su adaptador y el resto del sistema no se entera de qué proveedor responde; es lo que ya hace TEFIIS con los proveedores de correo (`sendEmail`: Brevo, Resend y Mailjet) y con el puerto `RepositorioCursosResueltos` del ADR-0002.

## Qué se pierde al aplicarlo
Una interfaz más que mantener y un archivo por proveedor. Con un solo proveedor, el adaptador sería indirección sin necesidad.

# Ficha de decisión, Fragmento C

## Problema que se repite
Ninguno. Son cuarenta líneas que funcionan, que nadie toca desde hace un año y que nadie prevé cambiar: no hay nada que se repita ni nada que varíe.

## Patrón evaluado
Strategy, Template Method y Facade. Alternativa mirada: dejarlo como está.

## Decisión
NO SE APLICA.

## Motivo, en una frase
Un patrón resuelve un problema que aquí no existe, y solo sumaría archivos e indirección a código que nadie lee.

## Qué se pierde al no aplicarlo
Si mañana aparece un segundo caso, habrá que refactorizar entonces, y tocar esas líneas sin pruebas es más riesgoso. La salida es escribir primero una prueba de caracterización y recién después extraer lo que haga falta.
