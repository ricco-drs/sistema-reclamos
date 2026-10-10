# Costo del cambio

Fecha: 9 de octubre de 2026. Equipo: TEFIIS. Integrantes: completar por el grupo.

Estos datos corresponden a la ejecución del caso. El requisito se leyó antes de cronometrar, se revisaron ambas estructuras y se compartió la preparación de las pruebas. Los tiempos no permiten concluir que un estilo sea más rápido para una persona.

| Medición                                                      | A: un paquete | B: capas |
| ------------------------------------------------------------- | ------------: | -------: |
| Minutos desde inicio de edición hasta primera ejecución verde |          1,30 |     0,69 |
| Archivos modificados, incluidas pruebas                       |           3   |      5   |
| Líneas agregadas                                              |           86  |      82  |
| Líneas eliminadas                                             |           13  |      17  |
| Pruebas antiguas que dejaron de compilar                      |           4   |      5   |
| Pruebas nuevas que fallaron antes de corregirse               |           0   |      1   |
| Archivos inspeccionados durante la revisión inicial           |           4   |      7   |

La última fila es un inventario observado, no un conteo de búsquedas independientes durante la implementación. Se inspeccionaron todos los archivos Java: modelo, servicio, almacenamiento y pruebas en A; modelo, servicio, reglas, puerto, adaptador y dos archivos de pruebas en B.

Los errores iniciales se debieron al nuevo argumento obligatorio `motivo`. En A hubo seis llamadas incompatibles distribuidas en cuatro pruebas. En B hubo seis llamadas incompatibles en cuatro pruebas y un constructor incompatible en la prueba de infraestructura: cinco pruebas antiguas afectadas. No se eliminaron sus comprobaciones.

La prueba nueva de devolución en B falló porque asumía que el primer elemento de la lista seguía siendo el préstamo devuelto. El repositorio falso reemplaza el registro y lo añade al final. Se corrigió la prueba para buscar por ID, manteniendo la comprobación del motivo. No se alteró el repositorio para satisfacer el orden de la prueba.

## Conclusión

1. B concentró las dos reglas nuevas en `ReglasDePrestamo`. A necesitó repetirlas en préstamo normal y urgente. Esa es una reducción concreta de duplicación.
2. B no redujo los archivos afectados: necesitó cinco frente a tres. La nueva firma del modelo también afectó a su prueba de infraestructura. Menos duplicación no significa menos archivos.
3. Para TEFIIS se aplica separación por capas dentro de la API existente, con dominio sin dependencias de infraestructura. El escenario de calidad es modificar las reglas de los cursos resueltos y probarlas sin conectar Supabase ni cambiar el panel administrativo.

## Evidencia reproducible

El caso completo está copiado en `laboratorio/costo-del-cambio/`. Los conteos corresponden al diff frente al commit original, conservado en `docs/evidencias/cambio-caso.patch`, no al número de archivos nuevos incorporados al repositorio TEFIIS.

```powershell
git diff --stat -- version-a
git diff --numstat -- version-a
git diff --stat -- version-b
git diff --numstat -- version-b
mvn -f version-a/pom.xml test
mvn -f version-b/pom.xml test