# ADR-0003. La numeración de los reclamos la garantiza una secuencia de PostgreSQL, no la API

## Estado

Aceptado. Registrado a posteriori: la decisión es anterior a este ciclo y se documenta ahora porque atiende al escenario de mayor prioridad (E1). [Confirmar la fecha real de la decisión con Ricco.]

## Contexto

Cada reclamo se identifica con un número `REC-AAAA-NNNN`. Ese número va en el correo de confirmación, el estudiante lo usa para seguir su caso y el Tercio para hablar de él. Antes se calculaba en la API leyendo el número más alto y sumando uno. En el cierre de matrícula, cuando muchos estudiantes envían a la vez, dos peticiones leían el mismo máximo: una fallaba por clave duplicada y reintentaba, y quedaban huecos. Además, al borrar el último reclamo su número quedaba libre y el siguiente lo heredaba junto con lo que colgaba de él; así apareció la respuesta de una prueba en el reclamo de otra estudiante. E1, el escenario de mayor prioridad, exige cero reclamos perdidos y cero números repetidos.

## Decisión

El número sale de la secuencia `public.reclamos_numero`, a través de la función `siguiente_id_reclamo()` (`sql/secuencia_reclamos.sql`), que la API llama por RPC; la API solo le da formato. Si la secuencia no existe, la API vuelve al método anterior con hasta 10 reintentos (`backend/server.js`, líneas 740 a 809). Un reenvío idéntico del mismo estudiante dentro de 10 minutos devuelve el reclamo que ya existe.

## Alternativas consideradas

- **Máximo más uno en la API, con reintentos ante el error 409.** A favor: no toca la base de datos. En contra: sigue siendo una carrera, deja huecos y vuelve a usar los números de reclamos borrados.
- **UUID generado en la API.** A favor: no choca nunca y no necesita un viaje a la base. En contra: el número deja de ser legible y fácil de dictar, se pierden el orden y el formato que estudiantes y Tercio ya usan, y habría que mantener dos identificadores.
- **Columna `identity` como clave primaria.** A favor: atómica y estándar. En contra: cambia el tipo de la clave de texto a número y obliga a migrar `reclamos`, `respuestas_reclamo.reclamo_id` y los números ya comunicados a los estudiantes.

## Consecuencias

- `nextval` es atómico: dos peticiones nunca reciben el mismo número, y un número borrado no vuelve a ser usado.
- Se conserva el formato `REC-AAAA-NNNN`.
- La numeración puede tener huecos: un número consumido por una inserción fallida no regresa.
- La creación de reclamos todavía no está detrás de un puerto, y un adaptador en memoria tendría que simular la secuencia.
- La secuencia no se reinicia cada año: en el año 2027 los números seguirán desde donde quedaron en 2026, no desde 0001.