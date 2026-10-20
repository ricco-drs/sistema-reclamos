# Firebase en el panel del Tercio

En el panel del Tercio usamos Firebase para una sola cosa: que los miembros del Tercio inicien sesión con su correo y contraseña. También tenemos Analytics activado. No usamos Firestore, Realtime Database ni Storage: los reclamos y los PDF están en Supabase, y el panel los pide a la API.

## Configuración

La `apiKey` y el resto de la configuración de Firebase estaban escritos en `sistema-admin/src/firebase.js`. Los pasamos a variables de entorno, igual que en el backend, que ya leía todas sus claves del `.env`. Ahora `firebase.js` toma las variables `VITE_FIREBASE_*` del `.env` y, si falta alguna, el panel indica cuál en lugar de fallar sin explicación. En `.env.example` dejamos la lista de todas las variables del panel, sin valores; el `.env` con los valores reales no se sube al repositorio.

Con este cambio la configuración queda ordenada, pero no oculta. Vite incluye las variables `VITE_*` en el JavaScript que descarga el navegador, así que cualquiera que abra el panel puede ver la `apiKey`. Eso no es un problema: la clave identifica al proyecto, pero no da permisos por sí sola. Por la misma razón no hizo falta cambiarla, aunque siga en el historial de git.

Para publicar el panel (`npm run build` y `firebase deploy`), esas variables tienen que estar en el `.env` antes del build.

## Reglas de seguridad

Lo que realmente protege los datos no es la `apiKey`, sino las reglas de cada servicio: si estuvieran abiertas, la `apiKey` alcanzaría para leer una base de Firestore o los archivos de Storage. El 19/10/2026 revisamos los tres servicios de datos del proyecto `tefiis-admin`, primero con peticiones sin autenticar y luego en la consola de Firebase:

- **Realtime Database** no existe: `tefiis-admin-default-rtdb.firebaseio.com` responde 404 y la consola ofrece crear una base.
- **Storage** no existe: los buckets `tefiis-admin.firebasestorage.app` y `tefiis-admin.appspot.com` responden 404 y la consola ofrece *Comenzar*.
- **Firestore** no existe: la consola ofrece crear una base.

Como ninguno de los tres existe, no hay datos ni archivos que puedan quedar expuestos, ni reglas que ajustar.

## Inicio de sesión

Firebase Authentication sí lo usamos, así que también revisamos su configuración en la consola:

- **Método de acceso:** solo está habilitado correo y contraseña, que es lo que usa el panel (`signInWithEmailAndPassword`). Google está inhabilitado.
- **Dominios autorizados:** `localhost`, `tefiis-admin.firebaseapp.com` y `tefiis-admin.web.app`. Los dos últimos son los de Firebase Hosting, donde está publicado el panel, así que los dejamos como estaban.
- **Acciones del usuario:** el registro y la eliminación de cuentas estaban habilitados y los desactivamos, porque el panel no crea ni borra cuentas; las del Tercio las creamos desde la consola. La protección contra la enumeración de correos ya estaba activa.

Aun con el registro abierto, nadie de fuera habría podido entrar al panel. Cualquier cuenta del proyecto obtiene un token válido de Firebase, pero el backend no se conforma con eso: `requireAdminAuth` verifica el token y además exige que el correo esté en `ADMIN_EMAILS`; si no está, responde 403 (`sistema-reclamos/backend/server.js`, líneas 186 a 191 y 227 a 230). Las cuentas de `ADMIN_EMAILS_SOLO_LECTURA` pueden consultar, pero no modificar nada.
