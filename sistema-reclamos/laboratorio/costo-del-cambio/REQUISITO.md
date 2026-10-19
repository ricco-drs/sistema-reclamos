# El requisito nuevo

**Si llegaron acá antes de tiempo, cierren el archivo.** Esto se abre recién cuando estén sentados y listos para empezar a medir, porque el cronómetro arranca ahí. Si lo leen antes, los minutos dejan de medir la estructura y pasan a medir cuánto lo pensaron de antemano, y la comparación entre las dos versiones se cae.

---

El jefe de laboratorio pide dos cosas, y las pide para hoy.

## 1. Tope de equipos por alumno

Un alumno **no puede tener más de dos equipos prestados a la vez**. Si ya tiene dos sin devolver y pide un tercero, el sistema lo rechaza con un mensaje que diga por qué.

Aplica igual al préstamo normal y al urgente. El urgente no es una excepción al tope.

## 2. El motivo del préstamo

Cada préstamo **registra el motivo**, un texto corto que el alumno declara: "clase de redes", "proyecto del curso", "sustentación". El motivo es obligatorio y no puede ir vacío.

## Cómo se comprueba

Agrega al menos estas dos pruebas, en las dos versiones:

1. Un alumno con dos equipos sin devolver pide un tercero y el sistema lo rechaza.
2. Un préstamo sin motivo es rechazado.

Y comprueben que las pruebas que ya existían siguen en verde. Si alguna se rompió, cuéntenla: ese es el cuarto número del cuadro.

### Sobre los archivos de pruebas

Los archivos de pruebas **sí se tocan**. Ahí van las pruebas nuevas, y si el cambio modifica la firma de un método, las pruebas que ya existían se adaptan para que vuelvan a compilar.

- **Adaptar** una prueba existente está permitido: cambiar la llamada para pasarle el dato nuevo, por ejemplo.
- **Debilitarla** no: no se borra una prueba ni se le quita una comprobación para que pase. Al terminar, cada prueba antigua tiene que seguir verificando lo mismo que verificaba antes.
- Cada prueba antigua que dejó de compilar o falló por el cambio **cuenta como una prueba rota**, aunque después la hayan arreglado. Anótenlas por separado en la versión A y en la versión B.

## Lo que no se pide

- No hay que cambiar la forma de guardar ni agregar base de datos.
- No hay que escribir interfaz de usuario.
- No hay que refactorizar la versión A para que se parezca a la B. La gracia está en medir cómo son, no en arreglarlas.
