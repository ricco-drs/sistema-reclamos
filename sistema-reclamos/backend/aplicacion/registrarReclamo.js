import {
  ErrorDeReclamo, MOTIVO_ENTRADA_INVALIDA, MOTIVO_NO_PERMITIDO, MOTIVO_NO_DISPONIBLE,
  MAX_EVIDENCIAS, sanearCursos, armarDocumentos, idDeReclamo, numeroSiguienteDe,
} from '../dominio/reclamo.js';
import { crearReclamoRegistrado } from '../dominio/eventos.js';

const VENTANA_DUPLICADO_MS = 10 * 60 * 1000;
const MAX_INTENTOS_ID = 10;

/**
 * Caso de uso: registrar un reclamo del estudiante y avisar que quedó registrado.
 * No conoce Express, PostgREST ni los proveedores de correo.
 *
 * @param {Object} dep
 * @param {import('../dominio/puertosReclamos.js').RepositorioReclamos} dep.reclamos
 * @param {import('../dominio/puertosReclamos.js').PublicadorEventos} dep.publicador
 * @param {import('../dominio/puertosReclamos.js').PoliticaDeRecepcion} dep.politica
 * @param {Map<string, {nombre: string, secciones: string[]}>} dep.catalogoCursos
 * @param {(ref: string, email: string) => boolean} dep.esEvidenciaPropia
 * @param {(entrada: object) => void} [dep.logActividad]
 * @param {() => Date} [dep.reloj]
 * @param {(mensaje: string, err?: unknown) => void} [dep.registrarError]
 */
export function crearRegistrarReclamo({
  reclamos, publicador, politica, catalogoCursos, esEvidenciaPropia,
  logActividad = () => {}, reloj = () => new Date(), registrarError = () => {},
}) {
  async function numerar(anio) {
    // Con secuencia: un número nuevo por intento, porque el anterior ya se consumió.
    // Sin secuencia: método anterior, para no dejar de aceptar reclamos por un paso pendiente en la base.
    let deSecuencia = null;
    try { deSecuencia = await reclamos.siguienteNumero(); }
    catch (err) { registrarError('No se pudo usar la secuencia de ids', err); }

    return async (intento) => {
      if (deSecuencia !== null) {
        if (intento === 0) return deSecuencia;
        const n = await reclamos.siguienteNumero().catch(() => null);
        return n ?? deSecuencia + intento;
      }
      return numeroSiguienteDe(await reclamos.ultimoIdDelAnio(anio)) + intento;
    };
  }

  async function publicarSinFallar(evento) {
    try { await publicador.publicar(evento); }
    catch (err) { registrarError(`No se pudo publicar ${evento.eventoId}`, err); }
  }

  return async function registrarReclamo({ email, entrada }) {
    const rechazo = await politica.motivoDeRechazo(email);
    if (rechazo) throw new ErrorDeReclamo(rechazo, MOTIVO_NO_DISPONIBLE);

    const { nombre, codigo_estudiante, categoria, descripcion, datos_estudiante, documentos,
      evidencias, cursos_retirar, cursos_matricular } = entrada ?? {};
    if (!categoria || !descripcion) {
      throw new ErrorDeReclamo('Categoría y descripción son requeridas.', MOTIVO_ENTRADA_INVALIDA);
    }

    // Las referencias las manda el navegador: se revalidan aquí para que un
    // reclamo no apunte a archivos de otro estudiante.
    const listaEvidencias = Array.isArray(evidencias) ? evidencias : [];
    if (listaEvidencias.length > MAX_EVIDENCIAS) {
      throw new ErrorDeReclamo('Solo puedes adjuntar un archivo PDF como prueba.', MOTIVO_ENTRADA_INVALIDA);
    }
    const evidenciasValidas = listaEvidencias.filter((e) => esEvidenciaPropia(e?.ref, email));
    if (evidenciasValidas.length !== listaEvidencias.length) {
      throw new ErrorDeReclamo('Alguno de los archivos adjuntos no te pertenece.', MOTIVO_NO_PERMITIDO);
    }

    const cursosRetirar = sanearCursos(cursos_retirar, catalogoCursos);
    const cursosMatricular = sanearCursos(cursos_matricular, catalogoCursos);
    const documentosConEvidencias = armarDocumentos(documentos, evidenciasValidas);

    // Un reintento del mismo reclamo devuelve el que ya existe. Si la comprobación
    // falla se sigue: perder un reclamo por no poder comprobar sería peor que duplicarlo.
    try {
      const desde = new Date(reloj().getTime() - VENTANA_DUPLICADO_MS).toISOString();
      const existente = await reclamos.buscarDuplicado(email, String(descripcion).trim(), desde);
      if (existente) return { id: existente, duplicado: true };
    } catch (err) {
      registrarError('No se pudo comprobar duplicados', err);
    }

    const anio = reloj().getFullYear();
    const siguiente = await numerar(anio);
    let id = null;
    let ultimoError = null;

    for (let intento = 0; intento < MAX_INTENTOS_ID && id === null; intento++) {
      const candidato = idDeReclamo(anio, await siguiente(intento));
      const r = await reclamos.insertar({
        id: candidato,
        email,
        nombre: nombre || null,
        codigo_estudiante: codigo_estudiante || null,
        categoria,
        descripcion,
        datos_estudiante: {
          ...(datos_estudiante && typeof datos_estudiante === 'object' ? datos_estudiante : {}),
          cursosRetirar,
          cursosMatricular,
        },
        documentos: documentosConEvidencias,
        estado: 'PENDIENTE',
        // Columnas heredadas del esquema anterior: se mantienen espejadas.
        nombres: nombre || null,
        codigo: codigo_estudiante || null,
        urls: documentosConEvidencias,
        datos_academicos: datos_estudiante || null,
      });
      if (r.ok) { id = candidato; break; }
      ultimoError = r.detalle;
      // Una colisión de id se reintenta; cualquier otro error es real.
      if (!r.colision) throw new Error(r.detalle);
    }

    if (id === null) {
      registrarError(`No se pudo asignar un id de reclamo tras ${MAX_INTENTOS_ID} intentos: ${ultimoError}`);
      throw new ErrorDeReclamo(
        'El sistema está recibiendo muchos reclamos a la vez. Intenta de nuevo en unos segundos.',
        MOTIVO_NO_DISPONIBLE,
      );
    }

    logActividad({
      actorEmail: email, actorType: 'estudiante', accion: 'reclamo_creado',
      detalle: { caseId: id, categoria, evidencias: evidenciasValidas.length },
    });

    // El reclamo ya está guardado: que un consumidor falle no lo deshace.
    await publicarSinFallar(crearReclamoRegistrado({
      id, email, nombre: nombre || null, codigoEstudiante: codigo_estudiante || null, categoria,
      cursosRetirar, cursosMatricular, tieneEvidencia: evidenciasValidas.length > 0,
    }, reloj().toISOString()));

    return { id };
  };
}
