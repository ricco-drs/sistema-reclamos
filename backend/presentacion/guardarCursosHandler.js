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
      return res.status(err.status ?? 500).json({ error: err.message });
    }
  };
}
