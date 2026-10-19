# TEFIIS

Repositorio único de los dos sistemas de TEFIIS. Cada carpeta es un proyecto independiente, con su propio `package.json`, y se instala y ejecuta desde adentro.

| Carpeta | Contenido |
|---|---|
| [sistema-reclamos/](sistema-reclamos/) | Asistente Tefi y registro de reclamos de los estudiantes (React + Express). |
| [sistema-admin/](sistema-admin/) | Panel de administración (React + Firebase). |
| [docs/](docs/) | Documentación de arquitectura de ambos sistemas. |

```bash
cd sistema-reclamos   # o sistema-admin
npm install
npm run dev
```
