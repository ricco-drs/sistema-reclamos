// Entrada pública del módulo reclamos (docs/particiones.md). Lo que no se exporta aquí
// es interno: desde fuera del módulo solo se entra por este archivo.
import { crearRegistrarReclamo } from './aplicacion/registrarReclamo.js';
import { crearGuardarCursosResueltos } from './aplicacion/guardarCursosResueltos.js';
import { crearPoliticaDeRecepcion } from './infraestructura/politicaDeRecepcion.js';
import { crearRepositorioReclamosSupabase } from './infraestructura/repositorioReclamosSupabase.js';
import { crearRepositorioReclamosMemoria } from './infraestructura/repositorioReclamosMemoria.js';
import { crearRepositorioCursosSupabase } from './infraestructura/repositorioCursosSupabase.js';
import { crearRegistrarReclamoHandler, AVISOS_POR_API } from './presentacion/registrarReclamoHandler.js';
import { crearRutasDeReclamos } from './presentacion/rutas.js';

// El evento que publica el registro. Su forma está en docs/api/eventos.md (versión 1).
export { RECLAMO_REGISTRADO } from './dominio/eventos.js';

// Para las pruebas que cruzan módulos (backend/tests) y el experimento de resiliencia (pruebas/).
export { crearRegistrarReclamo, crearRegistrarReclamoHandler, AVISOS_POR_API, crearRepositorioReclamosMemoria };

// Transición (#46). El front anterior envía él mismo el correo (/api/reclamos/confirmar)
// y el expediente a M2; el nuevo manda `avisos: "api"` y se los deja a la API. Para las
// peticiones del anterior se registra sin publicar el evento, así cada reclamo manda un
// solo correo y un solo expediente, sin importar qué se despliega primero ni si el
// estudiante tiene abierta la página anterior. Se quita, junto con /api/reclamos/confirmar,
// cuando ya no quede el front anterior.
const SIN_PUBLICAR = Object.freeze({ publicar: async () => {} });

/**
 * Arma el módulo con lo que le pasa server.js. Lo que necesita de otros módulos le llega
 * por parámetro, nunca por import: los interruptores de configuración, la sesión de acceso
 * y el bus donde publica ReclamoRegistrado.
 *
 * @param {Object} dep
 * @param {(path: string, opts?: object) => Promise<Response>} dep.sbRest cliente de PostgREST
 * @param {{publicar: (evento: object) => Promise<void>}} dep.publicador donde se publica ReclamoRegistrado
 * @param {{tefiDurmiendoActivo: Function, despedidaActivaPara: Function, puedeEnviarReclamo: Function}} dep.interruptores
 *   los que deciden si hoy se reciben reclamos; con ellos se arma el puerto PoliticaDeRecepcion
 * @param {Map<string, object>} dep.catalogoCursos catálogo de cursos y secciones
 * @param {(ref: string, email: string) => boolean} dep.esEvidenciaPropia
 * @param {(ref: string, email: string) => boolean} dep.esDocumentoPropio
 * @param {Function} dep.logActividad
 * @param {(mensaje: string, err?: unknown) => void} dep.registrarError
 * @param {Function} dep.exigirEstudiante middleware de sesión del estudiante
 * @param {Function} dep.exigirAdmin middleware de sesión del administrador
 * @returns {{rutas: import('express').Router,
 *   fuenteDeExpedientes: {obtenerParaExpediente: (id: string) => Promise<object|null>}}}
 *   `fuenteDeExpedientes` es lo único que reclamos deja leer a otro módulo: el consumidor de M2
 *   (notificaciones) lo recibe de server.js para leer la descripción, que no viaja en el evento.
 */
export function crearModuloReclamos({
  sbRest, publicador, interruptores, catalogoCursos, esEvidenciaPropia, esDocumentoPropio,
  logActividad, registrarError, exigirEstudiante, exigirAdmin,
}) {
  const repositorio = crearRepositorioReclamosSupabase(sbRest);
  const comunes = {
    reclamos: repositorio,
    // Se comprueba en el servidor y no solo en la interfaz: ocultar el botón no
    // impide llamar al endpoint, así que el cierre tiene que valer aquí.
    politica: crearPoliticaDeRecepcion(interruptores),
    catalogoCursos,
    esEvidenciaPropia,
    esDocumentoPropio,
    logActividad,
    registrarError,
  };

  return {
    rutas: crearRutasDeReclamos({
      exigirEstudiante,
      exigirAdmin,
      registrarReclamo: crearRegistrarReclamo({ ...comunes, publicador }),
      registrarReclamoSinAvisos: crearRegistrarReclamo({ ...comunes, publicador: SIN_PUBLICAR }),
      guardarCursosResueltos: crearGuardarCursosResueltos(crearRepositorioCursosSupabase(sbRest)),
      logActividad,
    }),
    fuenteDeExpedientes: { obtenerParaExpediente: (id) => repositorio.obtenerParaExpediente(id) },
  };
}
