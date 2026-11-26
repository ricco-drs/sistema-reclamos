import { Router } from 'express';
import { randomInt } from 'node:crypto';
import multer from 'multer';
import { emailTemplate, errorTipoArchivo, limiteSubidas, marcarLimite } from '@tefiis/compartido';
import { crearRegistrarReclamoHandler } from './registrarReclamoHandler.js';
import { crearGuardarCursosHandler } from './guardarCursosHandler.js';

export function crearRutasDeReclamos({
  requireStudentAuth, requireAdminAuth, registrarReclamo, registrarReclamoSinAvisos, guardarCursosResueltos,
  sbRest, sbRestTodo, logActividad, sendEmail, componerConfirmacion, limiteEnvioCodigo,
  despedidaActivaPara, esEvidenciaPropia, almacenamientoDeEvidencias,
}) {
  const rutas = Router();

  // Confirmación del reclamo recién creado. Exige sesión y saca el destinatario y
  // los datos del caso de la base, no del cuerpo: sin eso cualquiera podía enviar
  // un correo a la dirección que quisiera, con HTML propio dentro, saliendo del
  // remitente TEFIIS verificado. Verificado explotándolo antes de cerrarlo.
  rutas.post('/api/reclamos/confirmar', requireStudentAuth, limiteEnvioCodigo, async (req, res) => {
    const { caseId } = req.body;
    if (!caseId) {
      return res.status(400).json({ error: 'El ID del caso es requerido para enviar la confirmación.' });
    }

    let reclamo;
    try {
      // El filtro por email va en la consulta: un id ajeno no devuelve fila, así
      // que no se puede pedir la confirmación del reclamo de otro.
      const r = await sbRest(`/reclamos?select=id,email,nombre,categoria&id=eq.${encodeURIComponent(caseId)}&email=eq.${encodeURIComponent(req.studentEmail)}&limit=1`);
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      reclamo = (await r.json())?.[0];
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!reclamo) return res.status(404).json({ error: 'No se encontró ese reclamo.' });

    // La misma plantilla que manda el consumidor de ReclamoRegistrado
    // (módulo notificaciones): escapa lo que escribió el estudiante
    // y saluda por su primer nombre. Esta ruta queda durante la transición (ver
    // POST /api/reclamos): la llama el front anterior, y el nuevo solo cuando habla
    // con una API que todavía no envía el correo.
    const { subject, html } = componerConfirmacion({
      id: reclamo.id, nombre: reclamo.nombre, categoria: reclamo.categoria, email: reclamo.email,
    });

    try {
      await sendEmail({ to: reclamo.email, subject, html });
      console.log(`Confirmación enviada a ${reclamo.email} — ${caseId}`);
      res.json({ success: true });
    } catch (err) {
      console.error('Error enviando confirmación:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Estudiante: crear un reclamo nuevo. El email SIEMPRE sale de la sesión
  // verificada (req.studentEmail), nunca de lo que mande el cliente en el body.
  rutas.post('/api/reclamos', requireStudentAuth,
    crearRegistrarReclamoHandler(registrarReclamo, { sinAvisos: registrarReclamoSinAvisos }));

  // Admin: guardar qué cursos-sección se matriculan y cuáles se retiran de
  // verdad. Es la decisión del Tercio, no lo que pidió el estudiante, y NO se le
  // muestra a él: vive en su propia columna y los dos endpoints que consulta el
  // estudiante piden columnas por nombre, así que esta no sale por ahí.
  rutas.put('/api/admin/reclamos/:id/cursos-resueltos', requireAdminAuth,
    crearGuardarCursosHandler(guardarCursosResueltos, logActividad));

  // Estudiante: ver solo sus propios reclamos (filtrado por el email de su sesión, no por query param)
  rutas.get('/api/reclamos/mine', requireStudentAuth, async (req, res) => {
    try {
      const r = await sbRest(`/reclamos?select=id,categoria,estado,created_at,respuesta&email=eq.${encodeURIComponent(req.studentEmail)}&order=created_at.desc`);
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      const reclamos = await r.json();

      // Igual que en el detalle: aquí se muestra lo comunicado, no el estado de
      // trabajo. Se piden los envíos de todos sus reclamos de una vez en lugar de
      // uno por uno.
      const ids = reclamos.map(x => x.id).filter(Boolean);
      const ultimoComunicado = {};
      if (ids.length) {
        const lista = ids.map(id => `"${id}"`).join(',');
        const envios = await sbRest(`/respuestas_reclamo?select=reclamo_id,estado,created_at&reclamo_id=in.(${encodeURIComponent(lista)})&order=created_at.asc`);
        if (envios.ok) {
          // Van en orden ascendente, así que el último que se escribe de cada
          // reclamo es el más reciente.
          for (const e of await envios.json()) ultimoComunicado[e.reclamo_id] = e.estado;
        }
      }

      res.json(reclamos.map(x => ({
        id: x.id,
        categoria: x.categoria,
        created_at: x.created_at,
        estado: ultimoComunicado[x.id] || (x.respuesta ? (x.estado || 'PENDIENTE') : 'PENDIENTE'),
      })));
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  // Admin: enviar al estudiante la respuesta de su reclamo por correo.
  //
  // El destinatario y los datos del caso salen de la base y NO del cuerpo de la
  // petición. Si se tomaran del body, esta ruta sería un enviador de correo a
  // cualquier dirección con el remitente de TEFIIS: bastaría una sesión de admin
  // para mandar correos a quien fuera con la marca de la facultad.
  rutas.post('/api/admin/reclamos/:id/responder', requireAdminAuth, async (req, res) => {
    const { respuesta } = req.body;
    if (!respuesta || !String(respuesta).trim()) {
      return res.status(400).json({ error: 'La respuesta no puede estar vacía.' });
    }

    try {
      const r = await sbRest(`/reclamos?select=id,email,nombre,categoria,estado&id=eq.${encodeURIComponent(req.params.id)}&limit=1`);
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      const reclamo = (await r.json())?.[0];
      if (!reclamo) return res.status(404).json({ error: 'No se encontró ese reclamo.' });
      if (!reclamo.email) return res.status(400).json({ error: 'El reclamo no tiene un correo asociado.' });

      const estado = reclamo.estado || 'PENDIENTE';
      // Cada desenlace con su color y su texto. Los estados intermedios
      // (PENDIENTE, EN_REVISION) caen en el azul de "en revisión".
      const DESENLACES = {
        ACEPTADO:              { color: '#059669', texto: 'ACEPTADO' },
        ACEPTADO_PARCIALMENTE: { color: '#ea580c', texto: 'ACEPTADO PARCIALMENTE' },
        RECHAZADO:             { color: '#dc2626', texto: 'RECHAZADO' },
        MATRICULADO:           { color: '#0f766e', texto: 'MATRICULADO' },
      };
      const { color: colorEstado, texto: textoEstado } =
        DESENLACES[estado] || { color: '#2563EB', texto: 'EN REVISIÓN' };

      // Formato peruano: "APELLIDO1 APELLIDO2, NOMBRE1" → tomar el nombre de pila.
      const nombreCompleto = (reclamo.nombre || '').trim();
      const primerNombre = nombreCompleto.includes(',')
        ? nombreCompleto.split(',')[1]?.trim().split(/\s+/)[0]
        : nombreCompleto.split(/\s+/)[0];
      const saludo = primerNombre
        ? `Hola, ${primerNombre.charAt(0).toUpperCase()}${primerNombre.slice(1).toLowerCase()}`
        : 'Hola';

      // escapeHtml, no interpolación directa: la respuesta la escribe un humano en
      // un textarea y puede traer <, > o & que romperían el correo.
      const escapeHtml = (t) => String(t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
      const respuestaHtml = escapeHtml(respuesta).replace(/\n/g, '<br />');

      await sendEmail({
        to: reclamo.email,
        subject: `Respuesta a tu reclamo ${reclamo.id} — TEFIIS`,
        html: emailTemplate(`
          <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827">${saludo}</p>
          <p style="margin:0 0 20px;font-size:14px;color:#4b5563">
            El Tercio revisó tu reclamo <strong>${reclamo.id}</strong>${reclamo.categoria ? ` sobre ${escapeHtml(reclamo.categoria)}` : ''}.
          </p>
          <p style="margin:0 0 20px;text-align:center">
            <span style="display:inline-block;padding:8px 18px;border-radius:999px;background:${colorEstado}1a;color:${colorEstado};font-size:13px;font-weight:700;letter-spacing:1px">
              ${textoEstado}
            </span>
          </p>
          <div style="background:#f9fafb;border-left:3px solid ${colorEstado};border-radius:6px;padding:16px 18px;margin:0 0 20px">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#111827">${respuestaHtml}</p>
          </div>
          <p style="margin:0;font-size:13px;color:#6b7280">
            Puedes revisar el estado de tus reclamos en cualquier momento desde TEFIIS.
          </p>
        `),
      });

      logActividad({
        actorEmail: req.adminEmail,
        actorType: 'admin',
        accion: 'reclamo_respondido',
        detalle: { caseId: reclamo.id, estado },
      });

      // Historial de envíos: una fila por cada vez que se manda un correo, no un
      // campo que se sobrescribe. Así un reclamo con dos idas y vueltas conserva
      // el primer mensaje aunque se envíe uno nuevo.
      const entrada = { reclamo_id: reclamo.id, estado, mensaje: respuesta, admin_email: req.adminEmail };
      let creado_en = new Date().toISOString();
      try {
        const ins = await sbRest('/respuestas_reclamo', {
          method: 'POST',
          headers: { 'Prefer': 'return=representation' },
          body: JSON.stringify(entrada),
        });
        if (ins.ok) {
          const fila = (await ins.json())?.[0];
          if (fila?.created_at) creado_en = fila.created_at;
        } else {
          console.error('No se pudo guardar el historial de respuesta:', await ins.text());
        }
      } catch (errHist) {
        // El correo ya se envió: no se puede fallar la petición por esto. El
        // admin se entera igual, solo que esa entrada no sobrevivirá a un reload.
        console.error('No se pudo guardar el historial de respuesta:', errHist.message);
      }

      res.json({ ok: true, entrada: { ...entrada, created_at: creado_en } });
    } catch (err) {
      console.error('No se pudo enviar la respuesta del reclamo:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Historial de correos enviados para un reclamo. Cualquier admin autorizado
  // puede verlo: ya ve el campo "respuesta" actual del reclamo, esto solo agrega
  // las versiones anteriores si hubo más de un envío.
  rutas.get('/api/admin/reclamos/:id/respuestas', requireAdminAuth, async (req, res) => {
    try {
      const r = await sbRest(`/respuestas_reclamo?select=estado,mensaje,admin_email,created_at&reclamo_id=eq.${encodeURIComponent(req.params.id)}&order=created_at.asc`);
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      res.json(await r.json());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Estudiante: el detalle de UN reclamo suyo, con su ciclo de vida.
  rutas.get('/api/reclamos/mine/:id', requireStudentAuth, async (req, res) => {
    const caseId = req.params.id;
    try {
      // El filtro por email va en la consulta, no en una comprobación posterior:
      // así un id ajeno simplemente no devuelve fila y no hay forma de distinguir
      // "no es tuyo" de "no existe", que es lo que conviene no revelar.
      const r = await sbRest(`/reclamos?select=*&id=eq.${encodeURIComponent(caseId)}&email=eq.${encodeURIComponent(req.studentEmail)}&limit=1`);
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      const filas = await r.json();
      const reclamo = filas?.[0];
      if (!reclamo) return res.status(404).json({ error: 'No se encontró ese reclamo.' });

      // El estudiante ve lo que se le COMUNICÓ, no el estado con el que el Tercio
      // trabaja por dentro. Mientras se delibera, el estado va y viene en el panel
      // —en revisión, aceptado, rechazado— y nada de eso le incumbe hasta que
      // alguien decide escribirle.
      //
      // Cada correo enviado deja una fila en respuestas_reclamo, así que esa tabla
      // es justo el registro de lo que él sabe: su historial y su estado salen de
      // ahí y no de activity_log, que recoge también el trabajo interno.
      const envios = await sbRest(`/respuestas_reclamo?select=estado,created_at&reclamo_id=eq.${encodeURIComponent(caseId)}&order=created_at.asc`);
      const comunicados = envios.ok ? await envios.json() : [];

      const eventos = [{ fecha: reclamo.created_at, tipo: 'creado', estado: null }];
      for (const envio of comunicados) {
        eventos.push({ fecha: envio.created_at, tipo: 'estado', estado: envio.estado });
      }

      // Sin ningún correo enviado, para él sigue pendiente por mucho que por
      // dentro esté en revisión. La excepción son los reclamos respondidos antes
      // de que existiera respuestas_reclamo: ahí ya se le comunicó algo, así que
      // se cae al estado guardado en vez de mentirle diciendo PENDIENTE.
      const estadoVisible = comunicados.length
        ? comunicados[comunicados.length - 1].estado
        : (reclamo.respuesta ? (reclamo.estado || 'PENDIENTE') : 'PENDIENTE');

      // Se devuelve solo lo que le corresponde ver al estudiante. `comentario` es
      // la nota interna del admin y se queda fuera a propósito: la UI del panel la
      // rotula "no se envía al estudiante".
      res.json({
        id: reclamo.id,
        categoria: reclamo.categoria,
        descripcion: reclamo.descripcion,
        estado: estadoVisible,
        created_at: reclamo.created_at,
        respuesta: reclamo.respuesta || null,
        evidencias: (reclamo.documentos?.evidencias || []).map(e => ({
          nombre: e.nombre,
          tipo: e.tipo,
          bytes: e.bytes,
        })),
        // Lo que pidió sobre cursos es suyo y forma parte de lo que envió: sin
        // esto tendría que fiarse de memoria de qué secciones marcó.
        cursosRetirar: reclamo.datos_estudiante?.cursosRetirar || [],
        cursosMatricular: reclamo.datos_estudiante?.cursosMatricular || [],
        historial: eventos,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Admin: ver todos los reclamos. PostgREST corta cada respuesta en 1 000 filas
  // (PGRST_DB_MAX_ROWS) sin avisar, y con más reclamos la bandeja perdía los más
  // antiguos (E2, Lab12: faltaban 500 de 1 500). Se piden por páginas hasta
  // traerlos todos. El id desempata el orden: sin él, dos reclamos con la misma
  // fecha podrían repetirse o saltarse entre una página y la siguiente.
  rutas.get('/api/admin/reclamos', requireAdminAuth, async (req, res) => {
    try {
      const r = await sbRestTodo('/reclamos?select=*&order=created_at.desc,id.desc');
      if (!r.ok) { const t = await r.respuesta.text(); return res.status(500).json({ error: t }); }
      res.json(r.filas);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  // Admin: actualizar estado/comentario/respuesta de un reclamo
  // Las cuatro carreras de la FIIS. La corrección de especialidad solo puede
  // escribir uno de estos nombres: el admin manda cuál, no el texto libre, así
  // un token robado no puede meter cualquier cosa dentro del JSON del reclamo.
  const ESPECIALIDADES_FIIS = [
    'Ingeniería Industrial',
    'Ingeniería de Sistemas',
    'Ingeniería de Software',
    'Ingeniería de Inteligencia Artificial',
  ];

  // Los estados que puede tener un reclamo. Antes se guardaba lo que llegara en
  // el cuerpo, así que un error de tecleo dejaba un estado inexistente en la base
  // que ningún filtro ni contador del panel sabía mostrar.
  const ESTADOS_RECLAMO = [
    'PENDIENTE',
    'EN_REVISION',
    'ACEPTADO',
    'ACEPTADO_PARCIALMENTE',
    'RECHAZADO',
    'MATRICULADO',
  ];

  // MATRICULADO cierra el caso: la matrícula ya se ejecutó y no hay marcha atrás
  // posible en la vida real, así que tampoco la hay aquí. El candado va en el
  // servidor y no solo en el panel: bloquearlo únicamente en la interfaz lo
  // dejaría a un clic de cualquiera con el token.
  const ESTADO_FINAL = 'MATRICULADO';

  rutas.patch('/api/admin/reclamos/:id', requireAdminAuth, async (req, res) => {
    const { estado, comentario, respuesta, especialidad } = req.body;

    if (estado !== undefined && !ESTADOS_RECLAMO.includes(estado)) {
      return res.status(400).json({ error: 'Ese no es un estado válido de reclamo.' });
    }

    const patch = {};
    if (estado !== undefined) patch.estado = estado;
    if (comentario !== undefined) patch.comentario = comentario;
    if (respuesta !== undefined) patch.respuesta = respuesta;

    if (especialidad !== undefined && !ESPECIALIDADES_FIIS.includes(especialidad)) {
      return res.status(400).json({ error: 'Esa especialidad no es una de la FIIS.' });
    }
    if (Object.keys(patch).length === 0 && especialidad === undefined) {
      return res.status(400).json({ error: 'Nada que actualizar.' });
    }
    try {
      // La especialidad vive dentro de datos_estudiante, que es un JSON con
      // muchas más cosas (teléfono, turno, cursos, el parseo entero). Se lee y se
      // reescribe aquí, tocando solo esa clave: si el cliente mandara el objeto
      // completo, un envío con datos viejos borraría lo que otro admin acabara
      // de cambiar.
      if (especialidad !== undefined) {
        const actual = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}&select=datos_estudiante`);
        if (!actual.ok) { const t = await actual.text(); return res.status(500).json({ error: t }); }
        const filas = await actual.json();
        if (filas.length === 0) return res.status(404).json({ error: 'Ese reclamo no existe.' });

        const datos = filas[0].datos_estudiante || {};
        // Lo que declaró el estudiante se guarda la primera vez que se corrige,
        // no en cada corrección: si no, una segunda pasada lo sobrescribiría con
        // el valor ya corregido y se perdería el original.
        if (datos.especialidadDeclarada === undefined) {
          datos.especialidadDeclarada = datos.especialidad ?? null;
        }
        datos.especialidad = especialidad;
        patch.datos_estudiante = datos;
      }

      // Un reclamo ya matriculado no se toca más. Se comprueba contra lo que hay
      // guardado, no contra lo que diga el cliente: el panel oculta los botones,
      // pero eso no impide llamar a la API a mano. Repetir el mismo estado se
      // deja pasar, para que reenviar el correo no choque con esto.
      if (estado !== undefined) {
        const previo = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}&select=estado`);
        if (previo.ok) {
          const fila = (await previo.json())?.[0];
          if (fila && fila.estado === ESTADO_FINAL && estado !== ESTADO_FINAL) {
            return res.status(409).json({
              error: 'Este reclamo ya está MATRICULADO y no se puede volver a cambiar de estado.',
            });
          }
        }
      }

      // return=representation, no minimal: un PATCH sobre un id que no existe
      // actualiza cero filas y Supabase responde ok igual, así que sin mirar lo
      // devuelto se contestaba "guardado" por un reclamo inexistente.
      const r = await sbRest(`/reclamos?id=eq.${encodeURIComponent(req.params.id)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      const actualizadas = await r.json().catch(() => []);
      if (!Array.isArray(actualizadas) || actualizadas.length === 0) {
        return res.status(404).json({ error: 'Ese reclamo no existe.' });
      }
      // En el registro va solo la especialidad, no el JSON entero: el historial
      // debe poder leerse.
      const { datos_estudiante: _datosEstudiante, ...paraElLog } = patch;
      logActividad({
        actorEmail: req.adminEmail, actorType: 'admin', accion: 'reclamo_actualizado',
        detalle: { caseId: req.params.id, ...paraElLog, ...(especialidad !== undefined ? { especialidad } : {}) },
      });
      res.json({ success: true, ...(especialidad !== undefined ? { datos_estudiante: patch.datos_estudiante } : {}) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  // Quién ha atendido cada reclamo. Se deriva del log de actividad, que ya
  // registra cada cambio de estado y cada respuesta con su autor: no hace falta
  // guardar nada aparte, no hay que mantener dos fuentes sincronizadas, y sale
  // gratis para todo lo ya hecho.
  //
  // A diferencia del historial completo, esto lo puede ver cualquier admin: solo
  // dice qué compañero tocó qué caso, que es justo lo que necesitan para no
  // pisarse. El historial entero sigue restringido porque lleva mucho más.
  rutas.get('/api/admin/reclamos-atendidos', requireAdminAuth, async (req, res) => {
    try {
      const traido = await sbRestTodo('/activity_log?select=actor_email,accion,detalle,created_at&actor_type=eq.admin&accion=in.(reclamo_actualizado,reclamo_respondido)&order=created_at.asc');
      if (!traido.ok) { const t = await traido.respuesta.text(); return res.status(500).json({ error: t }); }
      const porCaso = {};
      // Se manda cada acción, no solo la primera de cada persona: la columna
      // necesita saber quién tocó el caso, pero al hacer clic en el apodo se
      // quiere ver qué hizo y a qué hora, y eso puede pasar varias veces.
      for (const fila of traido.filas) {
        const caso = fila?.detalle?.caseId;
        if (!caso || !fila.actor_email) continue;
        (porCaso[caso] = porCaso[caso] || []).push({
          email: fila.actor_email,
          accion: fila.accion,
          estado: fila.detalle?.estado || null,
          fecha: fila.created_at,
        });
      }
      res.json(porCaso);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  // ── Evidencias de un reclamo ────────────────────────────────────────────────
  // Archivos opcionales que el estudiante adjunta como prueba (capturas, cartas,
  // resoluciones). Van al mismo bucket privado que sus documentos académicos y
  // bajo su propia carpeta, de modo que la comprobación de propiedad que ya hace
  // /api/docs/signed-url —el path tiene que empezar por su correo saneado— vale
  // igual para estas y un estudiante no puede firmar las de otro.
  // Una sola prueba y en PDF. Antes se admitían hasta 5 archivos y fotos sueltas,
  // que llegaban como capturas de móvil difíciles de leer y desordenadas. Un PDF
  // obliga al estudiante a juntar lo que quiera probar en un solo documento. El
  // límite de una prueba por reclamo lo aplica el dominio del módulo reclamos
  // (modulos/reclamos/dominio/reclamo.js, MAX_EVIDENCIAS).
  const MAX_EVIDENCIA_BYTES = 10 * 1024 * 1024;   // 10 MB

  // Los reclamos anteriores pueden tener imágenes guardadas y se siguen mostrando
  // y descargando sin problema: esto solo restringe lo que se acepta de ahora en
  // adelante.
  const TIPOS_EVIDENCIA = {
    'application/pdf': 'pdf',
  };

  const MENSAJE_TIPO_EVIDENCIA = 'Solo se acepta un archivo PDF como prueba.';

  const uploadEvidencia = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_EVIDENCIA_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!TIPOS_EVIDENCIA[file.mimetype]) return cb(errorTipoArchivo(MENSAJE_TIPO_EVIDENCIA));
      cb(null, true);
    },
  });
  rutas.post('/api/reclamos/evidencias', requireStudentAuth, limiteSubidas, marcarLimite(MAX_EVIDENCIA_BYTES), uploadEvidencia.single('file'), async (req, res) => {
    // El corte va aquí y no antes de multer a propósito: rechazar antes de que el
    // cuerpo se haya consumido corta la conexión a media subida, y el navegador
    // del móvil enseña "Failed to fetch" en vez del motivo. Dejando que el
    // archivo llegue y descartándolo, el estudiante lee por qué no se guardó.
    if (await despedidaActivaPara(req.studentEmail)) {
      return res.status(503).json({ error: 'El proceso de matrícula ha terminado. Nos vemos el siguiente ciclo.' });
    }
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });
    const email = req.studentEmail;
    const extension = TIPOS_EVIDENCIA[req.file.mimetype];

    try {
      // Nombre propio y opaco: el original puede traer acentos, barras o repetirse
      // entre archivos y pisaría al anterior. El nombre visible viaja aparte.
      const id = `${Date.now()}-${randomInt(0, 1e9).toString(36)}`;
      const nombre = `${id}.${extension}`;

      const subida = await almacenamientoDeEvidencias.subir(nombre, req.file, email);
      if (!subida.ok) { const t = await subida.text(); return res.status(500).json({ error: t }); }

      const ref = almacenamientoDeEvidencias.referencia(nombre, email);

      logActividad({ actorEmail: email, actorType: 'estudiante', accion: 'evidencia_subida', detalle: { archivo: req.file.originalname, bytes: req.file.size } });

      res.json({
        success: true,
        evidencia: {
          ref,
          nombre: req.file.originalname.slice(0, 120),
          tipo: req.file.mimetype,
          bytes: req.file.size,
        },
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Quitar una evidencia antes de enviar el reclamo (o después de un error).
  rutas.delete('/api/reclamos/evidencias', requireStudentAuth, async (req, res) => {
    const { ref } = req.query;
    if (!esEvidenciaPropia(ref, req.studentEmail)) {
      return res.status(403).json({ error: 'No tienes acceso a ese archivo.' });
    }
    try {
      await almacenamientoDeEvidencias.borrar(ref);
      logActividad({ actorEmail: req.studentEmail, actorType: 'estudiante', accion: 'evidencia_eliminada', detalle: {} });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return rutas;
}
