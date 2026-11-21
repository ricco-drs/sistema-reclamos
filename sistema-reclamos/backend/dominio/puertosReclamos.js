/**
 * Puertos del registro de reclamos. Solo describen contratos; los implementan
 * los adaptadores de `infraestructura/`.
 */

/**
 * @typedef {Object} RepositorioReclamos
 * @property {(email: string, descripcion: string, desdeIso: string) => Promise<{id: string, creadoEn: string}|null>} buscarDuplicado
 *   Id y fecha de creación de un reclamo reciente del mismo correo con la misma descripción, o null.
 * @property {() => Promise<number|null>} siguienteNumero
 *   Siguiente valor de la secuencia, o null si la secuencia no responde.
 * @property {(anio: number) => Promise<string|null>} ultimoIdDelAnio
 *   Id más alto del año, para numerar cuando no hay secuencia.
 * @property {(fila: object) => Promise<{ok: true} | {ok: false, colision: boolean, detalle: string}>} insertar
 * @property {(id: string) => Promise<{id: string, codigo_estudiante: string|null, email: string,
 *   nombre: string|null, categoria: string, descripcion: string} | null>} obtenerParaExpediente
 */

/**
 * @typedef {Object} PoliticaDeRecepcion
 * @property {(email: string) => Promise<{codigo: 'SISTEMA_EN_PAUSA'|'CICLO_CERRADO'|'VENTANA_CERRADA', mensaje: string}|null>} motivoDeRechazo
 *   El rechazo, con su código estable y su mensaje, si hoy no se reciben reclamos de ese correo
 *   (Tefi durmiendo, ciclo cerrado, ventana cerrada), o null.
 */

/**
 * @typedef {Object} PublicadorEventos
 * @property {(evento: import('./eventos.js').EventoReclamoRegistrado) => Promise<void>} publicar
 */

/**
 * @typedef {Object} ClienteM2
 * @property {(expediente: {id: string, codigoEstudiante: string, email: string, nombre: string,
 *   motivoReclamo: string, descripcion: string}) => Promise<void>} registrarExpediente
 */
