import { Router } from 'express';

export function crearModuloConfiguracion({
  sbRest, logActividad, requireAdminAuth, emailDeSesionOpcional, SUPER_ADMIN_EMAIL,
}) {
  const rutas = Router();

  rutas.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
  });

  // ==========================================
  // INTERRUPTOR DE RECLAMOS — cierra la ventana de reclamos para los estudiantes
  // ==========================================
  // Se consulta en cada creación de reclamo, así que se cachea: con 200 alumnos
  // enviando a la vez, leerlo de Supabase por petición añade 200 viajes que
  // siempre devuelven lo mismo. 10 s basta para que apagarlo se note enseguida.
  let cacheReclamos = { valor: null, hasta: 0 };
  const TTL_INTERRUPTOR = 10_000;

  async function reclamosHabilitados() {
    if (cacheReclamos.valor !== null && Date.now() < cacheReclamos.hasta) return cacheReclamos.valor;
    try {
      const r = await sbRest('/app_settings?key=eq.reclamos_habilitados&select=value');
      if (!r.ok) throw new Error(await r.text());
      const rows = await r.json();
      // Sin fila configurada, la ventana está abierta: es el estado normal y no
      // se puede exigir un paso manual en Supabase para que el sistema funcione.
      const valor = rows[0]?.value !== false;
      cacheReclamos = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
      return valor;
    } catch (err) {
      // Si Supabase falla se deja pasar. Bloquear a los 200 por un fallo de
      // lectura hace más daño que dejar entrar algún reclamo de más, que el
      // admin ve y puede tratar.
      console.error('No se pudo leer el interruptor de reclamos:', err.message);
      return true;
    }
  }

  // Con la ventana cerrada, el administrador principal sigue pudiendo enviar
  // reclamos para probar el flujo de punta a punta sin abrirla para todos. El
  // correo se compara contra el del JWT firmado, nunca contra uno que venga en el
  // cuerpo, y la excepción vive en el código —no en la base ni en una variable de
  // entorno— para que cambiarla exija un despliegue y quede en el historial.
  async function puedeEnviarReclamo(email) {
    if (await reclamosHabilitados()) return true;
    return String(email || '').toLowerCase() === SUPER_ADMIN_EMAIL;
  }

  // Pública a propósito: el frontend la consulta antes de mostrar el formulario.
  // Si viene una sesión válida, la respuesta se personaliza; sin ella se informa
  // del estado general, que es lo que corresponde a un visitante sin identificar.
  rutas.get('/api/reclamos-habilitados', async (req, res) => {
    res.json({ habilitados: await puedeEnviarReclamo(emailDeSesionOpcional(req)) });
  });

  rutas.post('/api/admin/reclamos-habilitados', requireAdminAuth, async (req, res) => {
    if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo el administrador principal puede abrir o cerrar la ventana de reclamos.' });
    }
    const { habilitados } = req.body;
    if (typeof habilitados !== 'boolean') return res.status(400).json({ error: 'El campo "habilitados" debe ser true o false.' });
    try {
      // Upsert: la fila puede no existir todavía y no se va a pedir un paso
      // manual en Supabase para poder usar el interruptor la primera vez.
      const r = await sbRest('/app_settings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'reclamos_habilitados', value: habilitados, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      cacheReclamos = { valor: habilitados, hasta: Date.now() + TTL_INTERRUPTOR };
      logActividad({
        actorEmail: req.adminEmail, actorType: 'admin',
        accion: habilitados ? 'reclamos_habilitados' : 'reclamos_deshabilitados',
      });
      res.json({ success: true, habilitados });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // MODO ALMUERZO — pausa solo las consultas a Tefi
  // ==========================================
  // A diferencia del mantenimiento, esto NO apaga la plataforma: los reclamos
  // siguen funcionando con normalidad y es a donde se redirige al estudiante.
  // Solo se cierra la conversación, que es lo que consume cuota de Gemini.
  // Se consulta en cada pregunta a Tefi, así que se cachea igual que el
  // interruptor de reclamos: sin esto, cada consulta añade un viaje a Supabase
  // que siempre devuelve lo mismo. 10 s basta para que encenderlo se note.
  let cacheAlmuerzo = { valor: null, hasta: 0 };

  async function modoAlmuerzoActivo() {
    if (cacheAlmuerzo.valor !== null && Date.now() < cacheAlmuerzo.hasta) return cacheAlmuerzo.valor;
    try {
      const r = await sbRest('/app_settings?key=eq.modo_almuerzo&select=value');
      if (!r.ok) throw new Error(await r.text());
      const filas = await r.json();
      const valor = filas[0]?.value === true;
      cacheAlmuerzo = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
      return valor;
    } catch (err) {
      // Ante un fallo se responde que no está activo: dejar el chat abierto de
      // más es mucho menos grave que cerrarlo por un error de lectura.
      console.error('No se pudo leer el modo almuerzo:', err.message);
      return false;
    }
  }

  rutas.get('/api/modo-almuerzo', async (req, res) => {
    res.json({ activo: await modoAlmuerzoActivo() });
  });

  rutas.post('/api/admin/modo-almuerzo', requireAdminAuth, async (req, res) => {
    if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo almuerzo.' });
    }
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
    try {
      // Upsert: la fila puede no existir todavía y no se va a pedir un paso
      // manual en Supabase para poder usar el interruptor la primera vez.
      const r = await sbRest('/app_settings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'modo_almuerzo', value: activo, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      cacheAlmuerzo = { valor: activo, hasta: Date.now() + TTL_INTERRUPTOR };
      logActividad({
        actorEmail: req.adminEmail, actorType: 'admin',
        accion: activo ? 'modo_almuerzo_activado' : 'modo_almuerzo_desactivado',
      });
      res.json({ success: true, activo });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // MODO ALMUERZO FESTIVO — igual que el almuerzo normal, pero para feriados
  // ==========================================
  // Interruptor independiente del modo almuerzo de todos los días: los dos
  // pueden convivir sin pisarse, cada uno con su propia fila en app_settings.
  let cacheAlmuerzoFestivo = { valor: null, hasta: 0 };

  async function modoAlmuerzoFestivoActivo() {
    if (cacheAlmuerzoFestivo.valor !== null && Date.now() < cacheAlmuerzoFestivo.hasta) return cacheAlmuerzoFestivo.valor;
    try {
      const r = await sbRest('/app_settings?key=eq.modo_almuerzo_festivo&select=value');
      if (!r.ok) throw new Error(await r.text());
      const filas = await r.json();
      const valor = filas[0]?.value === true;
      cacheAlmuerzoFestivo = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
      return valor;
    } catch (err) {
      console.error('No se pudo leer el modo almuerzo festivo:', err.message);
      return false;
    }
  }

  rutas.get('/api/modo-almuerzo-festivo', async (req, res) => {
    res.json({ activo: await modoAlmuerzoFestivoActivo() });
  });

  rutas.post('/api/admin/modo-almuerzo-festivo', requireAdminAuth, async (req, res) => {
    if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo almuerzo festivo.' });
    }
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
    try {
      const r = await sbRest('/app_settings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'modo_almuerzo_festivo', value: activo, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      cacheAlmuerzoFestivo = { valor: activo, hasta: Date.now() + TTL_INTERRUPTOR };
      logActividad({
        actorEmail: req.adminEmail, actorType: 'admin',
        accion: activo ? 'modo_almuerzo_festivo_activado' : 'modo_almuerzo_festivo_desactivado',
      });
      res.json({ success: true, activo });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // MODO MANTENIMIENTO — pausa sistema-tefiis para todos los estudiantes
  // ==========================================
  // Pública y sin auth a propósito: la consulta el frontend de sistema-tefiis
  // para TODOS los visitantes, incluso antes de iniciar sesión.
  rutas.get('/api/maintenance', async (req, res) => {
    try {
      const r = await sbRest('/app_settings?key=eq.maintenance_mode&select=value');
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      const rows = await r.json();
      res.json({ enabled: rows[0]?.value === true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  rutas.post('/api/admin/maintenance', requireAdminAuth, async (req, res) => {
    if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo mantenimiento.' });
    }
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'El campo "enabled" debe ser true o false.' });
    try {
      // Upsert, como los demás interruptores. Antes era un PATCH: si la fila no
      // existía, no actualizaba nada y aun así respondía que el modo quedó activo.
      const r = await sbRest('/app_settings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'maintenance_mode', value: enabled, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: enabled ? 'mantenimiento_activado' : 'mantenimiento_desactivado' });
      res.json({ success: true, enabled });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // MODO "TEFI DURMIENDO" — pausa sistema-tefiis para todos los estudiantes
  // ==========================================
  // Independiente del modo mantenimiento: comparten el mismo efecto (bloquear
  // toda la app) pero distinto propósito y distinta clave en app_settings, así
  // que se pueden activar o desactivar sin que uno pise al otro. Manual, sin
  // horario automático: el propio texto menciona un horario de descanso, pero
  // eso es solo el mensaje al estudiante, no una condición que el servidor
  // evalúe.
  // Se cachea igual que los otros interruptores: se consulta en cada reclamo
  // y sin caché serían tantos viajes a Supabase como envíos.
  let cacheTefiDurmiendo = { valor: null, hasta: 0 };

  async function tefiDurmiendoActivo() {
    if (cacheTefiDurmiendo.valor !== null && Date.now() < cacheTefiDurmiendo.hasta) return cacheTefiDurmiendo.valor;
    try {
      const r = await sbRest('/app_settings?key=eq.tefi_durmiendo&select=value');
      if (!r.ok) throw new Error(await r.text());
      const filas = await r.json();
      const valor = filas[0]?.value === true;
      cacheTefiDurmiendo = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
      return valor;
    } catch (err) {
      // Ante un fallo se deja enviar: bloquear todos los reclamos por un error de
      // lectura sería peor que dejar pasar alguno de más con el modo activo.
      console.error('No se pudo leer el modo tefi_durmiendo:', err.message);
      return false;
    }
  }

  rutas.get('/api/tefi-durmiendo', async (req, res) => {
    res.json({ enabled: await tefiDurmiendoActivo() });
  });

  rutas.post('/api/admin/tefi-durmiendo', requireAdminAuth, async (req, res) => {
    if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo el administrador principal puede activar el modo Tefi durmiendo.' });
    }
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'El campo "enabled" debe ser true o false.' });
    try {
      const r = await sbRest('/app_settings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'tefi_durmiendo', value: enabled, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      cacheTefiDurmiendo = { valor: enabled, hasta: Date.now() + TTL_INTERRUPTOR };
      logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: enabled ? 'tefi_durmiendo_activado' : 'tefi_durmiendo_desactivado' });
      res.json({ success: true, enabled });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // MODO DESPEDIDA — el ciclo de matrícula terminó
  // ==========================================
  // No es el modo mantenimiento ni Tefi durmiendo: aquéllos son pausas y se
  // espera que la plataforma vuelva. Éste es el cierre del ciclo, así que la
  // pantalla se despide y los reclamos quedan cerrados hasta el ciclo siguiente.
  // Clave propia en app_settings para poder combinarlo con los otros sin que se
  // pisen, y cacheado igual que ellos porque se consulta en cada envío.
  let cacheDespedida = { valor: null, hasta: 0 };

  // Cerrado el ciclo, estos correos siguen pudiendo presentar su reclamo. Igual
  // que CORREOS_EXCEPCION y por el mismo motivo: vive en el código, no en la base
  // ni en una variable de entorno, así que abrir la mano exige un despliegue y
  // queda en el historial de git, con fecha y autor.
  // Siempre en minúsculas: la búsqueda normaliza lo que llega, así que una
  // entrada con mayúsculas aquí no coincidiría nunca.
  const EXCEPCIONES_DESPEDIDA = new Set([
    'alvaro.coronel.t@uni.pe',
    'marcelo.rumiche.r@uni.pe',
  ]);

  // El cierre se evalúa POR PERSONA, no solo de forma global. Sin esto, abrirle el
  // candado del servidor no serviría de nada: seguiría viendo la pantalla de
  // despedida y no llegaría ni al formulario.
  async function despedidaActivaPara(email) {
    if (!(await modoDespedidaActivo())) return false;
    return !EXCEPCIONES_DESPEDIDA.has(String(email || '').trim().toLowerCase());
  }

  async function modoDespedidaActivo() {
    if (cacheDespedida.valor !== null && Date.now() < cacheDespedida.hasta) return cacheDespedida.valor;
    try {
      const r = await sbRest('/app_settings?key=eq.modo_despedida&select=value');
      if (!r.ok) throw new Error(await r.text());
      const filas = await r.json();
      const valor = filas[0]?.value === true;
      cacheDespedida = { valor, hasta: Date.now() + TTL_INTERRUPTOR };
      return valor;
    } catch (err) {
      // Como en los demás interruptores: ante un fallo de lectura se deja pasar.
      // Cerrar la matrícula entera por un error de red sería mucho peor que dejar
      // entrar algún reclamo de más, que el admin ve y puede tratar.
      console.error('No se pudo leer el modo despedida:', err.message);
      return false;
    }
  }

  // Pública: el frontend la consulta al cargar para saber si muestra la
  // despedida en vez del menú normal.
  rutas.get('/api/modo-despedida', async (req, res) => {
    res.json({ activo: await despedidaActivaPara(emailDeSesionOpcional(req)) });
  });

  rutas.post('/api/admin/modo-despedida', requireAdminAuth, async (req, res) => {
    if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo el administrador principal puede cerrar el ciclo.' });
    }
    const { activo } = req.body;
    if (typeof activo !== 'boolean') return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
    try {
      const r = await sbRest('/app_settings', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ key: 'modo_despedida', value: activo, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      cacheDespedida = { valor: activo, hasta: Date.now() + TTL_INTERRUPTOR };
      logActividad({ actorEmail: req.adminEmail, actorType: 'admin', accion: activo ? 'modo_despedida_activado' : 'modo_despedida_desactivado' });
      res.json({ success: true, activo });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // HISTORIAL DE ACTIVIDAD — solo admin principal
  // ==========================================
  rutas.get('/api/admin/activity', requireAdminAuth, async (req, res) => {
    if (req.adminEmail.toLowerCase() !== SUPER_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Solo el administrador principal puede ver el historial.' });
    }
    try {
      const r = await sbRest('/activity_log?select=*&order=created_at.desc&limit=500');
      if (!r.ok) { const t = await r.text(); return res.status(500).json({ error: t }); }
      res.json(await r.json());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  async function obtenerNombreStoreRag() {
    const respuesta = await sbRest('/app_settings?select=value&key=eq.rag_store_name');
    if (!respuesta.ok) return null;
    const filas = await respuesta.json();
    return filas?.[0]?.value;
  }

  return {
    rutas, tefiDurmiendoActivo, despedidaActivaPara, puedeEnviarReclamo, obtenerNombreStoreRag,
    modoAlmuerzoActivo, modoAlmuerzoFestivoActivo,
  };
}
