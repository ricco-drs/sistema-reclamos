import {
  ErrorDeReclamo, MOTIVO_ENTRADA_INVALIDA, MOTIVO_NO_PERMITIDO, MOTIVO_NO_DISPONIBLE, MOTIVO_POR_RECHAZO,
  CODIGO, MAX_EVIDENCIAS, MAX_DESCRIPCION, FORMATO_CODIGO_UNI,
  clasificarCursos, referenciasDeDocumentos, armarDocumentos, idDeReclamo, numeroSiguienteDe,
} from '../dominio/reclamo.js';
import { crearReclamoRegistrado } from '../dominio/eventos.js';

const VENTANA_DUPLICADO_MS = 10 * 60 * 1000;
const MAX_INTENTOS_ID = 10;

/**
 * Caso de uso: registrar un reclamo del estudiante y avisar que quedó registrado.
 * No conoce Express, PostgREST ni los proveedores de correo.
 *
 * Orden de las comprobaciones: primero la política de recepción (pausa, ciclo, ventana) y
 * después los campos. La sesión (401) la comprueba la ruta antes de llegar aquí.
 *
 * @param {Object} dep
 * @param {import('../dominio/puertosReclamos.js').RepositorioReclamos} dep.reclamos
 * @param {import('../dominio/puertosReclamos.js').PublicadorEventos} dep.publicador
 * @param {import('../dominio/puertosReclamos.js').PoliticaDeRecepcion} dep.politica
 * @param {Map<string, {nombre: string, secciones: string[]}>} dep.catalogoCursos
 * @param {(ref: string, email: string) => boolean} dep.esEvidenciaPropia
 * @param {(ref: string, email: string) => boolean} [dep.esDocumentoPropio] Si falta, ninguna referencia de `documentos` se acepta.
 * @param {(entrada: object) => void} [dep.logActividad]
 * @param {() => Date} [dep.reloj]
 * @param {(mensaje: string, err?: unknown) => void} [dep.registrarError]
 */
export function crearRegistrarReclamo({
  reclamos, publicador, politica, catalogoCursos, esEvidenciaPropia, esDocumentoPropio = () => false,
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

  /** Comprueba los campos del cuerpo, en este orden. Lanza al primer problema. */
  function validarEntrada(email, entrada) {
    const { codigo_estudiante, categoria, descripcion, documentos, evidencias } = entrada ?? {};
    if (!categoria || !descripcion) {
      throw new ErrorDeReclamo('Categoría y descripción son requeridas.', MOTIVO_ENTRADA_INVALIDA, CODIGO.DATOS_INCOMPLETOS);
    }
    if (String(descripcion).length > MAX_DESCRIPCION) {
      throw new ErrorDeReclamo(
        `La descripción no puede pasar de ${MAX_DESCRIPCION} caracteres.`, MOTIVO_ENTRADA_INVALIDA, CODIGO.DESCRIPCION_DEMASIADO_LARGA,
      );
    }
    if (codigo_estudiante && !FORMATO_CODIGO_UNI.test(String(codigo_estudiante).trim().toUpperCase())) {
      throw new ErrorDeReclamo(
        'El código de estudiante no tiene el formato de la UNI (por ejemplo 20240001A).', MOTIVO_ENTRADA_INVALIDA, CODIGO.CODIGO_UNI_INVALIDO,
      );
    }

    // Las referencias las manda el navegador: se revalidan aquí para que un
    // reclamo no apunte a archivos de otro estudiante.
    const listaEvidencias = Array.isArray(evidencias) ? evidencias : [];
    if (listaEvidencias.length > MAX_EVIDENCIAS) {
      throw new ErrorDeReclamo('Solo puedes adjuntar un archivo PDF como prueba.', MOTIVO_ENTRADA_INVALIDA, CODIGO.DEMASIADAS_PRUEBAS);
    }
    const evidenciasValidas = listaEvidencias.filter((e) => esEvidenciaPropia(e?.ref, email));
    if (evidenciasValidas.length !== listaEvidencias.length) {
      throw new ErrorDeReclamo('Alguno de los archivos adjuntos no te pertenece.', MOTIVO_NO_PERMITIDO, CODIGO.PRUEBA_AJENA);
    }
    if (!referenciasDeDocumentos(documentos).every((ref) => esDocumentoPropio(ref, email))) {
      throw new ErrorDeReclamo('Alguno de los documentos indicados no te pertenece.', MOTIVO_NO_PERMITIDO, CODIGO.DOCUMENTO_AJENO);
    }
    return evidenciasValidas;
  }

  /**
   * @returns {Promise<{id: string, duplicado?: true,
   *   cursosDescartados?: {lista: string, codigo: string, seccion: string, motivo: string}[]}>}
   *   `cursosDescartados` solo viene cuando se crea el reclamo; un reintento no guarda nada nuevo.
   */
  return async function registrarReclamo({ email, entrada }) {
    const rechazo = await politica.motivoDeRechazo(email);
    if (rechazo) {
      throw new ErrorDeReclamo(rechazo.mensaje, MOTIVO_POR_RECHAZO[rechazo.codigo] ?? MOTIVO_NO_DISPONIBLE, rechazo.codigo);
    }

    const evidenciasValidas = validarEntrada(email, entrada);
    const { nombre, codigo_estudiante, categoria, descripcion, datos_estudiante, documentos,
      cursos_retirar, cursos_matricular } = entrada;

    const codigoUni = codigo_estudiante ? String(codigo_estudiante).trim().toUpperCase() : null;
    const retirar = clasificarCursos(cursos_retirar, catalogoCursos, 'cursos_retirar');
    const matricular = clasificarCursos(cursos_matricular, catalogoCursos, 'cursos_matricular');
    const cursosRetirar = retirar.cursos;
    const cursosMatricular = matricular.cursos;
    const cursosDescartados = [...retirar.descartados, ...matricular.descartados];
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
        codigo_estudiante: codigoUni,
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
        codigo: codigoUni,
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
        CODIGO.SIN_NUMERO_DISPONIBLE,
      );
    }

    logActividad({
      actorEmail: email, actorType: 'estudiante', accion: 'reclamo_creado',
      detalle: { caseId: id, categoria, evidencias: evidenciasValidas.length },
    });

    // El reclamo ya está guardado: que un consumidor falle no lo deshace.
    await publicarSinFallar(crearReclamoRegistrado({
      id, email, nombre: nombre || null, codigoEstudiante: codigoUni, categoria,
      cursosRetirar, cursosMatricular, tieneEvidencia: evidenciasValidas.length > 0,
    }, reloj().toISOString()));

    return { id, cursosDescartados };
  };
}
