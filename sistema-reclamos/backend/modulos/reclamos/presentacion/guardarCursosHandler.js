import { ErrorDeCursos, MOTIVO_ENTRADA_INVALIDA, MOTIVO_NO_EXISTE } from '../dominio/cursosResueltos.js';

// Traducción a HTTP de los errores del dominio: vive en el adaptador, no en el dominio.
const STATUS_POR_MOTIVO = {
  [MOTIVO_ENTRADA_INVALIDA]: 400,
  [MOTIVO_NO_EXISTE]: 404,
};

export function statusDeError(err) {
  return err instanceof ErrorDeCursos ? (STATUS_POR_MOTIVO[err.motivo] ?? 500) : 500;
}

export function crearGuardarCursosHandler(guardarCursos, logActividad) {
  return async (req, res) => {
    try {
      const valor = await guardarCursos({
        id: req.params.id, admin: req.adminEmail,
        matricular: req.body?.matricular, desmatricular: req.body?.desmatricular,
      });
      logActividad({
        actorEmail: req.adminEmail, actorType: 'admin', accion: 'cursos_resueltos',
        detalle: {
          caseId: req.params.id,
          matricular: valor.matricular.map(c => `${c.codigo}-${c.seccion}`),
          desmatricular: valor.desmatricular.map(c => `${c.codigo}-${c.seccion}`),
        },
      });
      return res.json({ success: true, cursos_resueltos: valor });
    } catch (err) {
      return res.status(statusDeError(err)).json({ error: err.message });
    }
  };
}
