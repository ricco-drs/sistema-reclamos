import { Router } from 'express';
import multer from 'multer';
import {
  createSignedUrl, deleteStorageFile, parseStorageRef, referenciaDeArchivo,
  subirArchivo, limiteSubidas, marcarLimite, MAX_PDF_BYTES, soloPdf,
} from '@tefiis/compartido';

const DOCS_BUCKET = 'Documentos Tefiis';
const sanitizeEmail = (email) => email.toLowerCase().replace('@', '_at_').replace(/\./g, '_');

const carpetaEvidencias = (email) => `${sanitizeEmail(email)}/evidencias/`;

// Una referencia solo es válida si apunta a la carpeta de evidencias del propio
// estudiante. Se comprueba en el servidor y no en el cliente: el navegador manda
// las referencias al crear el reclamo y podría mandar cualquier cosa.
// startsWith por sí solo NO basta: "mi_correo/../otro_correo/ficha.pdf" empieza
// por mi carpeta y Supabase resuelve el ".." antes de servir el objeto, así que
// firmaba y entregaba el archivo del otro. Se rechaza cualquier segmento "." o
// ".." y se exige que el bucket sea el de documentos, no uno cualquiera que
// venga en la URL.
function rutaDentroDe(storedUrl, prefijo) {
  if (typeof storedUrl !== 'string') return false;
  const partes = parseStorageRef(storedUrl);
  if (!partes || partes.bucket !== DOCS_BUCKET) return false;
  const segmentos = partes.path.split('/');
  if (segmentos.some((seg) => seg === '..' || seg === '.' || seg === '')) return false;
  return partes.path.startsWith(prefijo);
}

export function esEvidenciaPropia(ref, email) {
  return rutaDentroDe(ref, carpetaEvidencias(email));
}

export function esDocumentoPropio(ref, email) {
  return rutaDentroDe(ref, `${sanitizeEmail(email)}/`);
}

export const almacenamientoDeEvidencias = {
  subir(nombre, archivo, email) {
    return subirArchivo(DOCS_BUCKET, `${carpetaEvidencias(email)}${nombre}`, archivo);
  },
  referencia(nombre, email) {
    return referenciaDeArchivo(DOCS_BUCKET, `${carpetaEvidencias(email)}${nombre}`);
  },
  borrar: deleteStorageFile,
};

