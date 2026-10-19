# Costo del cambio

Fecha: 9 de octubre de 2026. Equipo: TEFIIS.

| Nombre completo | Código |
| --- | --- |
| Albino Soto Christopher Henrry | 20231158C |
| Castro Aguirre Lenin Giomar | 20240243J |
| Nuñez Villazana Franz Pool | 20244028F |
| Puris Ricaldi Roy Farid | 20244011F |
| Rashuaman Sapallanay Ricco Didier | 20231242D |

El requisito se leyó antes de cronometrar y ambas versiones compartieron la revisión inicial y la preparación de pruebas. Por ello, los tiempos no permiten concluir que un estilo sea más rápido para una persona.

| Medición                                                      | A: un paquete | B: capas |
| ------------------------------------------------------------- | ------------: | -------: |
| Minutos desde inicio de edición hasta primera ejecución verde |          1,30 |     0,69 |
| Archivos modificados, incluidas pruebas                       |           3   |      5   |
| Líneas agregadas                                              |           86  |      82  |
| Líneas eliminadas                                             |           13  |      17  |
| Pruebas antiguas que dejaron de compilar                      |           4   |      5   |
| Pruebas nuevas que fallaron antes de corregirse               |           0   |      1   |
| Archivos inspeccionados durante la revisión inicial           |           4   |      7   |

La última fila cuenta archivos inspeccionados, no búsquedas independientes. Se revisaron todos los archivos Java: modelo, servicio, almacenamiento y pruebas en A; modelo, servicio, reglas, puerto, adaptador y dos archivos de pruebas en B.

El argumento obligatorio `motivo` rompió seis llamadas en cuatro pruebas de A. En B afectó seis llamadas en cuatro pruebas y un constructor en la prueba de infraestructura: cinco pruebas antiguas en total. Se adaptaron sin eliminar comprobaciones.

La prueba nueva de devolución en B falló al asumir que el préstamo devuelto seguía primero en la lista; el repositorio falso lo añade al final al reemplazarlo. Se corrigió la prueba para buscar por ID y comprobar el motivo, sin modificar el repositorio.

## Conclusión

1. B centralizó las dos reglas nuevas en `ReglasDePrestamo`; A las repitió en los préstamos normales y urgentes. B redujo la duplicación.
2. B modificó cinco archivos frente a tres en A, porque el cambio del modelo también afectó a su prueba de infraestructura. Menos duplicación no implica menos archivos.
3. En TEFIIS se separó por capas la operación de cursos resueltos dentro de la API existente. El objetivo es cambiar y probar sus reglas sin Supabase ni cambios en el panel administrativo.

## Evidencia reproducible

El caso está en `laboratorio/costo-del-cambio/`. Los conteos se obtuvieron del diff frente al commit original, conservado en `docs/evidencias/cambio-caso.patch`; no cuentan los archivos nuevos incorporados a TEFIIS.

```powershell
git diff --stat -- version-a
git diff --numstat -- version-a
git diff --stat -- version-b
git diff --numstat -- version-b
mvn -f version-a/pom.xml test
mvn -f version-b/pom.xml test