export function crearModuloDocumentos({
  sbRest, logActividad, despedidaActivaPara, requireAdminAuth, requireStudentAuth,
}) {
  const rutas = Router();

  // Admin: guardar los datos académicos que el panel extrajo de los PDF.
  //
  // Aquí no se parsea nada: la extracción ocurre en el navegador del admin, en
  // Tefiis-admin, y esta ruta solo persiste el resultado. El parseo salió de este
  // proyecto a propósito — corriendo en el servidor bloqueaba el único hilo de
  // Node y, en el navegador del alumno, le cargaba un trabajo que no le sirve.
  rutas.put('/api/admin/estudiantes/:email/datos', requireAdminAuth, async (req, res) => {
    const email = String(req.params.email || '').trim().toLowerCase();
    const { datosParseados, datosPlanos, codigo } = req.body;

    if (!email) return res.status(400).json({ error: 'Correo requerido.' });
    if (!datosParseados || typeof datosParseados !== 'object') {
      return res.status(400).json({ error: 'Faltan los datos extraídos.' });
    }

    try {
      const r = await sbRest(`/documentos_estudiante?select=datos_parseados&email=eq.${encodeURIComponent(email)}&limit=1`);
      // Si la base falla, es un 500: antes se confundía con «no tiene documentos».
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      const fila = (await r.json())?.[0];
      if (!fila) return res.status(404).json({ error: 'Ese estudiante no tiene documentos guardados.' });

      // El contacto lo escribe el estudiante y no sale de los PDF: se conserva
      // para que volver a extraer no le borre su teléfono y su turno.
      const guardado = await sbRest('/documentos_estudiante?on_conflict=email', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          email,
          codigo_estudiante: codigo || null,
          datos_parseados: { ...datosParseados, _contacto: fila.datos_parseados?._contacto || {} },
          datos_academicos: datosPlanos || {},
          updated_at: new Date().toISOString(),
        }),
      });
      if (!guardado.ok) { const t = await guardado.text(); return res.status(500).json({ error: t }); }

      logActividad({
        actorEmail: req.adminEmail,
        actorType: 'admin',
        accion: 'datos_estudiante_extraidos',
        detalle: { estudiante: email, codigo: codigo || null },
      });

      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Admin: ver todos los estudiantes con documentos registrados
  rutas.get('/api/admin/estudiantes', requireAdminAuth, async (req, res) => {
    try {
      const r = await sbRest('/documentos_estudiante?select=*&order=updated_at.desc');
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      res.json(await r.json());
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  // Admin: obtener una signed URL para ver el documento de cualquier estudiante
  rutas.get('/api/admin/docs/signed-url', requireAdminAuth, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url requerida' });
    // Una referencia que no se puede interpretar es un error de la petición, no
    // del servidor: antes llegaba hasta createSignedUrl y salía como 500.
    if (!parseStorageRef(url)) return res.status(400).json({ error: 'Referencia de archivo inválida' });
    try {
      const signedUrl = await createSignedUrl(url);
      res.json({ signedUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Estudiante: obtener una signed URL, pero solo de un documento que sea suyo
  // (el path guardado siempre empieza con su carpeta sanitizeEmail(email)/...).
  rutas.get('/api/docs/signed-url', requireStudentAuth, async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url requerida' });
    if (!esDocumentoPropio(url, req.studentEmail)) {
      return res.status(403).json({ error: 'No tienes acceso a ese documento.' });
    }
    try {
      const signedUrl = await createSignedUrl(url);
      res.json({ signedUrl });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  rutas.post('/api/docs/save', requireStudentAuth, async (req, res) => {
    const email = req.studentEmail;
    const { boleta_url, record_notas_url, record_matricula_url, codigo_estudiante, datos_parseados } = req.body;
    try {
      // 1. Obtener registro existente en Supabase para no perder URLs previas si solo se subió un archivo
      const getRes = await sbRest(`/documentos_estudiante?email=eq.${encodeURIComponent(email)}&limit=1`);
      let existing = {};
      if (getRes.ok) {
        const existingData = await getRes.json();
        if (existingData && existingData.length > 0) {
          existing = existingData[0];
        }
      }

      const finalBoleta = boleta_url || existing.boleta_url;
      const finalAvance = record_notas_url || existing.record_notas_url;
      const finalFicha = record_matricula_url || existing.record_matricula_url;

      let finalDatosParseados = datos_parseados || existing.datos_parseados || {};
      let finalCodigo = codigo_estudiante || existing.codigo_estudiante;
      let finalDatosAcademicos = existing.datos_academicos || {};

      // El parseo ya no ocurre aquí. Antes esta ruta extraía los datos de los
      // PDF en cada subida de estudiante, así que 200 alumnos matriculándose a la
      // vez eran 200 extracciones bloqueando el único hilo de Node, y además
      // reparseaba lo que el navegador ya había parseado. Ahora la ruta solo
      // guarda las rutas de los archivos: la extracción la dispara un admin
      // desde el panel con /api/admin/estudiantes/:email/parsear.
      //
      // Se conserva datos_parseados que llegue en el cuerpo por compatibilidad
      // con lo ya guardado, pero el servidor no lo genera.

      const r = await sbRest('/documentos_estudiante?on_conflict=email', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          email,
          boleta_url: finalBoleta || null,
          record_notas_url: finalAvance || null,
          record_matricula_url: finalFicha || null,
          codigo_estudiante: finalCodigo || null,
          datos_parseados: finalDatosParseados,
          codigo: finalCodigo || null,
          urls: { ficha: finalFicha || null, boleta: finalBoleta || null, avance: finalAvance || null },
          datos_academicos: finalDatosAcademicos,
          updated_at: new Date().toISOString()
        })
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      res.json({ success: true, datos_parseados: finalDatosParseados });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });


  rutas.get('/api/docs/:email', requireStudentAuth, async (req, res) => {
    const email = req.studentEmail;
    try {
      const r = await sbRest(`/documentos_estudiante?email=eq.${encodeURIComponent(email)}&limit=1`);
      const data = await r.json();
      res.json(data[0] || null);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const DOC_FIELD_BY_TIPO = {
    ficha: 'record_matricula_url',
    boleta: 'boleta_url',
    avance: 'record_notas_url',
  };

  rutas.delete('/api/docs/:email/:tipo', requireStudentAuth, async (req, res) => {
    const email = req.studentEmail;
    const field = DOC_FIELD_BY_TIPO[req.params.tipo];
    if (!field) return res.status(400).json({ error: 'Tipo de documento inválido' });
    try {
      const getRes = await sbRest(`/documentos_estudiante?email=eq.${encodeURIComponent(email)}&limit=1`);
      const existingData = await getRes.json();
      const existing = existingData?.[0];
      const storedUrl = existing?.[field];
      if (!storedUrl) return res.status(404).json({ error: 'No hay documento guardado para borrar' });

      await deleteStorageFile(storedUrl);

      const patchRes = await sbRest(`/documentos_estudiante?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: JSON.stringify({ [field]: null, updated_at: new Date().toISOString() })
      });
      if (!patchRes.ok) { const t = await patchRes.text(); return res.status(500).json({ error: t }); }

      logActividad({ actorEmail: email, actorType: 'estudiante', accion: 'documento_eliminado', detalle: { tipo: req.params.tipo } });
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_PDF_BYTES, files: 1 },
    fileFilter: soloPdf,
  });

  // Sube el PDF directo a Storage con la service key (evita RLS) y actualiza
  // la columna correspondiente en documentos_estudiante.
  rutas.post('/api/docs/upload', requireStudentAuth, limiteSubidas, marcarLimite(MAX_PDF_BYTES), uploadMemory.single('file'), async (req, res) => {
    // Igual que en las evidencias: después de multer, para que el error llegue
    // legible en vez de como una conexión cortada. Sin esto, una pestaña abierta
    // desde antes del cierre pisaría los PDF buenos del estudiante con otros
    // nuevos que ya no van a servir para ningún reclamo.
    if (await despedidaActivaPara(req.studentEmail)) {
      return res.status(503).json({ error: 'El proceso de matrícula ha terminado. Nos vemos el siguiente ciclo.' });
    }
    const email = req.studentEmail;
    const { tipo } = req.body;
    const field = DOC_FIELD_BY_TIPO[tipo];
    if (!field) return res.status(400).json({ error: 'Tipo de documento inválido' });
    if (!req.file) return res.status(400).json({ error: 'No se envió ningún archivo' });

    try {
      const sid = sanitizeEmail(email);
      const objectPath = `${sid}/${tipo}.pdf`;

      const uploadRes = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(DOCS_BUCKET)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST',
        headers: {
          'apikey': process.env.SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/pdf',
          'x-upsert': 'true',
        },
        body: req.file.buffer,
      });
      if (!uploadRes.ok) { const t = await uploadRes.text(); return res.status(500).json({ error: t }); }

      const url = referenciaDeArchivo(DOCS_BUCKET, objectPath);

      const patchRes = await sbRest('/documentos_estudiante?on_conflict=email', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ email, [field]: url, updated_at: new Date().toISOString() })
      });
      if (!patchRes.ok) { const t = await patchRes.text(); return res.status(500).json({ error: t }); }

      logActividad({ actorEmail: email, actorType: 'estudiante', accion: 'documento_subido', detalle: { tipo, archivo: req.file.originalname } });
      res.json({ success: true, url });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  return { rutas };
}
