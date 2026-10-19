import { useState, useEffect, useMemo, useRef } from 'react';
import { Sun, Moon, ChevronDown } from 'lucide-react';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { storageUrl } from './supabase';
import Papa from 'papaparse';
import { extractPdfText, parsearFichasEstudiante } from './utils/pdfParser';
import { useTheme } from './hooks/useTheme';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';

// Todas las operaciones de admin (reclamos, estudiantes, docs) pasan por el
// backend, que valida el ID token de Firebase antes de tocar Supabase con la
// service key. Nunca se usa la key pública de Supabase para estos datos.
const ADMIN_FETCH_MAX_REINTENTOS = 2;

async function adminFetch(path, opts = {}, intento = 0) {
  // getIdToken() sin forzar reusa el token en caché del SDK — si ese token quedó
  // vencido/inválido justo tras el login o una recarga, el backend responde 401.
  const token = await auth.currentUser?.getIdToken(intento > 0);
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts.headers },
  });
  // Reintentamos automáticamente errores transitorios: 401 por token vencido, o 5xx
  // por hipos momentáneos del lado de Supabase (ej. "JWT issued at future" cuando su
  // propio reloj interno se desincroniza un instante). Con backoff corto, en vez de
  // obligar al admin a recargar la página a mano para que "funcione al refrescar".
  const esReintentable = res.status === 401 || res.status >= 500;
  if (esReintentable && intento < ADMIN_FETCH_MAX_REINTENTOS && auth.currentUser) {
    await new Promise(r => setTimeout(r, 400 * (intento + 1)));
    return adminFetch(path, opts, intento + 1);
  }
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Admin API ${res.status}: ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
import MallaCurricular from './components/MallaCurricular';
import MallaPlan from './components/MallaPlan';
import planIndustrial from './plan_industrial_2026.json';
import planSistemas from './plan_sistemas_2026.json';
import cargaHoraria from './carga_horaria_2026.json';
import HorarioCursos from './components/HorarioCursos';
import { PLAN_ESTUDIOS_SOFTWARE } from './data/planEstudios';
import icono from './assets/icono.png';
import './App.css';

const normCode = (c) => c?.replace(/[-\s]/g, '').toUpperCase().trim() || '';

// Las 4 especialidades oficiales de la FIIS. Es una lista fija (no derivada de los
// datos ya cargados) para que el filtro siempre muestre las 4 opciones, incluso si
// todavía no hay ningún estudiante parseado de alguna de ellas.
// El equipo del Tercio. Los apodos son para leer la tabla de un vistazo: un
// correo completo por fila no se distingue del de al lado.
// El panel se comparte con cuentas que solo vienen a mirar. Aquí solo se
// esconden sus botones; quien impide de verdad la escritura es el backend.
const ADMINS_SOLO_LECTURA = ['tefiis@uni.edu.pe'];

const APODOS = {
  'ricco.rashuaman.s@uni.pe':       'Ricco',
  'christopher.albino.s@uni.pe':    'Chris',
  'sergio.feliciano.z@uni.pe':      'Sergio',
  'sofia.guillen.c@uni.pe':         'Sofia',
  'yael.varillas.a@uni.pe':         'Oswaldo',
  'lenin.castro.a@uni.pe':          'Lenin',
  'diego.larico.c@uni.pe':          'Diego',
  'ballack.quintanilla.h@uni.pe':   'Batman',
  'robinson.malaver.u@uni.pe':      'Robin',
  'josecarlos.valenzuela.a@uni.pe': 'Joseca',
  'antoni.ayala.v@uni.pe':          'Antoni',
  'jose.venegas.z@uni.pe':          'Berenjena',
};

// Si entra una cuenta que no está en la lista se muestra la parte antes de la
// arroba: es preferible a dejar el hueco vacío y no saber quién fue.
const apodoDe = (email) => {
  if (!email) return '—';
  const e = email.toLowerCase();
  return APODOS[e] || e.split('@')[0];
};

// El catálogo real de cursos y secciones. La carga horaria trae una fila por
// sesión (teoría, práctica, laboratorio), así que el mismo curso-sección sale
// repetido: aquí se colapsa a un curso con su lista de secciones.
const CATALOGO_CURSOS = (() => {
  const porCodigo = {};
  for (const fila of cargaHoraria) {
    if (!fila?.codigo || !fila?.seccion) continue;
    const c = (porCodigo[fila.codigo] ||= { codigo: fila.codigo, nombre: fila.nombre || '', secciones: new Set() });
    c.secciones.add(fila.seccion);
    if (!c.nombre && fila.nombre) c.nombre = fila.nombre;
  }
  return Object.values(porCodigo)
    .map(c => ({ ...c, secciones: [...c.secciones].sort() }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
})();

const claveCurso = (codigo, seccion) => `${codigo}|${seccion}`;

// Lo que se ve junto a cada sección: cuánta gente ha metido ya el Tercio ahí y
// cuánta ha sacado. Lo segundo importa igual: si otro admin desmatriculó a dos
// de esa sección, quedan sitios libres que conviene ver antes de mandar a nadie
// a otra.
const etiquetaSeccion = (conteo, codigo, seccion) => {
  const c = conteo[claveCurso(codigo, seccion)] || {};
  const partes = [];
  if (c.asignados) partes.push(c.asignados === 1 ? '1 solicitado' : `${c.asignados} solicitados`);
  if (c.liberados) partes.push(c.liberados === 1 ? '1 sobra' : `${c.liberados} sobran`);
  return partes.length ? ` (${partes.join(' · ')})` : '';
};

// Sin tildes y en mayúsculas, para que buscar "quimica" encuentre "QUÍMICA".
const normalizarBusqueda = (t) => String(t || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Elegir curso y sección para la decisión del Tercio. Va aparte porque cada
// lista (matricular / desmatricular) necesita su propio curso elegido, y
// mantenerlo en el componente grande obligaría a llevar varios estados más.
function SelectorCurso({ lista, onAgregar, conteo }) {
  const [busqueda, setBusqueda] = useState('');
  const [codigo, setCodigo] = useState('');
  const [seccion, setSeccion] = useState('');
  const [abierto, setAbierto] = useState(false);
  const curso = CATALOGO_CURSOS.find(c => c.codigo === codigo);

  // Con 136 cursos, desplegar la lista entera era buscar a ojo. Se filtra por
  // código y por nombre a la vez, que es como se busca de verdad: unas veces se
  // sabe "FB202" y otras "química".
  const coincidencias = useMemo(() => {
    const q = normalizarBusqueda(busqueda).trim();
    const base = q
      ? CATALOGO_CURSOS.filter(c => normalizarBusqueda(`${c.codigo} ${c.nombre}`).includes(q))
      : CATALOGO_CURSOS;
    return base.slice(0, 8);
  }, [busqueda]);

  const elegir = (c) => {
    setCodigo(c.codigo);
    setBusqueda(`${c.codigo} — ${c.nombre}`);
    setSeccion('');
    setAbierto(false);
  };

  const limpiar = () => { setCodigo(''); setBusqueda(''); setSeccion(''); setAbierto(false); };

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ position: 'relative', flex: '1 1 170px', minWidth: 0 }}>
        <input
          type="text"
          value={busqueda}
          placeholder="Buscar curso o código..."
          onChange={e => { setBusqueda(e.target.value); setCodigo(''); setSeccion(''); setAbierto(true); }}
          onFocus={() => setAbierto(true)}
          // Sin retardo: onMouseDown en la opción se dispara antes que este
          // blur, así que el clic llega igual.
          onBlur={() => setAbierto(false)}
          onKeyDown={e => {
            if (e.key === 'Enter' && coincidencias.length) { e.preventDefault(); elegir(coincidencias[0]); }
            if (e.key === 'Escape') limpiar();
          }}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--surface-color)', color: 'var(--text-main)',
            border: `1px solid ${codigo ? 'var(--primary-accent)' : 'var(--border-color)'}`,
            borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem' }}
        />
        {abierto && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 40, marginTop: 4,
            background: 'var(--modal-surface)', border: '1px solid var(--border-color)', borderRadius: 8,
            boxShadow: 'var(--modal-shadow)', maxHeight: 220, overflowY: 'auto' }}>
            {coincidencias.length === 0 && (
              <p style={{ margin: 0, padding: '10px 12px', fontSize: '0.74rem', color: 'var(--text-dim)' }}>
                Ningún curso coincide.
              </p>
            )}
            {coincidencias.map(c => (
              <button
                key={c.codigo}
                onMouseDown={e => { e.preventDefault(); elegir(c); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)',
                  padding: '8px 12px', fontSize: '0.74rem', cursor: 'pointer' }}
              >
                <strong>{c.codigo}</strong> — {c.nombre}
                <span style={{ color: 'var(--text-dim)' }}> · {c.secciones.length} sec.</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <select
        value={seccion}
        onChange={e => setSeccion(e.target.value)}
        disabled={!curso}
        style={{ flex: '0 0 auto', background: 'var(--surface-color)', color: 'var(--text-main)',
          border: '1px solid var(--border-color)', borderRadius: 8, padding: '7px 8px', fontSize: '0.76rem' }}
      >
        <option value="">Sec.</option>
        {(curso?.secciones || []).map(sec => (
          // No son las vacantes del catálogo: es lo que el Tercio lleva metido
          // y sacado de esa sección, empezando en cero.
          <option key={sec} value={sec}>{sec}{etiquetaSeccion(conteo, curso.codigo, sec)}</option>
        ))}
      </select>

      <button
        className="btn btn-secondary btn-small"
        disabled={!codigo || !seccion}
        onClick={() => { onAgregar(lista, codigo, seccion); limpiar(); }}
      >
        AÑADIR
      </button>
    </div>
  );
}

const ESPECIALIDADES_FIIS = [
  { codigo: 'I1', nombre: 'Ingeniería Industrial', match: /INDUSTRIAL/i },
  { codigo: 'I2', nombre: 'Ingeniería de Sistemas', match: /SISTEMAS/i },
  { codigo: 'I3', nombre: 'Ingeniería de Software', match: /SOFTWARE/i },
  { codigo: 'I4', nombre: 'Ingeniería de Inteligencia Artificial', match: /INTELIGENCIA/i },
];

// El texto de "especialidad" viene tal cual del PDF (mayúsculas, con o sin tilde,
// abreviado a veces), así que lo clasificamos por palabra clave en vez de comparar
// el string exacto.
const especialidadCodigo = (especialidadTexto) => {
  if (!especialidadTexto) return null;
  const found = ESPECIALIDADES_FIIS.find(e => e.match.test(especialidadTexto));
  return found ? found.codigo : null;
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const fmtDateShort = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const fmtHora = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
};

const estadoClass = (e) =>
  e === 'MATRICULADO' ? 'status-teal' :
  e === 'ACEPTADO' ? 'status-green' :
  e === 'ACEPTADO_PARCIALMENTE' ? 'status-orange' :
  e === 'EN_REVISION' ? 'status-blue' :
  e === 'RECHAZADO' ? 'status-red' :
  'status-yellow';

// En la base se guardan con guion bajo; a la vista van con espacios y tilde.
const ETIQUETAS_ESTADO = {
  EN_REVISION: 'EN REVISIÓN',
  ACEPTADO_PARCIALMENTE: 'ACEPTADO PARCIALMENTE',
};
const estadoLabel = (e) => ETIQUETAS_ESTADO[e] || e || 'PENDIENTE';

// En las tablas la columna de estado es estrecha. "ACEPTADO PARCIALMENTE" se
// partía en dos líneas y, como una caja en línea no se encoge al texto tras
// partirse, ocupaba la columna entera y chocaba con la de al lado. Ahí va
// abreviado; el nombre completo sigue en el detalle, el filtro, el correo y el
// Excel, y se ve al pasar el ratón por encima.
const estadoLabelCorto = (e) => e === 'ACEPTADO_PARCIALMENTE' ? 'PARCIAL' : estadoLabel(e);

// Los tres desenlaces que cierran un reclamo, frente a PENDIENTE y EN_REVISION,
// que son pasos intermedios. Se envía respuesta por correo solo en estos.
const ESTADOS_RESUELTOS = ['ACEPTADO', 'ACEPTADO_PARCIALMENTE', 'RECHAZADO', 'MATRICULADO'];

// Cierra el caso: la matrícula ya se ejecutó, así que no se puede rehacer. El
// servidor rechaza el cambio aunque alguien esquive el panel.
const ESTADO_FINAL = 'MATRICULADO';

// Se escribe solo al marcar MATRICULADO, y queda editable.
const MENSAJE_MATRICULADO = 'Tu matrícula ya fue realizada. Revisar tu INTRALU, por favor.';

// El turno se guarda con el valor del desplegable del estudiante ("0",
// "promocion" o un número de 1 a 20), que crudo no dice nada aquí.
const formatearTurno = (t) => {
  if (t === undefined || t === null || t === '') return '—';
  const v = String(t).trim().toLowerCase();
  if (v === '0') return 'Riesgo Académico';
  if (v === 'promocion' || v === 'promoción') return 'Promoción';
  return `Turno ${v}`;
};

function formatearBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const { theme, toggleTheme } = useTheme();

  // Auth
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const isSuperAdmin = user?.email?.toLowerCase() === 'ricco.rashuaman.s@uni.pe';
  // Cuentas que entran a mirar y nada más. Quien manda de verdad es el backend,
  // que rechaza todo lo que no sea GET; esto solo evita enseñar botones que
  // fallarían al pulsarlos.
  const isSoloLectura = ADMINS_SOLO_LECTURA.includes(user?.email?.toLowerCase() || '');

  // Base de conocimiento (RAG)
  const [ragFile, setRagFile] = useState(null);
  const [ragUploading, setRagUploading] = useState(false);
  const [ragMessage, setRagMessage] = useState(null);

  // Modo mantenimiento (pausa sistema-tefiis para todos los estudiantes)
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${API_URL}/api/maintenance`)
      .then(r => r.json())
      .then(d => setMaintenanceEnabled(!!d.enabled))
      .catch(() => setMaintenanceEnabled(null));
  }, [isSuperAdmin]);

  const handleToggleMaintenance = async () => {
    const nuevoValor = !maintenanceEnabled;
    setMaintenanceLoading(true);
    try {
      await adminFetch('/api/admin/maintenance', {
        method: 'POST',
        body: JSON.stringify({ enabled: nuevoValor }),
      });
      setMaintenanceEnabled(nuevoValor);
    } catch (err) {
      alert(`No se pudo cambiar el modo mantenimiento: ${err.message}`);
    } finally {
      setMaintenanceLoading(false);
    }
  };

  // Modo "Tefi durmiendo": independiente del mantenimiento. Mismo efecto sobre
  // sistema-tefiis, distinto propósito y distinta clave, así que uno no pisa
  // al otro y se pueden alternar sin interferencia.
  const [tefiDurmiendoEnabled, setTefiDurmiendoEnabled] = useState(null);
  const [tefiDurmiendoLoading, setTefiDurmiendoLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${API_URL}/api/tefi-durmiendo`)
      .then(r => r.json())
      .then(d => setTefiDurmiendoEnabled(!!d.enabled))
      .catch(() => setTefiDurmiendoEnabled(null));
  }, [isSuperAdmin]);

  const handleToggleTefiDurmiendo = async () => {
    const nuevoValor = !tefiDurmiendoEnabled;
    setTefiDurmiendoLoading(true);
    try {
      await adminFetch('/api/admin/tefi-durmiendo', {
        method: 'POST',
        body: JSON.stringify({ enabled: nuevoValor }),
      });
      setTefiDurmiendoEnabled(nuevoValor);
    } catch (err) {
      alert(`No se pudo cambiar el modo Tefi durmiendo: ${err.message}`);
    } finally {
      setTefiDurmiendoLoading(false);
    }
  };

  // Modo despedida: no es una pausa como los otros, es el cierre del ciclo.
  // sistema-tefiis pasa a mostrar la despedida y el servidor deja de aceptar
  // reclamos nuevos y subidas de documentos.
  const [modoDespedida, setModoDespedida] = useState(null);
  const [despedidaLoading, setDespedidaLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${API_URL}/api/modo-despedida`)
      .then(r => r.json())
      .then(d => setModoDespedida(!!d.activo))
      .catch(() => setModoDespedida(null));
  }, [isSuperAdmin]);

  const handleToggleDespedida = async () => {
    const nuevoValor = !modoDespedida;
    // Los otros interruptores se pueden alternar sin pensarlo; éste cierra la
    // matrícula para todos, así que se pregunta antes de encenderlo.
    if (nuevoValor && !window.confirm(
      `Se cerrará el ciclo:

· Los estudiantes verán la pantalla de despedida.
· No se podrán enviar reclamos nuevos ni subir documentos.
· Solo quedará disponible consultar el estado de un reclamo ya presentado.

¿Cerrar el ciclo?`
    )) return;
    setDespedidaLoading(true);
    try {
      await adminFetch('/api/admin/modo-despedida', {
        method: 'POST',
        body: JSON.stringify({ activo: nuevoValor }),
      });
      setModoDespedida(nuevoValor);
    } catch (err) {
      alert(`No se pudo cambiar el modo despedida: ${err.message}`);
    } finally {
      setDespedidaLoading(false);
    }
  };

  // Ventana de reclamos (abre y cierra el envío de reclamos nuevos)
  const [reclamosAbiertos, setReclamosAbiertos] = useState(null);
  const [reclamosSwitchLoading, setReclamosSwitchLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${API_URL}/api/reclamos-habilitados`)
      .then(r => r.json())
      .then(d => setReclamosAbiertos(!!d.habilitados))
      .catch(() => setReclamosAbiertos(null));
  }, [isSuperAdmin]);

  const handleToggleReclamos = async () => {
    const nuevoValor = !reclamosAbiertos;
    // Cerrar afecta a todos los estudiantes a la vez y no es evidente desde
    // fuera, así que se confirma antes en vez de con un clic suelto.
    if (!nuevoValor && !window.confirm('¿Cerrar la ventana de reclamos? Ningún estudiante podrá enviar reclamos nuevos hasta que la vuelvas a abrir.')) return;
    setReclamosSwitchLoading(true);
    try {
      await adminFetch('/api/admin/reclamos-habilitados', {
        method: 'POST',
        body: JSON.stringify({ habilitados: nuevoValor }),
      });
      setReclamosAbiertos(nuevoValor);
    } catch (err) {
      alert(`No se pudo cambiar la ventana de reclamos: ${err.message}`);
    } finally {
      setReclamosSwitchLoading(false);
    }
  };

  // Modo almuerzo: cierra solo la conversación con Tefi, no los reclamos
  const [modoAlmuerzo, setModoAlmuerzo] = useState(null);
  const [almuerzoLoading, setAlmuerzoLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${API_URL}/api/modo-almuerzo`)
      .then(r => r.json())
      .then(d => setModoAlmuerzo(!!d.activo))
      .catch(() => setModoAlmuerzo(null));
  }, [isSuperAdmin]);

  const handleToggleAlmuerzo = async () => {
    const nuevoValor = !modoAlmuerzo;
    setAlmuerzoLoading(true);
    try {
      await adminFetch('/api/admin/modo-almuerzo', {
        method: 'POST',
        body: JSON.stringify({ activo: nuevoValor }),
      });
      setModoAlmuerzo(nuevoValor);
    } catch (err) {
      alert(`No se pudo cambiar el modo almuerzo: ${err.message}`);
    } finally {
      setAlmuerzoLoading(false);
    }
  };

  // Modo almuerzo festivo: mismo mecanismo que el de todos los días, pero
  // interruptor propio para no pisarlo (p. ej. Santa Rosa de Lima).
  const [modoAlmuerzoFestivo, setModoAlmuerzoFestivo] = useState(null);
  const [almuerzoFestivoLoading, setAlmuerzoFestivoLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch(`${API_URL}/api/modo-almuerzo-festivo`)
      .then(r => r.json())
      .then(d => setModoAlmuerzoFestivo(!!d.activo))
      .catch(() => setModoAlmuerzoFestivo(null));
  }, [isSuperAdmin]);

  const handleToggleAlmuerzoFestivo = async () => {
    const nuevoValor = !modoAlmuerzoFestivo;
    setAlmuerzoFestivoLoading(true);
    try {
      await adminFetch('/api/admin/modo-almuerzo-festivo', {
        method: 'POST',
        body: JSON.stringify({ activo: nuevoValor }),
      });
      setModoAlmuerzoFestivo(nuevoValor);
    } catch (err) {
      alert(`No se pudo cambiar el modo almuerzo festivo: ${err.message}`);
    } finally {
      setAlmuerzoFestivoLoading(false);
    }
  };

  // Auditoría de conversaciones con Tefi
  const [conversaciones, setConversaciones] = useState([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState(null);
  const [convBusqueda, setConvBusqueda] = useState('');
  const [convAbierta, setConvAbierta] = useState(null);      // { email, hilos }
  const [convDetalleLoading, setConvDetalleLoading] = useState(false);

  const fetchConversaciones = async () => {
    setConvLoading(true);
    setConvError(null);
    try {
      setConversaciones(await adminFetch('/api/admin/conversaciones') || []);
    } catch (err) {
      setConvError(err.message);
    } finally {
      setConvLoading(false);
    }
  };

  const abrirConversacion = async (email) => {
    setConvDetalleLoading(true);
    setConvAbierta({ email, hilos: [] });
    try {
      setConvAbierta(await adminFetch(`/api/admin/conversaciones/${encodeURIComponent(email)}`));
    } catch (err) {
      alert(`No se pudo cargar la conversación: ${err.message}`);
      setConvAbierta(null);
    } finally {
      setConvDetalleLoading(false);
    }
  };

  const conversacionesFiltradas = useMemo(() => {
    const q = convBusqueda.trim().toLowerCase();
    if (!q) return conversaciones;
    return conversaciones.filter(c => c.email?.toLowerCase().includes(q));
  }, [conversaciones, convBusqueda]);

  // Historial de actividad
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(null);
  const [activityFiltro, setActivityFiltro] = useState('ALL');
  const [activityBusqueda, setActivityBusqueda] = useState('');

  const fetchActivity = async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const data = await adminFetch('/api/admin/activity');
      setActivity(data || []);
    } catch (err) {
      setActivityError(err.message);
    } finally {
      setActivityLoading(false);
    }
  };

  const ACCION_LABEL = {
    login: 'Inicio de sesión',
    reclamo_creado: 'Reclamo creado',
    reclamo_actualizado: 'Reclamo actualizado',
    documento_subido: 'Documento subido',
    documento_eliminado: 'Documento eliminado',
    rag_documento_indexado: 'Documento indexado en Tefi',
    mantenimiento_activado: 'Modo mantenimiento activado',
    mantenimiento_desactivado: 'Modo mantenimiento desactivado',
  };

  const formatDetalleActividad = (a) => {
    const d = a.detalle || {};
    switch (a.accion) {
      case 'reclamo_creado':
        return [d.caseId, d.categoria].filter(Boolean).join(' · ');
      case 'reclamo_actualizado': {
        const cambios = [];
        if (d.estado) cambios.push(`estado → ${d.estado}`);
        if (d.comentario !== undefined) cambios.push('nota interna editada');
        if (d.respuesta !== undefined) cambios.push('respuesta editada');
        return [d.caseId, cambios.join(', ')].filter(Boolean).join(' · ');
      }
      case 'documento_subido':
      case 'documento_eliminado':
        return d.tipo || '';
      case 'rag_documento_indexado':
        return d.archivo || '';
      default:
        return '';
    }
  };

  const filteredActivity = useMemo(() => {
    return activity.filter(a => {
      if (activityFiltro !== 'ALL' && a.actor_type !== activityFiltro) return false;
      if (activityBusqueda && !(a.actor_email || '').toLowerCase().includes(activityBusqueda.toLowerCase())) return false;
      return true;
    });
  }, [activity, activityFiltro, activityBusqueda]);

  const handleSubirDocumentoRag = async () => {
    if (!ragFile) return;
    setRagUploading(true);
    setRagMessage(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const formData = new FormData();
      formData.append('file', ragFile);
      const res = await fetch(`${API_URL}/api/rag/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setRagMessage({ type: 'success', text: `"${ragFile.name}" indexado correctamente. Tefi ya puede usarlo.` });
      setRagFile(null);
    } catch (err) {
      setRagMessage({ type: 'error', text: err.message });
    } finally {
      setRagUploading(false);
    }
  };

  // Navigation
  const [activeView, setActiveView] = useState('reclamos');
  // Las dos mallas comparten pestaña: el menú elige cuál se dibuja.
  const [mallaPlan, setMallaPlan] = useState('industrial');
  const [mallaMenuAbierto, setMallaMenuAbierto] = useState(false);
  const PLANES = { industrial: planIndustrial, sistemas: planSistemas };

  // Cerrar con una gracia corta en vez de al instante: al mover el puntero en
  // diagonal hacia una opción se puede rozar el borde del contenedor un
  // momento, y cerrar de golpe hace que el menú se escape mientras lo apuntas.
  const cierreMallaRef = useRef(null);
  const abrirMallaMenu = () => {
    clearTimeout(cierreMallaRef.current);
    setMallaMenuAbierto(true);
  };
  const cerrarMallaMenu = ({ inmediato = false } = {}) => {
    clearTimeout(cierreMallaRef.current);
    if (inmediato) return setMallaMenuAbierto(false);
    cierreMallaRef.current = setTimeout(() => setMallaMenuAbierto(false), 180);
  };

  useEffect(() => () => clearTimeout(cierreMallaRef.current), []);

  useEffect(() => {
    if (!mallaMenuAbierto) return;
    const alPulsarTecla = (e) => { if (e.key === 'Escape') cerrarMallaMenu({ inmediato: true }); };
    window.addEventListener('keydown', alPulsarTecla);
    return () => window.removeEventListener('keydown', alPulsarTecla);
  }, [mallaMenuAbierto]);

  useEffect(() => {
    if (isSuperAdmin && activeView === 'historial') fetchActivity();
    if (activeView === 'conversaciones') fetchConversaciones();
  }, [isSuperAdmin, activeView]);

  // Reclamos
  const [reclamos, setReclamos] = useState([]);
  const [reclamosLoading, setReclamosLoading] = useState(true);
  const [selectedReclamo, setSelectedReclamo] = useState(null);
  const [filterEstado, setFilterEstado] = useState('ALL');
  const [filterEspecialidadReclamo, setFilterEspecialidadReclamo] = useState('ALL');
  const [searchReclamos, setSearchReclamos] = useState('');
  const [searchCurso, setSearchCurso] = useState('');
  const [filterSeccionCurso, setFilterSeccionCurso] = useState('ALL');
  const [filterTipoCurso, setFilterTipoCurso] = useState('AMBOS');
  const [filterAtendido, setFilterAtendido] = useState('ALL');

  // Quién ha atendido cada reclamo. Sale del log de actividad, así que se
  // recarga junto con los reclamos para reflejar lo que acaba de hacer otro.
  const [atendidos, setAtendidos] = useState({});
  // Qué apodo abrió su detalle y en qué reclamo, para el panel emergente al
  // pulsar el cuadrito de la columna ATENDIDO POR.
  const [detalleAtencion, setDetalleAtencion] = useState(null);

  const eventosDe = (id) => atendidos[id] || [];

  // La columna muestra un cuadrito por persona, no uno por acción: alguien que
  // tocó el mismo caso tres veces sigue siendo un solo nombre en la fila.
  const personasDe = (id) => {
    const vistos = new Set();
    const orden = [];
    for (const e of eventosDe(id)) {
      const email = e.email.toLowerCase();
      if (!vistos.has(email)) { vistos.add(email); orden.push(email); }
    }
    return orden;
  };

  // Qué dice cada renglón del panel emergente.
  const accionLabel = (evento) => {
    if (evento.accion === 'reclamo_respondido') {
      return `Envió la respuesta por correo${evento.estado ? ` · quedó ${estadoLabel(evento.estado)}` : ''}`;
    }
    if (evento.estado) return `Cambió el estado a ${estadoLabel(evento.estado)}`;
    return 'Actualizó el reclamo';
  };

  const fetchAtendidos = async () => {
    try {
      setAtendidos(await adminFetch('/api/admin/reclamos-atendidos') || {});
    } catch {
      setAtendidos({});
    }
  };

  const [tempEstado, setTempEstado] = useState('PENDIENTE');
  const [tempComentario, setTempComentario] = useState('');
  // { enviados, id } mientras se pregunta si reenviar; null el resto del tiempo.
  const [confirmarReenvio, setConfirmarReenvio] = useState(null);
  // Marcar MATRICULADO cierra el caso, así que se pregunta antes de guardarlo.
  const [confirmarMatricular, setConfirmarMatricular] = useState(false);

  // Lo que el Tercio decide matricular y retirar de verdad. Empieza vacío a
  // propósito: lo que pidió el estudiante se carga solo si el admin lo pide.
  const [resueltos, setResueltos] = useState({ matricular: [], desmatricular: [] });
  const [guardandoResueltos, setGuardandoResueltos] = useState(false);
  // Por defecto se ve solo el resumen; el editor se abre a mano. Así al pasear
  // por reclamos no aparecen selectores en todos.
  const [editandoResueltos, setEditandoResueltos] = useState(false);
  // Aviso corto tras pulsar "empezar de cero" o "cargar lo que pidió": sin él
  // los botones parecían no hacer nada, sobre todo cuando el estudiante no
  // había pedido ningún curso y la pantalla se quedaba igual.
  const [avisoResueltos, setAvisoResueltos] = useState(null);
  // Qué curso ya añadido está cambiando de sección: "lista|codigo|seccion".
  const [editandoSeccionDe, setEditandoSeccionDe] = useState(null);
  const avisoTimer = useRef(null);

  const mostrarAviso = (texto, tono = 'ok') => {
    clearTimeout(avisoTimer.current);
    setAvisoResueltos({ texto, tono });
    avisoTimer.current = setTimeout(() => setAvisoResueltos(null), 4000);
  };

  // Si se cierra el reclamo con un aviso en marcha, el temporizador seguiría
  // vivo y escribiría sobre un modal que ya no está.
  useEffect(() => () => clearTimeout(avisoTimer.current), []);
  const [verHistorialResueltos, setVerHistorialResueltos] = useState(false);
  const [respuestaTexto, setRespuestaTexto] = useState('');
  const [updating, setUpdating] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  // Historial de correos enviados para el reclamo abierto: una fila por cada
  // vez que se manda una respuesta, no solo la última.
  const [historialRespuestas, setHistorialRespuestas] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  // Extracción de los datos académicos desde los PDF del estudiante. Ocurre aquí,
  // en el navegador del admin, y no en el servidor ni en el del alumno.
  const [extrayendo, setExtrayendo] = useState(false);
  const [datosExtraidos, setDatosExtraidos] = useState(null);

  // Estudiantes
  const [estudiantes, setEstudiantes] = useState([]);
  const [estudiantesLoading, setEstudiantesLoading] = useState(true);
  const [selectedEstudiante, setSelectedEstudiante] = useState(null);
  const [searchEstudiantes, setSearchEstudiantes] = useState('');
  const [filterEspecialidad, setFilterEspecialidad] = useState('ALL');
  const [filterRiesgo, setFilterRiesgo] = useState('ALL');

  // Estudiante modal tab
  const [modalTab, setModalTab] = useState('perfil');

  // Signed URLs de documentos (bucket privado), resueltas bajo demanda
  const [signedDocs, setSignedDocs] = useState({});

  // Error
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u); setAuthLoading(false); });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchReclamos();
    fetchEstudiantes();
    fetchAtendidos();
  }, [user]);

  useEffect(() => {
    if (selectedReclamo) {
      setTempEstado(selectedReclamo.estado || 'PENDIENTE');
      setTempComentario(selectedReclamo.comentario || '');
      setResueltos({
        matricular: selectedReclamo.cursos_resueltos?.matricular || [],
        desmatricular: selectedReclamo.cursos_resueltos?.desmatricular || [],
      });
      setVerHistorialResueltos(false);
      setEditandoResueltos(false);
      setAvisoResueltos(null);
      setEditandoSeccionDe(null);
      setRespuestaTexto('');
      setSaved(false);
      setEmailSent(false);
    }
  }, [selectedReclamo]);

  useEffect(() => {
    setModalTab('perfil');
  }, [selectedEstudiante]);

  const showError = (msg) => {
    setError(msg);
    setTimeout(() => setError(e => e === msg ? null : e), 10000);
  };

  const fetchReclamos = async () => {
    setReclamosLoading(true);
    try {
      const data = await adminFetch('/api/admin/reclamos');
      setReclamos(data ?? []);
    } catch (err) {
      showError('Error cargando reclamos: ' + err.message);
    } finally {
      setReclamosLoading(false);
    }
  };

  const fetchEstudiantes = async () => {
    setEstudiantesLoading(true);
    try {
      const data = await adminFetch('/api/admin/estudiantes');
      setEstudiantes(data ?? []);
    } catch (err) {
      showError('Error cargando estudiantes: ' + err.message);
    } finally {
      setEstudiantesLoading(false);
    }
  };

  // Pone en el reclamo la carrera que dice la ficha. El backend es quien toca
  // el JSON de datos_estudiante y guarda de paso la que había declarado el
  // estudiante, para no perderla.
  const [corrigiendoEspecialidad, setCorrigiendoEspecialidad] = useState(false);

  const corregirEspecialidad = async () => {
    if (isSoloLectura) return;
    if (!selectedReclamo || !discrepanciaEspecialidad) return;
    const id = selectedReclamo.id;
    setCorrigiendoEspecialidad(true);
    try {
      const res = await adminFetch(`/api/admin/reclamos/${encodeURIComponent(selectedReclamo.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ especialidad: discrepanciaEspecialidad.real }),
      });
      // Se usa el JSON que devuelve el backend, no uno armado aquí: así la
      // pantalla queda con exactamente lo que se guardó.
      const datos = res?.datos_estudiante;
      if (!datos) throw new Error('El servidor no devolvió los datos actualizados.');
      setReclamos(prev => prev.map(r =>
        r.id === selectedReclamo.id ? { ...r, datos_estudiante: datos } : r
      ));
      // Solo si sigue abierto ESE reclamo: si se cerró mientras la petición
      // estaba en vuelo, prev es null y el spread lo resucitaba como un objeto
      // a medias, que al pintarse dejaba la página en blanco.
      setSelectedReclamo(prev => (prev && prev.id === id ? { ...prev, datos_estudiante: datos } : prev));
      fetchAtendidos();
    } catch (err) {
      showError('No se pudo corregir la especialidad: ' + err.message);
    } finally {
      setCorrigiendoEspecialidad(false);
    }
  };

  // Cuántos estudiantes lleva ya asignados cada curso-sección, contando lo que
  // han decidido todos los admins. Arranca en cero: no son las vacantes del
  // catálogo, sino lo que el Tercio va repartiendo, para que al elegir se vea
  // cuánta gente hay puesta ya en esa sección.
  const conteoPorSeccion = useMemo(() => {
    const m = {};
    const sumar = (c, campo) => {
      const k = claveCurso(c.codigo, c.seccion);
      (m[k] ||= { asignados: 0, liberados: 0 })[campo]++;
    };
    for (const r of reclamos) {
      for (const c of r.cursos_resueltos?.matricular || []) sumar(c, 'asignados');
      for (const c of r.cursos_resueltos?.desmatricular || []) sumar(c, 'liberados');
    }
    return m;
  }, [reclamos]);

  const agregarResuelto = (lista, codigo, seccion) => {
    const curso = CATALOGO_CURSOS.find(c => c.codigo === codigo);
    if (!curso || !seccion) return;
    setResueltos(prev => {
      // No se repite el mismo curso-sección dentro de la misma lista.
      if (prev[lista].some(c => c.codigo === codigo && c.seccion === seccion)) return prev;
      return { ...prev, [lista]: [...prev[lista], { codigo, seccion, nombre: curso.nombre }] };
    });
  };

  const cambiarSeccion = (lista, codigo, seccionVieja, seccionNueva) => {
    if (!seccionNueva || seccionNueva === seccionVieja) { setEditandoSeccionDe(null); return; }
    setResueltos(prev => {
      // Si esa sección ya está en la lista, cambiarla dejaría el curso repetido.
      if (prev[lista].some(c => c.codigo === codigo && c.seccion === seccionNueva)) {
        mostrarAviso(`${codigo} sección ${seccionNueva} ya estaba en la lista.`, 'warn');
        return prev;
      }
      return {
        ...prev,
        [lista]: prev[lista].map(c =>
          c.codigo === codigo && c.seccion === seccionVieja ? { ...c, seccion: seccionNueva } : c),
      };
    });
    setEditandoSeccionDe(null);
  };

  const quitarResuelto = (lista, codigo, seccion) => {
    setResueltos(prev => ({
      ...prev,
      [lista]: prev[lista].filter(c => !(c.codigo === codigo && c.seccion === seccion)),
    }));
  };

  // Trae lo que pidió el estudiante como punto de partida, para corregir solo
  // las secciones en vez de escribirlo todo.
  const cargarLoQuePidio = () => {
    const de = selectedReclamo?.datos_estudiante || {};
    const limpiar = (l) => (l || [])
      .filter(c => c?.codigo && c?.seccion)
      .map(c => ({ codigo: String(c.codigo).toUpperCase(), seccion: String(c.seccion).toUpperCase(), nombre: c.nombre || '' }));
    const matricular = limpiar(de.cursosMatricular);
    const desmatricular = limpiar(de.cursosRetirar);
    setResueltos({ matricular, desmatricular });

    const total = matricular.length + desmatricular.length;
    if (total === 0) {
      mostrarAviso('Este estudiante no pidió ningún curso: tendrás que elegirlos tú.', 'warn');
      return;
    }
    const partes = [];
    if (matricular.length) partes.push(`${matricular.length} a matricular`);
    if (desmatricular.length) partes.push(`${desmatricular.length} a desmatricular`);
    mostrarAviso(`Cargado lo que pidió: ${partes.join(' y ')}. Ajusta las secciones si hace falta.`);
  };

  // Se mira lo GUARDADO, no tempEstado: mientras no se envíe, marcar
  // MATRICULADO es reversible y no debe bloquear nada todavía.
  const reclamoCerrado = selectedReclamo?.estado === ESTADO_FINAL;

  const confirmarYMatricular = async () => {
    setConfirmarMatricular(false);
    await cambiarEstado(ESTADO_FINAL);
    // El mensaje se deja escrito para que solo haya que enviarlo, pero no se
    // pisa lo ya redactado.
    setRespuestaTexto(prev => (prev.trim() ? prev : MENSAJE_MATRICULADO));
  };

  const marcarMatriculado = () => {
    setTempEstado(ESTADO_FINAL);
    // Se rellena el mensaje, pero no se pisa lo ya escrito: perder un texto
    // redactado a mano por pulsar un botón sería peor que no autocompletarlo.
    setRespuestaTexto(prev => (prev.trim() ? prev : MENSAJE_MATRICULADO));
  };

  const cancelarEdicionResueltos = () => {
    setResueltos({
      matricular: selectedReclamo?.cursos_resueltos?.matricular || [],
      desmatricular: selectedReclamo?.cursos_resueltos?.desmatricular || [],
    });
    setEditandoResueltos(false);
  };

  const guardarResueltos = async () => {
    if (isSoloLectura) return;
    if (!selectedReclamo) return;
    const id = selectedReclamo.id;
    setGuardandoResueltos(true);
    try {
      const res = await adminFetch(`/api/admin/reclamos/${encodeURIComponent(selectedReclamo.id)}/cursos-resueltos`, {
        method: 'PUT',
        body: JSON.stringify({ matricular: resueltos.matricular, desmatricular: resueltos.desmatricular }),
      });
      const guardado = res?.cursos_resueltos;
      if (!guardado) throw new Error('El servidor no devolvió la decisión guardada.');
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? { ...r, cursos_resueltos: guardado } : r));
      setSelectedReclamo(prev => (prev && prev.id === id ? { ...prev, cursos_resueltos: guardado } : prev));
      setEditandoResueltos(false);
      fetchAtendidos();
    } catch (err) {
      showError('No se pudieron guardar los cursos: ' + err.message);
    } finally {
      setGuardandoResueltos(false);
    }
  };

  // Deja el panel como recién abierto: vista de Reclamos y todos los filtros y
  // buscadores a cero. Se agrupa aquí para que añadir un filtro nuevo tenga un
  // único sitio que tocar y no se quede olvidado.
  const volverAlInicio = () => {
    setActiveView('reclamos');
    setFilterEstado('ALL');
    setFilterEspecialidadReclamo('ALL');
    setFilterAtendido('ALL');
    setSearchReclamos('');
    setSearchCurso('');
    setFilterSeccionCurso('ALL');
    setFilterTipoCurso('AMBOS');
    setSearchEstudiantes('');
    setFilterEspecialidad('ALL');
    setFilterRiesgo('ALL');
    setConvBusqueda('');
    setConvAbierta(null);
  };

  // Guarda en cuanto se toca, sin botón de por medio. Nada de esto llega al
  // estudiante: el estado que él ve sale de los correos que se le enviaron, y
  // la nota interna no sale nunca.
  const guardarCampos = async (patch, etiqueta) => {
    if (isSoloLectura) return false;
    if (!selectedReclamo) return false;
    const id = selectedReclamo.id;
    setUpdating(true);
    try {
      await adminFetch(`/api/admin/reclamos/${encodeURIComponent(selectedReclamo.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setReclamos(prev => prev.map(r => r.id === selectedReclamo.id ? { ...r, ...patch } : r));
      setSelectedReclamo(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
      fetchAtendidos();
      return true;
    } catch (err) {
      showError(`No se pudo guardar ${etiqueta}: ` + err.message);
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const cambiarEstado = async (nuevo) => {
    if (!selectedReclamo || nuevo === selectedReclamo.estado) { setTempEstado(nuevo); return; }
    const anterior = selectedReclamo.estado;
    setTempEstado(nuevo);
    // Si el servidor lo rechaza —por ejemplo un reclamo ya matriculado— se
    // deshace, para que el panel no muestre un estado que no se guardó.
    const ok = await guardarCampos({ estado: nuevo }, 'el estado');
    if (!ok) setTempEstado(anterior || 'PENDIENTE');
  };

  // La nota se guarda al salir del campo: escribir no debe disparar una
  // petición por cada tecla.
  const guardarNotaInterna = () => {
    const nueva = tempComentario || null;
    if (nueva === (selectedReclamo?.comentario || null)) return;
    guardarCampos({ comentario: nueva }, 'la nota interna');
  };

  useEffect(() => {
    if (!selectedReclamo?.id) { setHistorialRespuestas([]); return; }
    setHistorialLoading(true);
    adminFetch(`/api/admin/reclamos/${encodeURIComponent(selectedReclamo.id)}/respuestas`)
      .then(data => setHistorialRespuestas(data || []))
      .catch(() => setHistorialRespuestas([]))
      .finally(() => setHistorialLoading(false));
  }, [selectedReclamo?.id]);

  // Si ya se le escribió antes por este reclamo, se pide confirmación. El número
  // sale del historial de envíos; los reclamos anteriores a esa tabla solo
  // tienen el campo `respuesta`, así que ahí se avisa igual pero sin número.
  //
  // Solo abre el modal y sale: no se toca nada más, así que cancelar deja el
  // mensaje escrito intacto en el textarea.
  const handleEnviarRespuesta = () => {
    if (!selectedReclamo || !respuestaTexto.trim()) return;
    const enviados = historialRespuestas.length;
    const esFinal = tempEstado === ESTADO_FINAL;
    if (esFinal || enviados > 0 || selectedReclamo.respuesta) {
      setConfirmarReenvio({ enviados, id: selectedReclamo.id, esFinal });
      return;
    }
    enviarRespuesta();
  };

  const enviarRespuesta = async () => {
    if (isSoloLectura) return;
    if (!selectedReclamo || !respuestaTexto.trim()) return;
    const id = selectedReclamo.id;
    setConfirmarReenvio(null);
    setSending(true);
    try {
      // El estado es el que el admin haya marcado, sin más. Antes, si estaba
      // en PENDIENTE o EN REVISIÓN, enviar la respuesta lo forzaba a ACEPTADO:
      // el correo salía anunciando un desenlace que nadie había decidido.
      const estadoFinal = tempEstado;
      const patch = { estado: estadoFinal, respuesta: respuestaTexto, comentario: tempComentario || null };
      await adminFetch(`/api/admin/reclamos/${encodeURIComponent(selectedReclamo.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setReclamos(prev => prev.map(r =>
        r.id === selectedReclamo.id ? { ...r, ...patch } : r
      ));
      setSelectedReclamo(prev => (prev && prev.id === id ? { ...prev, ...patch } : prev));
      setTempEstado(estadoFinal);
      fetchAtendidos();

      // 2. Enviar el correo al estudiante.
      //
      // Antes esto llamaba a fetch('/api/send-email') con ruta relativa, así que
      // la petición iba a Firebase Hosting en vez de al backend: Hosting devolvía
      // el index.html del panel y el JSON.parse fallaba con "Unexpected token '<'".
      // El endpoint tampoco existía. Ahora va por adminFetch, que apunta a API_URL
      // y adjunta el token de admin.
      //
      // Solo se manda la respuesta escrita: el destinatario y los datos del caso
      // los toma el backend de la base, para que esta ruta no sirva como enviador
      // de correo a direcciones arbitrarias.
      try {
        const resp = await adminFetch(`/api/admin/reclamos/${encodeURIComponent(selectedReclamo.id)}/responder`, {
          method: 'POST',
          body: JSON.stringify({ respuesta: respuestaTexto }),
        });
        setEmailSent(true);
        if (resp?.entrada) setHistorialRespuestas(prev => [...prev, resp.entrada]);
      } catch (errCorreo) {
        // La respuesta ya quedó guardada en el paso 1: se distingue a propósito
        // de un fallo total, para que el admin no la reescriba pensando que se
        // perdió y termine mandándola dos veces.
        showError('Respuesta guardada, pero no se pudo enviar el correo: ' + errCorreo.message);
      }

      setRespuestaTexto('');
    } catch (err) {
      showError('Error al enviar respuesta: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!selectedReclamo && !selectedEstudiante) return;
    const alPulsar = (e) => {
      if (e.key !== 'Escape') return;
      // Si el foco está en un campo, Esc debería salir del campo, no cerrar
      // todo: quien está escribiendo una respuesta no quiere perderla.
      const t = e.target?.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') {
        e.target.blur();
        return;
      }
      setSelectedReclamo(null);
      setSelectedEstudiante(null);
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [selectedReclamo, selectedEstudiante]);

  // Refresca lo que se está viendo, no siempre lo mismo. Antes solo recargaba
  // reclamos y estudiantes, y por eso Conversaciones e Historial necesitaban su
  // propio botón: pulsar REFRESCAR ahí no hacía nada visible.
  // Al quitar los botones de cada vista se perdía el aviso de "cargando", así
  // que lo asume el botón global, mirando solo lo que esa vista está pidiendo.
  const refrescandoVistaActual =
    activeView === 'conversaciones' ? (convLoading || convDetalleLoading)
    : activeView === 'historial' ? activityLoading
    : (reclamosLoading || estudiantesLoading);

  // Exporta lo que se está viendo, no todos los reclamos: parte de
  // filteredReclamos, así que respeta cualquier combinación de filtros que
  // haya puesta —estado, carrera, búsqueda, curso, sección— sin tener que
  // volver a aplicarlos aquí y arriesgar que las dos versiones diverjan.
  // Cada celda del Excel pasa por aquí, y hace dos cosas:
  //
  // 1. Aplana los saltos de línea. Los de un textarea (descripción, respuesta,
  //    nota) viajan tal cual al CSV y Excel estira la fila entera para
  //    mostrarlos, descuadrando toda la tabla.
  // 2. Nunca deja una celda vacía. Excel solo desborda el texto hacia la
  //    derecha cuando la celda vecina está VACÍA: por eso Estudiante o
  //    Especialidad se recortan solas en el borde —su vecina siempre trae
  //    dato— mientras que Descripción se salía por encima de media hoja,
  //    porque "Respuesta enviada" casi siempre está vacía. Un espacio ocupa la
  //    celda sin ensuciar el contenido y hace que todas se recorten igual, sin
  //    acortar el texto ni perder nada.
  //
  // Se convierte a texto sin usar `|| ''`: un turno 0 es un dato válido y con
  // el atajo se perdería.
  const celda = (valor) => {
    const t = valor === null || valor === undefined ? '' : String(valor);
    const limpio = t.replace(/\r?\n+/g, ' ').trim();
    return limpio === '' ? ' ' : limpio;
  };

  const exportarReclamos = () => {
    if (filteredReclamos.length === 0) return;

    const filas = filteredReclamos.map(r => {
      const de = r.datos_estudiante || {};
      const cursos = (lista) => (de[lista] || [])
        .map(c => `${c.codigo} sec.${c.seccion} (${c.nombre})`)
        .join(' | ');
      return {
        'ID': celda(r.id),
        'Estudiante': celda(r.nombre || estudianteByEmail[r.email]?.datos_parseados?.datosPersonales?.nombre),
        'Correo': celda(r.email),
        'Código': celda(r.codigo_estudiante || estudianteByEmail[r.email]?.codigo_estudiante),
        'Especialidad': celda(especialidadNombre(r)),
        'Teléfono': celda(de.telefono),
        'Turno': celda(de.turno),
        '¿Se matriculó?': celda(de.matriculado === true ? 'Sí' : de.matriculado === false ? 'No' : ''),
        'Categoría': celda(r.categoria),
        'Estado': celda(estadoLabel(r.estado)),
        'Fecha': celda(fmtDate(r.created_at)),
        'Cursos a retirar': celda(cursos('cursosRetirar')),
        'Cursos a matricular': celda(cursos('cursosMatricular')),
        'Descripción': celda(r.descripcion),
        'Respuesta enviada': celda(r.respuesta),
        'Nota interna': celda(r.comentario),
        // Sin esta columna de cierre, "Nota interna" desbordaría siempre: es la
        // última y a su derecha solo hay hoja vacía.
        '': ' ',
      };
    });

    // Punto y coma y BOM: Excel en español espera ese separador, y sin el BOM
    // se come las tildes. Con coma, todo acabaría en una sola columna.
    const csv = Papa.unparse(filas, { delimiter: ';' });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });

    const hoy = new Date().toISOString().slice(0, 10);
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(blob);
    enlace.download = `reclamos-${hoy}-${filas.length}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(enlace.href);
  };

  const refrescarVistaActual = () => {
    if (activeView === 'conversaciones') {
      // Si hay un hilo abierto se recarga ese, en vez de devolver al listado y
      // obligar a buscar otra vez al estudiante.
      if (convAbierta?.email) abrirConversacion(convAbierta.email);
      else fetchConversaciones();
      return;
    }
    if (activeView === 'historial') {
      fetchActivity();
      return;
    }
    fetchReclamos();
    fetchEstudiantes();
    fetchAtendidos();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
    } catch {
      setLoginError('Credenciales incorrectas o error de conexión.');
    }
  };

  const handleLogout = () => signOut(auth).catch(() => {});

  // Filtered & computed data

  // Lookup rápido para cruzar reclamos con datos de estudiante cuando el propio
  // reclamo no trae el dato (nombre/código/especialidad vienen null).
  const estudianteByEmail = useMemo(() => {
    const map = {};
    estudiantes.forEach(e => { if (e.email) map[e.email] = e; });
    return map;
  }, [estudiantes]);

  // El cuadro oficial viene en mayúsculas y sin tildes; nadie escribe así.
  const normalizaTexto = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  // Los cursos que pide un reclamo, ya marcados con lo que se pide hacer.
  const cursosDelReclamo = (r, tipo) => {
    const de = r.datos_estudiante || {};
    const retirar = (de.cursosRetirar || []).map(c => ({ ...c, tipo: 'RETIRAR' }));
    const matricular = (de.cursosMatricular || []).map(c => ({ ...c, tipo: 'MATRICULAR' }));
    if (tipo === 'RETIRAR') return retirar;
    if (tipo === 'MATRICULAR') return matricular;
    return [...retirar, ...matricular];
  };

  const cursoCoincide = (c, q, seccion) => {
    if (q && !(normalizaTexto(c.codigo).includes(q) || normalizaTexto(c.nombre).includes(q))) return false;
    if (seccion !== 'ALL' && normalizaTexto(c.seccion) !== seccion) return false;
    return true;
  };

  // Solo los cursos que alguien pidió de verdad: ofrecer los 139 del catálogo
  // llevaría a filtrar por cursos que no aparecen en ningún reclamo.
  const cursosEnReclamos = useMemo(() => {
    const porCodigo = new Map();
    reclamos.forEach(r => cursosDelReclamo(r, filterTipoCurso).forEach(c => {
      if (!porCodigo.has(c.codigo)) porCodigo.set(c.codigo, { codigo: c.codigo, nombre: c.nombre, pedidos: 0 });
      porCodigo.get(c.codigo).pedidos++;
    }));
    return [...porCodigo.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [reclamos, filterTipoCurso]);

  // Las secciones que existen para lo que se está buscando ahora mismo.
  const seccionesEnReclamos = useMemo(() => {
    const q = normalizaTexto(searchCurso.trim());
    const secciones = new Set();
    reclamos.forEach(r => cursosDelReclamo(r, filterTipoCurso).forEach(c => {
      if (cursoCoincide(c, q, 'ALL')) secciones.add(c.seccion);
    }));
    return [...secciones].sort();
  }, [reclamos, searchCurso, filterTipoCurso]);

  // Si la sección elegida deja de existir al cambiar de curso, el filtro se
  // quedaría pidiendo algo imposible y la tabla saldría vacía sin explicación.
  useEffect(() => {
    if (filterSeccionCurso !== 'ALL' && !seccionesEnReclamos.includes(filterSeccionCurso)) {
      setFilterSeccionCurso('ALL');
    }
  }, [seccionesEnReclamos, filterSeccionCurso]);

  const filtroCursoActivo = searchCurso.trim() !== '' || filterSeccionCurso !== 'ALL';

  // La especialidad de un reclamo sale de tres sitios, por orden: lo que el
  // estudiante declaró al abrirlo, lo que trae el parseo de sus documentos, y
  // lo guardado en su ficha. Se extrae aquí para que el filtro de arriba y la
  // columna de la tabla no puedan acabar mostrando cosas distintas.
  const especialidadDeReclamo = (r) =>
    r.datos_estudiante?.especialidad
    || r.datos_estudiante?.datosAvanzados?.datosPersonales?.especialidad
    || estudianteByEmail[r.email]?.datos_parseados?.datosPersonales?.especialidad
    || null;

  // Se muestra el nombre normalizado del catálogo, no el texto crudo: en los PDF
  // viene en mayúsculas, con o sin tilde y a veces abreviado.
  const especialidadNombre = (r) => {
    const cod = especialidadCodigo(especialidadDeReclamo(r));
    return ESPECIALIDADES_FIIS.find(e => e.codigo === cod)?.nombre || null;
  };

  const filteredReclamos = useMemo(() => {
    const q = searchReclamos.toLowerCase();
    return reclamos.filter(r => {
      if (filterEstado !== 'ALL' && r.estado !== filterEstado) return false;
      if (filterEspecialidadReclamo !== 'ALL') {
        if (especialidadCodigo(especialidadDeReclamo(r)) !== filterEspecialidadReclamo) return false;
      }
      if (q && !(
        r.nombre?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.codigo_estudiante?.toLowerCase().includes(q) ||
        r.id?.toLowerCase().includes(q) ||
        r.descripcion?.toLowerCase().includes(q)
      )) return false;
      if (filterAtendido !== 'ALL') {
        const quienes = (atendidos[r.id] || []).map(a => a.email.toLowerCase());
        // SIN_ATENDER no es un correo más: es lo contrario de "alguien lo tocó".
        // Sin esta opción no habría forma de ver lo que está sin empezar, que es
        // justo lo que hay que repartir.
        if (filterAtendido === 'SIN_ATENDER') {
          if (quienes.length > 0) return false;
        } else if (!quienes.includes(filterAtendido)) {
          return false;
        }
      }
      if (filtroCursoActivo) {
        // Curso y sección tienen que darse en la MISMA entrada. Si no, un
        // reclamo que pide BEF01 sec. W y FB401 sec. X saldría al buscar
        // "BEF01" con la sección X, que es justo lo que no pidió.
        const qc = normalizaTexto(searchCurso.trim());
        if (!cursosDelReclamo(r, filterTipoCurso).some(c => cursoCoincide(c, qc, filterSeccionCurso))) return false;
      }
      return true;
    });
  }, [reclamos, searchReclamos, filterEstado, filterEspecialidadReclamo, estudianteByEmail,
      searchCurso, filterSeccionCurso, filterTipoCurso, filtroCursoActivo,
      filterAtendido, atendidos]);

  // El nombre que el estudiante escribió al abrir su reclamo. Hace falta porque
  // la gran mayoría de fichas siguen sin parsear, y sin esto el buscador no ve
  // el nombre de nadie que no esté parseado: buscar "Arturo" no encontraba a
  // Diego Arturo Morante, porque su correo es diego.morante.v y su ficha no se
  // ha procesado. Se queda con el primero que aparezca por correo.
  //
  // Va antes de filteredEstudiantes a propósito: lo usa en su array de
  // dependencias, que se evalúa al renderizar. Declararlo después lo dejaba en
  // la zona muerta temporal y la página entera reventaba en blanco.
  const nombreDeclaradoPorEmail = useMemo(() => {
    const m = {};
    reclamos.forEach(r => { if (r.email && r.nombre && !m[r.email]) m[r.email] = r.nombre; });
    return m;
  }, [reclamos]);

  const filteredEstudiantes = useMemo(() => {
    const q = searchEstudiantes.toLowerCase();
    return estudiantes.filter(e => {
      const dp = e.datos_parseados?.datosPersonales ?? {};
      if (filterEspecialidad !== 'ALL' && especialidadCodigo(dp.especialidad) !== filterEspecialidad) return false;
      const enRiesgo = e.datos_parseados?.resumen?.enRiesgo;
      if (filterRiesgo === 'SI' && !enRiesgo) return false;
      if (filterRiesgo === 'NO' && enRiesgo) return false;
      if (q && !(
        e.email?.toLowerCase().includes(q) ||
        e.codigo_estudiante?.toLowerCase().includes(q) ||
        dp.nombre?.toLowerCase().includes(q) ||
        nombreDeclaradoPorEmail[e.email]?.toLowerCase().includes(q) ||
        dp.especialidad?.toLowerCase().includes(q)
      )) return false;
      return true;
    });
  }, [estudiantes, searchEstudiantes, filterEspecialidad, filterRiesgo, nombreDeclaradoPorEmail]);

  const reclamosStats = useMemo(() => ({
    total: reclamos.length,
    pendiente: reclamos.filter(r => r.estado === 'PENDIENTE').length,
    enRevision: reclamos.filter(r => r.estado === 'EN_REVISION').length,
    resuelto: reclamos.filter(r => r.estado === 'ACEPTADO').length,
    parcial: reclamos.filter(r => r.estado === 'ACEPTADO_PARCIALMENTE').length,
    matriculado: reclamos.filter(r => r.estado === 'MATRICULADO').length,
    rechazado: reclamos.filter(r => r.estado === 'RECHAZADO').length,
  }), [reclamos]);

  const estudiantesStats = useMemo(() => {
    const emailsConReclamos = new Set(reclamos.map(r => r.email));
    return {
      total: estudiantes.length,
      enRiesgo: estudiantes.filter(e => e.datos_parseados?.resumen?.enRiesgo).length,
      conReclamos: estudiantes.filter(e => emailsConReclamos.has(e.email)).length,
    };
  }, [estudiantes, reclamos]);

  // Modal data shortcuts
  // datos_estudiante trae dos formas: campos planos en el nivel raíz (codigo,
  // especialidad, ciclo...) y la estructura anidada completa bajo datosAvanzados
  // (datosPersonales, resumen, boletaMatricula...). Los detalles del modal usan
  // la anidada porque incluye datos que los planos no tienen (cursos, ciclosUsados).
  // Los reclamos creados desde que el parseo salió de la app del estudiante no
  // traen datos académicos: los rellena el admin con "Extraer datos", y hasta
  // entonces esta vista se muestra vacía a propósito.
  const avanzadosReclamo = datosExtraidos?.datosAvanzados
    ?? selectedReclamo?.datos_estudiante?.datosAvanzados;
  const reclamoDP = avanzadosReclamo?.datosPersonales ?? {};
  const reclamoRS = avanzadosReclamo?.resumen ?? {};
  const faltanDatosAcademicos = !avanzadosReclamo?.datosPersonales;
  // La especialidad la declara el estudiante al iniciar el reclamo. Los reclamos
  // anteriores al cambio no la traen y siguen sacándola de la ficha parseada.
  const especialidadDeclarada = selectedReclamo?.datos_estudiante?.especialidad
    || reclamoDP.especialidad;

  // El estudiante elige su carrera de una lista al abrir el reclamo y a veces
  // marca la que no es. La ficha que sube manda, así que cuando las dos no
  // coinciden se avisa aquí. Solo se avisa: corregirlo es un clic aparte,
  // porque el parseo también puede fallar y quien mira el caso es quien sabe.
  //
  // Se compara por código y no por texto: en la ficha viene en mayúsculas y
  // sin tildes, así que "INGENIERIA DE SISTEMAS" y "Ingeniería de Sistemas"
  // son el mismo dato. Se mira el campo declarado crudo, no
  // `especialidadDeclarada`, que cae al parseo cuando el reclamo es viejo y no
  // trae carrera declarada —ahí no hay nada que corregir—.
  const discrepanciaEspecialidad = (() => {
    const textoFicha = reclamoDP.especialidad;
    // "Ingeniería Industrial y de Sistemas" es el nombre de la FACULTAD, no de
    // una carrera. El parser ya no lo guarda, pero los reclamos parseados antes
    // de ese arreglo sí lo traen, y como empieza por "Industrial" se leería
    // como esa carrera y se propondría un cambio falso.
    if (/INDUSTRIAL\s+Y\s+DE\s+SISTEMAS/i.test(textoFicha || '')) return null;

    const codDeclarada = especialidadCodigo(selectedReclamo?.datos_estudiante?.especialidad);
    const codFicha = especialidadCodigo(textoFicha);
    if (!codDeclarada || !codFicha || codDeclarada === codFicha) return null;
    return {
      declarada: ESPECIALIDADES_FIIS.find(e => e.codigo === codDeclarada)?.nombre,
      real: ESPECIALIDADES_FIIS.find(e => e.codigo === codFicha)?.nombre,
    };
  })();
  const reclamoDocs = selectedReclamo?.documentos ?? {};
  // undefined en reclamos enviados antes de que se empezara a registrar esta respuesta.
  const reclamoMatriculado = selectedReclamo?.datos_estudiante?.matriculado;

  const estudianteDP = selectedEstudiante?.datos_parseados?.datosPersonales ?? {};
  const estudianteRS = selectedEstudiante?.datos_parseados?.resumen ?? {};
  const estudianteBoleta = selectedEstudiante?.datos_parseados?.boletaMatricula ?? {};
  const estudianteFicha = selectedEstudiante?.datos_parseados?.fichaAcademica ?? {};

  // Descarga los PDF del estudiante con signed URLs y les extrae los datos aquí
  // mismo. El backend solo guarda el resultado: no parsea nada.
  const extraerDatosEstudiante = async (email) => {
    if (isSoloLectura) return;
    setExtrayendo(true);
    setDatosExtraidos(null);
    try {
      const doc = await adminFetch(`/api/admin/estudiantes`);
      const est = (doc || []).find(e => e.email === email);
      if (!est) throw new Error('El estudiante no tiene documentos guardados.');
      if (!est.record_matricula_url || !est.record_notas_url) {
        throw new Error('Faltan la Ficha Académica o el Avance Curricular.');
      }

      // La boleta es opcional: quien no llegó a matricularse no la tiene.
      const refs = [est.record_matricula_url, est.boleta_url, est.record_notas_url];
      const [ficha, boleta, avance] = await Promise.all(refs.map(async (ref) => {
        if (!ref) return null;
        const { signedUrl } = await adminFetch(`/api/admin/docs/signed-url?url=${encodeURIComponent(ref)}`);
        const resp = await fetch(signedUrl);
        if (!resp.ok) throw new Error('No se pudo descargar un documento.');
        return resp.arrayBuffer();
      }));

      const [textoFicha, textoBoleta, textoAvance] = await Promise.all([
        extractPdfText(ficha),
        boleta ? extractPdfText(boleta) : Promise.resolve(''),
        extractPdfText(avance),
      ]);

      const { fullJsonData, ...datosPlanos } = parsearFichasEstudiante(textoFicha, textoBoleta, textoAvance);

      await adminFetch(`/api/admin/estudiantes/${encodeURIComponent(email)}/datos`, {
        method: 'PUT',
        body: JSON.stringify({
          datosParseados: fullJsonData,
          datosPlanos,
          codigo: datosPlanos.codigo || null,
        }),
      });

      setDatosExtraidos({ ...datosPlanos, datosAvanzados: fullJsonData });
      // fetchEstudiantes refresca la tabla, pero selectedEstudiante es una copia
      // aparte: sin esto el modal seguiría diciendo "sin parsear" tras extraer.
      // Se replica lo que guarda el backend, que conserva _contacto (teléfono y
      // turno los escribe el estudiante y no salen de los PDF).
      setSelectedEstudiante(prev => (prev && prev.email === email
        ? {
            ...prev,
            codigo_estudiante: datosPlanos.codigo || prev.codigo_estudiante,
            datos_parseados: { ...fullJsonData, _contacto: prev.datos_parseados?._contacto || {} },
          }
        : prev));
      fetchEstudiantes();
    } catch (err) {
      showError('No se pudieron extraer los datos: ' + err.message);
    } finally {
      setExtrayendo(false);
    }
  };

  // El bucket de documentos es privado: cada referencia guardada (rawUrl) hay
  // que canjearla por una signed URL de corta duración vía el backend, que
  // valida el token de admin antes de firmarla. signedDocs[rawUrl]: undefined
  // = no pedida, null = cargando, false = error, string = URL lista.
  const resolveSignedDoc = async (rawUrl, force = false) => {
    if (!rawUrl) return;
    if (!force && signedDocs[rawUrl] !== undefined) return;
    setSignedDocs(prev => ({ ...prev, [rawUrl]: null }));
    try {
      const data = await adminFetch(`/api/admin/docs/signed-url?url=${encodeURIComponent(rawUrl)}`);
      setSignedDocs(prev => ({ ...prev, [rawUrl]: data.signedUrl }));
    } catch {
      setSignedDocs(prev => ({ ...prev, [rawUrl]: false }));
    }
  };

  useEffect(() => {
    setDatosExtraidos(null);
    if (!selectedReclamo) return;
    const email = selectedReclamo.email;
    [
      reclamoDocs.ficha || storageUrl(email, 'ficha'),
      reclamoDocs.boleta || storageUrl(email, 'boleta'),
      reclamoDocs.avance || storageUrl(email, 'avance'),
      // Pruebas que adjuntó el estudiante. Los reclamos anteriores a esta
      // función no traen la clave, de ahí el arreglo vacío por defecto.
      ...(reclamoDocs.evidencias || []).map(ev => ev.ref),
    ].forEach(url => resolveSignedDoc(url, true));
  }, [selectedReclamo]);

  useEffect(() => {
    if (!selectedEstudiante) return;
    const email = selectedEstudiante.email;
    [
      selectedEstudiante.record_matricula_url || storageUrl(email, 'ficha'),
      selectedEstudiante.boleta_url || storageUrl(email, 'boleta'),
      selectedEstudiante.record_notas_url || storageUrl(email, 'avance'),
    ].forEach(url => resolveSignedDoc(url, true));
  }, [selectedEstudiante]);
  const reclamosPorEmail = useMemo(() => {
    const m = {};
    reclamos.forEach(r => { if (r.email) m[r.email] = (m[r.email] || 0) + 1; });
    return m;
  }, [reclamos]);

  const estudianteReclamos = selectedEstudiante
    ? reclamos.filter(r => r.email === selectedEstudiante.email)
    : [];

  const mallaData = useMemo(() => {
    const avance = selectedEstudiante?.datos_parseados?.avanceCurricular ?? {};
    const rawAvance = avance.cursos ?? [];
    const porCiclo = avance.porCiclo ?? {};
    const boletaCursos = selectedEstudiante?.datos_parseados?.boletaMatricula?.cursos ?? [];

    const cursosAprobados = new Set();
    rawAvance
      .filter(c => (c.nota != null && c.nota >= 10) || c.estado === 'CONVAL')
      .forEach(c => {
        cursosAprobados.add(normCode(c.codigo));
        // Si tiene equivalencia (CONVAL por curso externo), también marcar el código destino
        if (c.observacion) {
          const m = c.observacion.match(/EQUIV\.\s*CON\s+([A-Z0-9]+)/i);
          if (m) cursosAprobados.add(normCode(m[1]));
        }
      });
    const cursosInscritos = new Set(boletaCursos.map(c => normCode(c.codigo)));
    const aptoCodes = new Set(
      PLAN_ESTUDIOS_SOFTWARE
        .filter(course => {
          const cn = normCode(course.codigo);
          if (cursosAprobados.has(cn) || cursosInscritos.has(cn)) return false;
          return course.preRequisitos.every(p => cursosAprobados.has(normCode(p)));
        })
        .map(c => normCode(c.codigo))
    );
    return { cursosAprobados, cursosInscritos, aptoCodes, rawAvance, porCiclo };
  }, [selectedEstudiante]);

  // ===== SCREENS =====

  if (authLoading) return (
    <div className="flex-center full-page">
      <div className="loader-container">
        <div className="loader-bar" />
        <p className="loading-text">VERIFICANDO SESIÓN...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="flex-center full-page login-page">
      <button
        className="theme-toggle-btn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        style={{ position: 'fixed', top: 24, right: 24 }}
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="login-card glass-card animate-in">
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label>CORREO ELECTRÓNICO</label>
            <input type="email" placeholder="usuario@dominio.com"
              value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
          </div>
          <div className="input-group">
            <label>CONTRASEÑA</label>
            <input type="password" placeholder="••••••••"
              value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
          </div>
          {loginError && <p className="error-message">{loginError}</p>}
          <button type="submit" className="btn btn-primary full-width">INICIAR SESIÓN</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="app-container">

      {/* ── HEADER ── */}
      <header className="header animate-in">
        <div className="header-content">
          {/* Vuelve a Reclamos y limpia todos los filtros: el panel queda como
              recién abierto. No cierra sesión ni recarga. */}
          <div
            className="branding"
            role="button"
            tabIndex={0}
            title="Volver al inicio"
            style={{ cursor: 'pointer' }}
            onClick={volverAlInicio}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); volverAlInicio(); } }}
          >
            <img src={icono} alt="Logo" className="brand-logo" />
            <div>
              <h1 className="title">Panel Admin</h1>
              <p className="subtitle">TEFIIS - UNI</p>
            </div>
          </div>
          <div className="header-actions">
            {/* Sin este aviso, la cuenta de solo lectura vería un panel al que
                le faltan botones sin saber por qué. */}
            {isSoloLectura && (
              <span
                title="Puedes consultar todo el panel, pero no modificar nada."
                style={{
                  fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                  color: 'var(--warn-color)', border: '1px solid var(--warn-color)',
                  borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap',
                }}
              >
                SOLO LECTURA
              </span>
            )}
            <button className="btn btn-primary" onClick={refrescarVistaActual} disabled={refrescandoVistaActual}>
              {refrescandoVistaActual ? 'CARGANDO...' : 'REFRESCAR'}
            </button>
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button className="btn btn-secondary btn-small" onClick={handleLogout}>SALIR</button>
          </div>
        </div>
          <nav className="view-tabs view-tabs--fila-propia">
            <button
              className={`tab-btn ${activeView === 'reclamos' ? 'active' : ''}`}
              onClick={() => setActiveView('reclamos')}
            >
              RECLAMOS
              {reclamosStats.pendiente > 0 && (
                <span className="tab-badge">{reclamosStats.pendiente}</span>
              )}
            </button>
            <button
              className={`tab-btn ${activeView === 'estudiantes' ? 'active' : ''}`}
              onClick={() => setActiveView('estudiantes')}
            >
              ESTUDIANTES
            </button>
            <div
              className="tab-menu"
              onMouseEnter={abrirMallaMenu}
              onMouseLeave={cerrarMallaMenu}
            >
              <button
                className={`tab-btn ${activeView === 'malla' ? 'active' : ''}`}
                aria-haspopup="menu"
                aria-expanded={mallaMenuAbierto}
                // En pantallas táctiles no hay hover: el clic abre el menú, y si
                // ya estaba en la vista lo cierra en vez de quedarse pegado.
                onClick={() => (mallaMenuAbierto ? cerrarMallaMenu({ inmediato: true }) : abrirMallaMenu())}
              >
                MALLA CURRICULAR
                <ChevronDown size={13} className="tab-flecha" />
              </button>
              {mallaMenuAbierto && (
                <div className="tab-menu-lista">
                  <div className="tab-menu-panel" role="menu">
                  {Object.entries(PLANES).map(([id, p]) => (
                    <button
                      key={id}
                      role="menuitem"
                      className={`tab-menu-item ${activeView === 'malla' && mallaPlan === id ? 'activo' : ''}`}
                      onClick={() => {
                        setMallaPlan(id);
                        setActiveView('malla');
                        cerrarMallaMenu({ inmediato: true });
                      }}
                    >
                      <span className="tab-menu-nombre">{p.especialidad}</span>
                      <span className="tab-menu-meta">Plan {p.plan} · {p.creditosTotales} créditos</span>
                    </button>
                  ))}
                  </div>
                </div>
              )}
            </div>
            {isSuperAdmin && (
              <button
                className={`tab-btn ${activeView === 'conocimiento' ? 'active' : ''}`}
                onClick={() => setActiveView('conocimiento')}
              >
                BASE DE CONOCIMIENTO
              </button>
            )}
            {isSuperAdmin && (
              <button
                className={`tab-btn ${activeView === 'mantenimiento' ? 'active' : ''}`}
                onClick={() => setActiveView('mantenimiento')}
              >
                MANTENIMIENTO
                {maintenanceEnabled && <span className="tab-badge">ON</span>}
                {reclamosAbiertos === false && <span className="tab-badge">RECLAMOS OFF</span>}
                {modoAlmuerzo && <span className="tab-badge">ALMUERZO</span>}
                {modoAlmuerzoFestivo && <span className="tab-badge">FESTIVO</span>}
                {tefiDurmiendoEnabled && <span className="tab-badge">DURMIENDO</span>}
                {modoDespedida && <span className="tab-badge">CICLO CERRADO</span>}
              </button>
            )}
            <button
              className={`tab-btn ${activeView === 'conversaciones' ? 'active' : ''}`}
              onClick={() => { setConvAbierta(null); setActiveView('conversaciones'); }}
            >
              CONVERSACIONES
            </button>
            {isSuperAdmin && (
              <button
                className={`tab-btn ${activeView === 'historial' ? 'active' : ''}`}
                onClick={() => setActiveView('historial')}
              >
                HISTORIAL
              </button>
            )}
          </nav>
      </header>

      <main className="main-content animate-in" style={{ animationDelay: '0.1s' }}>

        {/* ═══════════════ RECLAMOS VIEW ═══════════════ */}
        {activeView === 'reclamos' && (reclamosLoading
          ? <div className="flex-center" style={{ minHeight: 300 }}>
              <div className="loader-container"><div className="loader-bar" /><p className="loading-text">CARGANDO...</p></div>
            </div>
          : <>
            <section className="stats-grid">
              <div className="stat-card glass-card">
                <span className="stat-label">TOTAL RECLAMOS</span>
                <span className="stat-value">{reclamosStats.total}</span>
              </div>
              <div className="stat-card glass-card status-pending">
                <span className="stat-label">PENDIENTES</span>
                <span className="stat-value">{reclamosStats.pendiente}</span>
              </div>
              <div className="stat-card glass-card status-blue-card">
                <span className="stat-label">EN REVISIÓN</span>
                <span className="stat-value">{reclamosStats.enRevision}</span>
              </div>
              <div className="stat-card glass-card status-resolved">
                <span className="stat-label">ACEPTADOS</span>
                <span className="stat-value">{reclamosStats.resuelto}</span>
              </div>
              <div className="stat-card glass-card status-orange-card">
                <span className="stat-label">ACEPTADOS PARCIALMENTE</span>
                <span className="stat-value">{reclamosStats.parcial}</span>
              </div>
              <div className="stat-card glass-card status-red-card">
                <span className="stat-label">RECHAZADOS</span>
                <span className="stat-value">{reclamosStats.rechazado}</span>
              </div>
              <div className="stat-card glass-card status-teal-card">
                <span className="stat-label">MATRICULADOS</span>
                <span className="stat-value">{reclamosStats.matriculado}</span>
              </div>
            </section>

            <section className="table-controls animate-in">
              <div className="filters-row">
                <div className="select-wrapper glass-card">
                  <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
                    <option value="ALL">TODOS LOS ESTADOS</option>
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="EN_REVISION">EN REVISIÓN</option>
                    <option value="ACEPTADO">ACEPTADO</option>
                    <option value="ACEPTADO_PARCIALMENTE">ACEPTADO PARCIALMENTE</option>
                    <option value="MATRICULADO">MATRICULADO</option>
                    <option value="RECHAZADO">RECHAZADO</option>
                  </select>
                </div>
                <div className="select-wrapper glass-card">
                  <select value={filterEspecialidadReclamo} onChange={e => setFilterEspecialidadReclamo(e.target.value)}>
                    <option value="ALL">TODAS LAS CARRERAS</option>
                    {ESPECIALIDADES_FIIS.map(esp => (
                      <option key={esp.codigo} value={esp.codigo}>{esp.codigo} · {esp.nombre.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                  <div className="select-wrapper glass-card">
                    <select value={filterAtendido} onChange={e => setFilterAtendido(e.target.value)}>
                      <option value="ALL">ATENDIDOS POR TODOS</option>
                      <option value="SIN_ATENDER">SIN ATENDER</option>
                      {/* Solo quienes han atendido algo: ofrecer los nueve
                          llenaría el desplegable de opciones vacías. */}
                      {[...new Set(Object.values(atendidos).flat().map(a => a.email.toLowerCase()))]
                        .sort((a, b) => apodoDe(a).localeCompare(apodoDe(b)))
                        .map(email => (
                          <option key={email} value={email}>{apodoDe(email).toUpperCase()}</option>
                        ))}
                    </select>
                  </div>
                <div className="search-box glass-card" style={{ flex: 2 }}>
                  <input type="text" placeholder="BUSCAR POR NOMBRE, CORREO, CÓDIGO O ID..."
                    value={searchReclamos} onChange={e => setSearchReclamos(e.target.value)} />
                </div>
              </div>

              {/* Buscar por curso es otra pregunta distinta —cuántos piden esta
                  sección, a quién hay que reubicar— así que va en su propia
                  fila en vez de competir con la búsqueda por estudiante. */}
              <div className="filters-row" style={{ marginTop: 12 }}>
                <div className="select-wrapper glass-card">
                  <select value={filterTipoCurso} onChange={e => setFilterTipoCurso(e.target.value)}>
                    <option value="AMBOS">MATRICULAR Y RETIRAR</option>
                    <option value="MATRICULAR">SOLO MATRICULAR</option>
                    <option value="RETIRAR">SOLO RETIRAR</option>
                  </select>
                </div>
                <div className="search-box glass-card" style={{ flex: 2 }}>
                  <input type="text" list="cursos-pedidos" placeholder="BUSCAR POR CURSO (CÓDIGO O NOMBRE)..."
                    value={searchCurso} onChange={e => setSearchCurso(e.target.value)} />
                  <datalist id="cursos-pedidos">
                    {cursosEnReclamos.map(c => (
                      <option key={c.codigo} value={c.codigo}>{c.nombre} · {c.pedidos} pedido{c.pedidos === 1 ? '' : 's'}</option>
                    ))}
                  </datalist>
                </div>
                <div className="select-wrapper glass-card">
                  <select value={filterSeccionCurso} onChange={e => setFilterSeccionCurso(e.target.value)}
                    disabled={seccionesEnReclamos.length === 0}>
                    <option value="ALL">TODAS LAS SECCIONES</option>
                    {seccionesEnReclamos.map(sec => <option key={sec} value={sec}>SECCIÓN {sec}</option>)}
                  </select>
                </div>
                {filtroCursoActivo && (
                  <button className="btn btn-secondary btn-small"
                    onClick={() => { setSearchCurso(''); setFilterSeccionCurso('ALL'); setFilterTipoCurso('AMBOS'); }}>
                    LIMPIAR
                  </button>
                )}
                {/* Exporta lo filtrado, no todo: el número en el botón deja
                    claro cuántos van a salir antes de pulsarlo. */}
                <button className="btn btn-secondary btn-small"
                  onClick={exportarReclamos}
                  disabled={filteredReclamos.length === 0}
                  title="Descarga en Excel los reclamos que se están mostrando">
                  EXPORTAR EXCEL ({filteredReclamos.length})
                </button>
              </div>

              {filtroCursoActivo && (
                <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                  {filteredReclamos.length} reclamo{filteredReclamos.length === 1 ? '' : 's'} coincide
                  {filteredReclamos.length === 1 ? '' : 'n'} con el curso buscado.
                </p>
              )}
            </section>

            <section className="table-container glass-card">
              <div className="table-header reclamos-grid">
                <div className="th">ID</div>
                <div className="th">ESTUDIANTE</div>
                <div className="th">CÓDIGO</div>
                <div className="th">ESPECIALIDAD</div>
                <div className="th">CATEGORÍA</div>
                <div className="th">ESTADO</div>
                <div className="th">ATENDIDO POR</div>
                <div className="th">FECHA</div>
                <div className="th actions">ACCIONES</div>
              </div>
              <div className="table-body premium-scroll">
                {filteredReclamos.map(r => (
                  <div key={r.id} className="tr reclamos-grid animate-in" onClick={() => setSelectedReclamo(r)}>
                    <div className="td" data-label="ID"><span className="code-badge id-badge">{r.id}</span></div>
                    <div className="td" data-label="ESTUDIANTE">
                      <div className="name-box">
                        <span className="full-name">
                          {r.nombre || estudianteByEmail[r.email]?.datos_parseados?.datosPersonales?.nombre || ''}
                        </span>
                        <span className="email">{r.email}</span>
                      </div>
                    </div>
                    <div className="td" data-label="CÓDIGO"><span className="code-badge">
                      {r.codigo_estudiante || estudianteByEmail[r.email]?.codigo_estudiante || ''}
                    </span></div>
                    <div className="td" data-label="ESPECIALIDAD" style={{ fontSize: '0.82rem' }}>
                      {especialidadNombre(r) || <span style={{ color: 'var(--text-dim)' }}>—</span>}
                    </div>
                    <div className="td" data-label="CATEGORÍA" style={{ fontSize: '0.85rem' }}>
                      {r.categoria}
                      {/* Sin esto habría que abrir cada reclamo para ver qué
                          sección pidió, que es justo el dato que se busca. */}
                      {filtroCursoActivo && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {cursosDelReclamo(r, filterTipoCurso)
                            .filter(c => cursoCoincide(c, normalizaTexto(searchCurso.trim()), filterSeccionCurso))
                            .map(c => (
                              <span key={`${c.tipo}-${c.codigo}-${c.seccion}`} className="code-badge"
                                style={{ fontSize: '0.68rem', color: c.tipo === 'RETIRAR' ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                                {c.tipo === 'RETIRAR' ? '−' : '+'} {c.codigo} · {c.seccion}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="td" data-label="ESTADO">
                      <span className={`status-badge ${estadoClass(r.estado)}`} title={estadoLabel(r.estado)}>{estadoLabelCorto(r.estado)}</span>
                    </div>
                    <div className="td" data-label="ATENDIDO POR">
                      {personasDe(r.id).length === 0
                        ? <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>—</span>
                        : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {personasDe(r.id).map(email => (
                              <button key={email} className="code-badge"
                                style={{
                                  fontSize: '0.7rem', color: 'var(--primary-accent)', cursor: 'pointer',
                                  border: 'none', font: 'inherit', letterSpacing: 'inherit',
                                }}
                                title="Ver qué hizo y cuándo"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetalleAtencion({ reclamoId: r.id, email, eventos: eventosDe(r.id).filter(x => x.email.toLowerCase() === email) });
                                }}>
                                {apodoDe(email)}
                              </button>
                            ))}
                          </div>}
                    </div>
                    <div className="td date-text" data-label="FECHA">{fmtDate(r.created_at)}</div>
                    <div className="td actions"><button className="btn-text">DETALLES</button></div>
                  </div>
                ))}
                {filteredReclamos.length === 0 && (
                  <div className="empty-state"><p>No se encontraron reclamos.</p></div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ═══════════════ ESTUDIANTES VIEW ═══════════════ */}
        {activeView === 'estudiantes' && (estudiantesLoading
          ? <div className="flex-center" style={{ minHeight: 300 }}>
              <div className="loader-container"><div className="loader-bar" /><p className="loading-text">CARGANDO...</p></div>
            </div>
          : <>
            <section className="stats-grid">
              <div className="stat-card glass-card">
                <span className="stat-label">TOTAL ESTUDIANTES</span>
                <span className="stat-value">{estudiantesStats.total}</span>
              </div>
              <div className="stat-card glass-card" style={{ borderLeft: '3px solid var(--danger-color)' }}>
                <span className="stat-label">EN RIESGO</span>
                <span className="stat-value" style={{ color: 'var(--danger-color)' }}>{estudiantesStats.enRiesgo}</span>
              </div>
              <div className="stat-card glass-card status-pending">
                <span className="stat-label">CON RECLAMOS</span>
                <span className="stat-value">{estudiantesStats.conReclamos}</span>
              </div>
              <div className="stat-card glass-card status-resolved">
                <span className="stat-label">SIN RIESGO</span>
                <span className="stat-value">{estudiantesStats.total - estudiantesStats.enRiesgo}</span>
              </div>
            </section>

            <section className="table-controls animate-in">
              <div className="filters-row">
                <div className="select-wrapper glass-card">
                  <select value={filterEspecialidad} onChange={e => setFilterEspecialidad(e.target.value)}>
                    <option value="ALL">TODAS LAS ESPECIALIDADES</option>
                    {ESPECIALIDADES_FIIS.map(esp => (
                      <option key={esp.codigo} value={esp.codigo}>{esp.codigo} · {esp.nombre.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div className="select-wrapper glass-card">
                  <select value={filterRiesgo} onChange={e => setFilterRiesgo(e.target.value)}>
                    <option value="ALL">TODOS LOS ESTUDIANTES</option>
                    <option value="SI">EN RIESGO</option>
                    <option value="NO">SIN RIESGO</option>
                  </select>
                </div>
                <div className="search-box glass-card" style={{ flex: 2 }}>
                  <input type="text" placeholder="BUSCAR POR NOMBRE, CORREO O CÓDIGO..."
                    value={searchEstudiantes} onChange={e => setSearchEstudiantes(e.target.value)} />
                </div>
              </div>
            </section>

            <section className="table-container glass-card">
              <div className="table-header estudiantes-grid">
                <div className="th">NOMBRE / EMAIL</div>
                <div className="th">CÓDIGO</div>
                <div className="th">ESPECIALIDAD</div>
                <div className="th">RECLAMOS</div>
                <div className="th">PROMEDIO</div>
                <div className="th">RIESGO</div>
                <div className="th">ACTUALIZADO</div>
                <div className="th actions">ACCIONES</div>
              </div>
              <div className="table-body premium-scroll">
                {filteredEstudiantes.map(e => {
                  const dp = e.datos_parseados?.datosPersonales ?? {};
                  const rs = e.datos_parseados?.resumen ?? {};
                  return (
                    <div key={e.email} className="tr estudiantes-grid animate-in" onClick={() => setSelectedEstudiante(e)}>
                      <div className="td">
                        <div className="name-box">
                          {/* Si la ficha no está parseada se cae al nombre que
                              declaró en su reclamo. Sin esto, buscar por nombre
                              devolvía filas que solo decían "—". */}
                          <span className="full-name">
                            {dp.nombre || nombreDeclaradoPorEmail[e.email] || '—'}
                          </span>
                          <span className="email">{e.email}</span>
                        </div>
                      </div>
                      <div className="td" data-label="CÓDIGO"><span className="code-badge">{e.codigo_estudiante}</span></div>
                      <div className="td" data-label="ESPECIALIDAD" style={{ fontSize: '0.8rem' }}>{dp.especialidad || '—'}</div>
                      <div className="td" data-label="RECLAMOS">
                        {reclamosPorEmail[e.email]
                          ? <span className="code-badge" style={{ color: 'var(--primary-accent)', fontWeight: 700 }}>
                              {reclamosPorEmail[e.email]}
                            </span>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                      </div>
                      <div className="td">
                        <span style={{ fontWeight: 700, color: rs.enRiesgo ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                          {rs.promedioPonderado ?? '—'}
                        </span>
                      </div>
                      <div className="td">
                        {rs.enRiesgo
                          ? <span className="status-badge status-red">SI</span>
                          : <span className="status-badge status-green">NO</span>}
                      </div>
                      <div className="td date-text" data-label="ACTUALIZADO">{fmtDateShort(e.updated_at)}</div>
                      <div className="td actions"><button className="btn-text">VER PERFIL</button></div>
                    </div>
                  );
                })}
                {filteredEstudiantes.length === 0 && (
                  <div className="empty-state"><p>No se encontraron estudiantes.</p></div>
                )}
              </div>
            </section>
          </>
        )}

        {/* ═══════════════ MALLA CURRICULAR ═══════════════ */}
        {activeView === 'malla' && <MallaPlan plan={PLANES[mallaPlan]} />}

        {/* ═══════════════ BASE DE CONOCIMIENTO (RAG) — solo admin principal ═══════════════ */}
        {activeView === 'conocimiento' && isSuperAdmin && (
          <section className="glass-card" style={{ padding: 28, maxWidth: 560 }}>
            <h2 style={{ marginBottom: 6 }}>Base de conocimiento de Tefi</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.5 }}>
              Sube reglamentos, resoluciones u otros PDF oficiales de la FIIS/UNI. Se indexan directo en el
              motor de búsqueda de Tefi — a partir de ahí puede usarlos para responder preguntas de los estudiantes.
            </p>
            <input
              type="file"
              accept="application/pdf"
              onChange={e => { setRagFile(e.target.files?.[0] || null); setRagMessage(null); }}
              style={{ marginBottom: 16, display: 'block' }}
            />
            <button
              className="btn btn-primary"
              disabled={!ragFile || ragUploading}
              onClick={handleSubirDocumentoRag}
            >
              {ragUploading ? 'INDEXANDO...' : 'SUBIR E INDEXAR'}
            </button>
            {ragMessage && (
              <p style={{ marginTop: 16, fontSize: '0.85rem', color: ragMessage.type === 'error' ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                {ragMessage.text}
              </p>
            )}
          </section>
        )}

        {/* ═══════════════ VENTANA DE RECLAMOS — solo admin principal ═══════════════ */}
        {activeView === 'mantenimiento' && isSuperAdmin && (
          <section className="glass-card" style={{ padding: 28, maxWidth: 560, marginBottom: 20 }}>
            <h2 style={{ marginBottom: 6 }}>Ventana de reclamos</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.5 }}>
              Con la ventana cerrada, los estudiantes siguen entrando y pueden consultar sus reclamos
              anteriores, pero no pueden enviar uno nuevo. Sirve para cerrar el plazo sin apagar la
              plataforma entera, que es lo que hace el modo mantenimiento de abajo.
            </p>
            {reclamosAbiertos === null ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Cargando estado actual...</p>
            ) : (
              <>
                <p style={{ marginBottom: 16, fontWeight: 600 }}>
                  Estado actual:{' '}
                  <span style={{ color: reclamosAbiertos ? 'var(--ok-color)' : 'var(--danger-color)' }}>
                    {reclamosAbiertos ? 'ABIERTA (se pueden enviar reclamos)' : 'CERRADA (no se admiten reclamos nuevos)'}
                  </span>
                </p>
                <button
                  className={`btn ${reclamosAbiertos ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={reclamosSwitchLoading}
                  onClick={handleToggleReclamos}
                >
                  {reclamosSwitchLoading
                    ? 'GUARDANDO...'
                    : reclamosAbiertos ? 'CERRAR VENTANA DE RECLAMOS' : 'ABRIR VENTANA DE RECLAMOS'}
                </button>
              </>
            )}
          </section>
        )}

        {/* ═══════════════ MODO ALMUERZO — solo admin principal ═══════════════ */}
        {activeView === 'mantenimiento' && isSuperAdmin && (
          <section className="glass-card" style={{ padding: 28, maxWidth: 560, marginBottom: 20 }}>
            <h2 style={{ marginBottom: 6 }}>Modo almuerzo</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.5 }}>
              Cierra únicamente la sección de Conversación: los estudiantes ven que Tefi está almorzando
              y un botón que los lleva a Reclamos. Los reclamos siguen funcionando con normalidad, a
              diferencia del modo mantenimiento, que apaga la plataforma entera.
            </p>
            {modoAlmuerzo === null ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Cargando estado actual...</p>
            ) : (
              <>
                <p style={{ marginBottom: 16, fontWeight: 600 }}>
                  Estado actual:{' '}
                  <span style={{ color: modoAlmuerzo ? 'var(--warn-color)' : 'var(--ok-color)' }}>
                    {modoAlmuerzo ? 'ACTIVADO (consultas cerradas)' : 'DESACTIVADO (Tefi responde)'}
                  </span>
                </p>
                <button
                  className={`btn ${modoAlmuerzo ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={almuerzoLoading}
                  onClick={handleToggleAlmuerzo}
                >
                  {almuerzoLoading
                    ? 'GUARDANDO...'
                    : modoAlmuerzo ? 'DESACTIVAR MODO ALMUERZO' : 'ACTIVAR MODO ALMUERZO'}
                </button>
              </>
            )}
          </section>
        )}

        {/* ═══════════════ MODO ALMUERZO FESTIVO — solo admin principal ═══════════════ */}
        {activeView === 'mantenimiento' && isSuperAdmin && (
          <section className="glass-card" style={{ padding: 28, maxWidth: 560, marginBottom: 20 }}>
            <h2 style={{ marginBottom: 6 }}>Modo almuerzo festivo</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.5 }}>
              Igual que el modo almuerzo, pero para feriados (p. ej. Santa Rosa de Lima): cierra
              únicamente la Conversación con un mensaje y una imagen propios. Es un interruptor
              independiente del almuerzo de todos los días, así que no hace falta desactivar uno
              para usar el otro.
            </p>
            {modoAlmuerzoFestivo === null ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Cargando estado actual...</p>
            ) : (
              <>
                <p style={{ marginBottom: 16, fontWeight: 600 }}>
                  Estado actual:{' '}
                  <span style={{ color: modoAlmuerzoFestivo ? 'var(--warn-color)' : 'var(--ok-color)' }}>
                    {modoAlmuerzoFestivo ? 'ACTIVADO (consultas cerradas)' : 'DESACTIVADO (Tefi responde)'}
                  </span>
                </p>
                <button
                  className={`btn ${modoAlmuerzoFestivo ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={almuerzoFestivoLoading}
                  onClick={handleToggleAlmuerzoFestivo}
                >
                  {almuerzoFestivoLoading
                    ? 'GUARDANDO...'
                    : modoAlmuerzoFestivo ? 'DESACTIVAR MODO ALMUERZO FESTIVO' : 'ACTIVAR MODO ALMUERZO FESTIVO'}
                </button>
              </>
            )}
          </section>
        )}

        {/* ═══════════════ MODO MANTENIMIENTO — solo admin principal ═══════════════ */}
        {activeView === 'mantenimiento' && isSuperAdmin && (
          <section className="glass-card" style={{ padding: 28, maxWidth: 560 }}>
            <h2 style={{ marginBottom: 6 }}>Modo mantenimiento</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.5 }}>
              Mientras esté activo, ningún estudiante puede usar sistema-tefiis — en su lugar ven una pantalla
              de "Tefi se está tomando un descanso". Úsalo solo si necesitas pausar la plataforma por completo
              (ej. mientras corriges un problema serio).
            </p>
            {maintenanceEnabled === null ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Cargando estado actual...</p>
            ) : (
              <>
                <p style={{ marginBottom: 16, fontWeight: 600 }}>
                  Estado actual:{' '}
                  <span style={{ color: maintenanceEnabled ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                    {maintenanceEnabled ? 'ACTIVADO (sistema pausado)' : 'DESACTIVADO (sistema normal)'}
                  </span>
                </p>
                <button
                  className={`btn ${maintenanceEnabled ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={maintenanceLoading}
                  onClick={handleToggleMaintenance}
                >
                  {maintenanceLoading
                    ? 'GUARDANDO...'
                    : maintenanceEnabled ? 'DESACTIVAR Y REACTIVAR SISTEMA-TEFIIS' : 'ACTIVAR MODO MANTENIMIENTO'}
                </button>
              </>
            )}
          </section>
        )}

        {/* ═══════════════ TEFI DURMIENDO — solo admin principal ═══════════════ */}
        {activeView === 'mantenimiento' && isSuperAdmin && (
          <section className="glass-card" style={{ padding: 28, maxWidth: 560, marginTop: 20 }}>
            <h2 style={{ marginBottom: 6 }}>Tefi durmiendo</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.5 }}>
              Independiente del modo mantenimiento. Mientras esté activo, ningún estudiante puede usar
              sistema-tefiis — en su lugar ven una pantalla de "Tefi está durmiendo". Es manual: no se
              activa ni desactiva solo por hora, aunque el mensaje mencione un horario de descanso.
            </p>
            {tefiDurmiendoEnabled === null ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Cargando estado actual...</p>
            ) : (
              <>
                <p style={{ marginBottom: 16, fontWeight: 600 }}>
                  Estado actual:{' '}
                  <span style={{ color: tefiDurmiendoEnabled ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                    {tefiDurmiendoEnabled ? 'ACTIVADO (sistema pausado)' : 'DESACTIVADO (sistema normal)'}
                  </span>
                </p>
                <button
                  className={`btn ${tefiDurmiendoEnabled ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={tefiDurmiendoLoading}
                  onClick={handleToggleTefiDurmiendo}
                >
                  {tefiDurmiendoLoading
                    ? 'GUARDANDO...'
                    : tefiDurmiendoEnabled ? 'DESACTIVAR Y REACTIVAR SISTEMA-TEFIIS' : 'ACTIVAR TEFI DURMIENDO'}
                </button>
              </>
            )}
          </section>
        )}

        {/* ═══════════════ MODO DESPEDIDA — solo admin principal ═══════════════ */}
        {activeView === 'mantenimiento' && isSuperAdmin && (
          <section className="glass-card" style={{ padding: 28, maxWidth: 560, marginTop: 20 }}>
            <h2 style={{ marginBottom: 6 }}>Cierre de ciclo (Tefi se despide)</h2>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginBottom: 22, lineHeight: 1.5 }}>
              No es una pausa como el mantenimiento o Tefi durmiendo: es el final de la matrícula.
              Los estudiantes verán la despedida de Tefi y <strong>no podrán enviar reclamos nuevos
              ni subir documentos</strong>. Lo único que les queda es consultar el estado de un
              reclamo que ya presentaron. El bloqueo lo aplica el servidor, así que tampoco entra
              nada desde una pestaña que se quedara abierta.
            </p>
            {modoDespedida === null ? (
              <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>Cargando estado actual...</p>
            ) : (
              <>
                <p style={{ marginBottom: 16, fontWeight: 600 }}>
                  Estado actual:{' '}
                  <span style={{ color: modoDespedida ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                    {modoDespedida ? 'CICLO CERRADO (no se aceptan reclamos)' : 'CICLO ABIERTO (todo normal)'}
                  </span>
                </p>
                <button
                  className={`btn ${modoDespedida ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={despedidaLoading}
                  onClick={handleToggleDespedida}
                >
                  {despedidaLoading
                    ? 'GUARDANDO...'
                    : modoDespedida ? 'REABRIR EL CICLO' : 'CERRAR EL CICLO Y DESPEDIRSE'}
                </button>
              </>
            )}
          </section>
        )}

        {/* ═══════════════ CONVERSACIONES CON TEFI — abierto a todo el equipo admin ═══════════════ */}
        {activeView === 'conversaciones' && !convAbierta && (
          <>
            <section className="filters-bar">
              <div className="search-box glass-card" style={{ flex: 1 }}>
                <input type="text" placeholder="BUSCAR POR CORREO..."
                  value={convBusqueda} onChange={e => setConvBusqueda(e.target.value)} />
              </div>
            </section>

            {convError && <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem' }}>{convError}</p>}

            <section className="table-container glass-card">
              <div className="table-header" style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1.5fr 1fr', display: 'grid' }}>
                <div className="th">ESTUDIANTE</div>
                <div className="th">MENSAJES</div>
                <div className="th">HILOS</div>
                <div className="th">ÚLTIMA VEZ</div>
                <div className="th actions">ACCIONES</div>
              </div>
              <div className="table-body premium-scroll">
                {conversacionesFiltradas.map(c => (
                  <div key={c.email} className="tr animate-in"
                    style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1.5fr 1fr', display: 'grid', cursor: 'pointer' }}
                    onClick={() => abrirConversacion(c.email)}>
                    <div className="td"><span className="email">{c.email}</span></div>
                    <div className="td">{c.turnos}</div>
                    <div className="td">{c.conversaciones}</div>
                    <div className="td date-text">{fmtDate(c.ultimo)}</div>
                    <div className="td actions"><button className="btn-text">VER CHAT</button></div>
                  </div>
                ))}
                {!convLoading && conversacionesFiltradas.length === 0 && (
                  <div className="empty-state">
                    <p>{conversaciones.length === 0
                      ? 'Todavía no hay conversaciones registradas.'
                      : 'Ningún estudiante coincide con la búsqueda.'}</p>
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        {/* Hilos de un estudiante. Se muestran como chat, con la pregunta y la
            respuesta enfrentadas: leer una tabla de filas sueltas no deja ver
            de qué iba la conversación, que es justo el motivo de auditarla. */}
        {activeView === 'conversaciones' && convAbierta && (
          <>
            <section className="filters-bar" style={{ alignItems: 'center' }}>
              <button className="btn btn-secondary btn-small" onClick={() => setConvAbierta(null)}>
                ← VOLVER
              </button>
              <span style={{ fontWeight: 600 }}>{convAbierta.email}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                {convDetalleLoading ? 'cargando...' : `${convAbierta.hilos?.length || 0} hilo(s)`}
              </span>
            </section>

            {!convDetalleLoading && (convAbierta.hilos?.length || 0) === 0 && (
              <section className="glass-card" style={{ padding: 24 }}>
                <p style={{ color: 'var(--text-dim)' }}>Este estudiante no tiene conversaciones guardadas.</p>
              </section>
            )}

            {(convAbierta.hilos || []).map((hilo, i) => (
              <section key={hilo.conversacionId} className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
                <h3 style={{ marginBottom: 4 }}>Conversación {(convAbierta.hilos.length - i)}</h3>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 18 }}>
                  {fmtDate(hilo.inicio)} · {hilo.turnos.length} mensaje(s)
                </p>
                {hilo.turnos.map((t, j) => (
                  <div key={j} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <div style={{
                        maxWidth: '78%', padding: '10px 14px', borderRadius: 14,
                        background: 'var(--sunken-bg)', border: '1px solid var(--border-color)',
                        whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.5,
                      }}>{t.pregunta}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                      <div style={{
                        maxWidth: '78%', padding: '10px 14px', borderRadius: 14,
                        background: 'var(--surface-color)', border: '1px solid var(--border-color)',
                        whiteSpace: 'pre-wrap', fontSize: '0.88rem', lineHeight: 1.5,
                      }}>{t.respuesta}</div>
                    </div>
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: 6, textAlign: 'right' }}>
                      {fmtHora(t.fecha)}
                    </p>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}

        {/* ═══════════════ HISTORIAL DE ACTIVIDAD — solo admin principal ═══════════════ */}
        {activeView === 'historial' && isSuperAdmin && (
          <>
            <section className="filters-bar">
              <div className="select-wrapper glass-card">
                <select value={activityFiltro} onChange={e => setActivityFiltro(e.target.value)}>
                  <option value="ALL">TODOS LOS ACTORES</option>
                  <option value="estudiante">ESTUDIANTES</option>
                  <option value="admin">ADMINS</option>
                </select>
              </div>
              <div className="search-box glass-card" style={{ flex: 2 }}>
                <input type="text" placeholder="BUSCAR POR CORREO..."
                  value={activityBusqueda} onChange={e => setActivityBusqueda(e.target.value)} />
              </div>
            </section>

            {activityError && (
              <p style={{ color: 'var(--danger-color)', fontSize: '0.85rem', margin: '0 0 12px' }}>Error: {activityError}</p>
            )}

            <section className="table-container glass-card">
              <div className="table-header activity-grid">
                <div className="th">FECHA Y HORA</div>
                <div className="th">QUIÉN</div>
                <div className="th">ACCIÓN</div>
                <div className="th">DETALLE</div>
              </div>
              <div className="table-body premium-scroll">
                {filteredActivity.map(a => (
                  <div key={a.id} className="tr activity-grid animate-in">
                    <div className="td date-text">{fmtDate(a.created_at)}</div>
                    <div className="td">
                      <div className="name-box">
                        <span className="email">{a.actor_email || '—'}</span>
                        <span className="full-name" style={{ fontSize: '0.72rem', opacity: 0.7 }}>
                          {a.actor_type === 'admin' ? 'ADMIN' : 'ESTUDIANTE'}
                        </span>
                      </div>
                    </div>
                    <div className="td">{ACCION_LABEL[a.accion] || a.accion}</div>
                    <div className="td" style={{ fontSize: '0.78rem', opacity: 0.85 }}>{formatDetalleActividad(a)}</div>
                  </div>
                ))}
                {!activityLoading && filteredActivity.length === 0 && (
                  <div className="empty-state"><p>No hay actividad registrada.</p></div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      {/* ═══════════════ RECLAMO MODAL ═══════════════ */}
      {selectedReclamo && (
        <div className="modal-overlay" onClick={() => setSelectedReclamo(null)}>
          <div className="modal-content glass-card animate-in" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{selectedReclamo.id}</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 4 }}>{selectedReclamo.categoria}</p>
              </div>
              <button className="close-btn" onClick={() => setSelectedReclamo(null)}>CERRAR [X]</button>
            </div>
            <div className="modal-body divider-layout">

              {/* Columna izquierda */}
              <div className="modal-body-main premium-scroll">
                {/* Lo que declaró el estudiante al abrir el reclamo. Está siempre
                    porque no depende de que nadie extraiga nada. */}
                <div className="detail-section">
                  <h3>Datos declarados por el estudiante</h3>
                  <div className="detail-grid">
                    <div className="detail-item"><label>NOMBRE</label><p>{selectedReclamo.nombre || '—'}</p></div>
                    <div className="detail-item"><label>CÓDIGO</label><p>{selectedReclamo.codigo_estudiante || '—'}</p></div>
                    <div className="detail-item">
                      <label>CORREO</label>
                      <a href={`mailto:${selectedReclamo.email}`} className="whatsapp-link" style={{ color: 'var(--primary-accent)' }}>
                        {selectedReclamo.email}
                      </a>
                    </div>
                    <div className="detail-item"><label>ESPECIALIDAD</label><p>{especialidadDeclarada || '—'}</p></div>
                    <div className="detail-item">
                      <label>TELÉFONO</label>
                      {selectedReclamo.datos_estudiante?.telefono
                        ? <a href={`https://wa.me/51${selectedReclamo.datos_estudiante.telefono}`} target="_blank" rel="noreferrer" className="whatsapp-link" style={{ color: 'var(--primary-accent)' }}>
                            {selectedReclamo.datos_estudiante.telefono}
                          </a>
                        : <p>—</p>}
                    </div>
                    <div className="detail-item"><label>TURNO</label><p>{formatearTurno(selectedReclamo.datos_estudiante?.turno)}</p></div>
                    <div className="detail-item">
                      <label>¿LLEGÓ A MATRICULARSE?</label>
                      <p style={{ fontWeight: 700, color: reclamoMatriculado === true ? 'var(--ok-color)' : reclamoMatriculado === false ? 'var(--danger-color)' : undefined }}>
                        {reclamoMatriculado === true ? 'Sí' : reclamoMatriculado === false ? 'No' : '—'}
                      </p>
                    </div>
                  </div>

                  {/* La carrera que marcó el estudiante no es la de su ficha.
                      Se avisa y se ofrece corregirlo, pero no se cambia solo:
                      el parseo también puede equivocarse. */}
                  {discrepanciaEspecialidad && (
                    <div
                      style={{
                        marginTop: 18, padding: '14px 16px', borderRadius: 10,
                        background: 'rgba(245, 158, 11, 0.10)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                        justifyContent: 'space-between', gap: 12,
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.55, flex: '1 1 260px' }}>
                        <strong>⚠ La carrera no coincide con su ficha.</strong><br />
                        El estudiante marcó <strong>{discrepanciaEspecialidad.declarada}</strong>, pero en
                        sus documentos figura como <strong>{discrepanciaEspecialidad.real}</strong>.
                      </p>
                      {!isSoloLectura && (
                        <button
                          className="btn btn-primary btn-small"
                          style={{ flexShrink: 0 }}
                          disabled={corrigiendoEspecialidad}
                          onClick={corregirEspecialidad}
                        >
                          {corrigiendoEspecialidad
                            ? 'CORRIGIENDO...'
                            : `CAMBIAR A ${discrepanciaEspecialidad.real.toUpperCase()}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Los cursos que pide retirar y llevar. Van con los datos que él
                    declara, no con el parseo: esto lo eligió el estudiante de un
                    catálogo cerrado, y es lo concreto que hay que tramitar. */}
                {(() => {
                  const retirar = selectedReclamo.datos_estudiante?.cursosRetirar || [];
                  const matricular = selectedReclamo.datos_estudiante?.cursosMatricular || [];
                  if (!retirar.length && !matricular.length) return null;
                  return (
                    <div className="detail-section">
                      <h3>Cursos solicitados</h3>
                      <div className="detail-grid">
                        {retirar.map(c => (
                          <div key={`r-${c.codigo}-${c.seccion}`} className="detail-item">
                            <label style={{ color: 'var(--danger-color)' }}>RETIRAR · SEC. {c.seccion}</label>
                            <p>{c.codigo} — {c.nombre}</p>
                          </div>
                        ))}
                        {matricular.map(c => (
                          <div key={`m-${c.codigo}-${c.seccion}`} className="detail-item">
                            <label style={{ color: 'var(--ok-color)' }}>MATRICULAR · SEC. {c.seccion}</label>
                            <p>{c.codigo} — {c.nombre}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* La decisión del Tercio: qué se matricula y qué se retira de
                    verdad, que no tiene por qué ser lo que pidió el estudiante.
                    Solo se ve aquí; a él no le llega ni por la app ni por correo. */}
                <div className="detail-section">
                  <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <span>Cursos a matricular y desmatricular</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.06em', color: 'var(--warn-color)', background: 'rgba(251,191,36,0.12)', padding: '4px 10px', borderRadius: 999 }}>
                      SOLO ADMINS · EL ESTUDIANTE NO LO VE
                    </span>
                  </h3>

                  {!editandoResueltos ? (
                    /* Resumen: solo lo decidido, sin selectores. */
                    <div className="detail-grid">
                      {[
                        { lista: 'matricular',    titulo: 'A MATRICULAR',    color: 'var(--ok-color)' },
                        { lista: 'desmatricular', titulo: 'A DESMATRICULAR', color: 'var(--danger-color)' },
                      ].map(({ lista, titulo, color }) => (
                        <div key={lista} className="detail-item">
                          <label style={{ color }}>{titulo}</label>
                          {resueltos[lista].length === 0 ? (
                            <p style={{ color: 'var(--text-dim)' }}>Ninguno</p>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {resueltos[lista].map(c => (
                                <p key={`v-${lista}-${c.codigo}-${c.seccion}`} style={{ margin: 0 }}>
                                  <strong>{c.codigo}</strong> · Sec. {c.seccion}
                                  {c.nombre && <span style={{ color: 'var(--text-dim)' }}> — {c.nombre}</span>}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                        <button
                          className="btn btn-secondary btn-small"
                          onClick={() => {
                            const habia = resueltos.matricular.length + resueltos.desmatricular.length;
                            setResueltos({ matricular: [], desmatricular: [] });
                            mostrarAviso(habia
                              ? `Lista vacía: se ${habia === 1 ? 'quitó 1 curso' : `quitaron ${habia} cursos`}.`
                              : 'La lista ya estaba vacía: empieza a añadir cursos.');
                          }}
                        >
                          EMPEZAR DE CERO
                        </button>
                        <button className="btn btn-secondary btn-small" onClick={cargarLoQuePidio}>
                          CARGAR LO QUE PIDIÓ EL ESTUDIANTE
                        </button>

                        {avisoResueltos && (
                          <span
                            key={avisoResueltos.texto}
                            className="animate-in"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              fontSize: '0.76rem', fontWeight: 600, padding: '7px 12px', borderRadius: 999,
                              color: avisoResueltos.tono === 'warn' ? 'var(--warn-color)' : 'var(--ok-color)',
                              background: avisoResueltos.tono === 'warn' ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
                            }}
                          >
                            {avisoResueltos.tono === 'warn' ? '⚠' : '✓'} {avisoResueltos.texto}
                          </span>
                        )}
                      </div>

                      <div className="detail-grid">
                        {[
                          { lista: 'matricular',    titulo: 'A MATRICULAR',    color: 'var(--ok-color)' },
                          { lista: 'desmatricular', titulo: 'A DESMATRICULAR', color: 'var(--danger-color)' },
                        ].map(({ lista, titulo, color }) => (
                          <div key={lista} className="detail-item">
                            <label style={{ color }}>{titulo}</label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '8px 0 10px' }}>
                              {resueltos[lista].length === 0 && (
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>Sin cursos todavía.</span>
                              )}
                              {resueltos[lista].map(c => {
                                const id = `${lista}|${c.codigo}|${c.seccion}`;
                                const editando = editandoSeccionDe === id;
                                const delCatalogo = CATALOGO_CURSOS.find(x => x.codigo === c.codigo);
                                return (
                                  <div key={id}
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                      background: 'var(--surface-color)', border: '1px solid var(--border-color)',
                                      borderRadius: 8, padding: '6px 10px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.8rem', minWidth: 0 }}>
                                      <strong>{c.codigo}</strong>
                                      {!editando && <> · Sec. {c.seccion}</>}
                                      {c.nombre && <span style={{ color: 'var(--text-dim)' }}> — {c.nombre}</span>}
                                    </span>

                                    {editando ? (
                                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <select
                                          autoFocus
                                          defaultValue={c.seccion}
                                          onChange={e => cambiarSeccion(lista, c.codigo, c.seccion, e.target.value)}
                                          style={{ background: 'var(--surface-color)', color: 'var(--text-main)',
                                            border: '1px solid var(--primary-accent)', borderRadius: 8,
                                            padding: '4px 6px', fontSize: '0.76rem' }}
                                        >
                                          {(delCatalogo?.secciones || [c.seccion]).map(sec => (
                                            <option key={sec} value={sec}>
                                              Sec. {sec}{etiquetaSeccion(conteoPorSeccion, c.codigo, sec)}
                                            </option>
                                          ))}
                                        </select>
                                        <button className="btn-text" style={{ padding: '2px 6px' }}
                                          onClick={() => setEditandoSeccionDe(null)}>CANCELAR</button>
                                      </span>
                                    ) : (
                                      <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                                        <button className="btn-text" style={{ padding: '2px 6px' }}
                                          onClick={() => setEditandoSeccionDe(id)}>EDITAR SECCIÓN</button>
                                        <button className="btn-text" style={{ color: 'var(--danger-color)', padding: '2px 6px' }}
                                          onClick={() => quitarResuelto(lista, c.codigo, c.seccion)}>QUITAR</button>
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Añadir: se busca el curso y luego su sección. El
                                número de al lado es cuánta gente lleva ya esa
                                sección. */}
                            <SelectorCurso
                              lista={lista}
                              onAgregar={agregarResuelto}
                              conteo={conteoPorSeccion}
                            />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
                    {editandoResueltos ? (
                      <>
                        <button className="btn btn-primary btn-small" disabled={guardandoResueltos} onClick={guardarResueltos}>
                          {guardandoResueltos ? 'GUARDANDO...' : 'GUARDAR DECISIÓN'}
                        </button>
                        <button className="btn btn-secondary btn-small" disabled={guardandoResueltos} onClick={cancelarEdicionResueltos}>
                          CANCELAR
                        </button>
                      </>
                    ) : (
                      !isSoloLectura && (
                        <button className="btn btn-secondary btn-small" onClick={() => setEditandoResueltos(true)}>
                          {selectedReclamo.cursos_resueltos?.actualizadoPor ? 'EDITAR' : 'DECIDIR CURSOS'}
                        </button>
                      )
                    )}
                    {selectedReclamo.cursos_resueltos?.actualizadoPor && (
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                        Última decisión: <strong>{apodoDe(selectedReclamo.cursos_resueltos.actualizadoPor)}</strong>
                        {' · '}{fmtDate(selectedReclamo.cursos_resueltos.actualizadoEn)}
                      </span>
                    )}
                    {selectedReclamo.cursos_resueltos?.historial?.length > 0 && (
                      <button className="btn-text" onClick={() => setVerHistorialResueltos(v => !v)}>
                        {verHistorialResueltos ? 'OCULTAR HISTORIAL' : `VER HISTORIAL (${selectedReclamo.cursos_resueltos.historial.length})`}
                      </button>
                    )}
                  </div>

                  {verHistorialResueltos && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {[...selectedReclamo.cursos_resueltos.historial].reverse().map((h, i) => (
                        <div key={i} style={{ background: 'var(--surface-color)', border: '1px solid var(--border-color)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                            <strong style={{ fontSize: '0.78rem' }}>{apodoDe(h.admin)}</strong>
                            <span className="date-text">{fmtDate(h.fecha)}</span>
                          </div>
                          <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-dim)' }}>
                            Matricular: {h.matricular?.length ? h.matricular.map(c => `${c.codigo}-${c.seccion}`).join(', ') : '—'}
                            {' · '}Desmatricular: {h.desmatricular?.length ? h.desmatricular.map(c => `${c.codigo}-${c.seccion}`).join(', ') : '—'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lo que sale de sus PDF. Se separa de lo anterior porque tiene
                    otro origen y otra fiabilidad: esto lo produce el parseo, no
                    el estudiante, y solo existe si un admin lo pidió. */}
                <div className="detail-section">
                  <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span>Datos extraídos de sus documentos</span>
                    {!isSoloLectura && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() => extraerDatosEstudiante(selectedReclamo.email)}
                        disabled={extrayendo}
                        title="Descarga los PDF del estudiante y extrae sus datos académicos"
                      >
                        {extrayendo ? 'EXTRAYENDO...' : faltanDatosAcademicos ? 'EXTRAER DATOS' : 'VOLVER A EXTRAER'}
                      </button>
                    )}
                  </h3>

                  {faltanDatosAcademicos ? (
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-dim)' }}>
                      {extrayendo
                        ? 'Leyendo los PDF del estudiante…'
                        : isSoloLectura
                          ? 'Todavía no se han extraído de sus PDF.'
                          : <>Todavía no se han extraído. Pulsa <strong>Extraer datos</strong> para leerlos de los PDF que subió.</>}
                    </p>
                  ) : (
                    <div className="detail-grid">
                      <div className="detail-item"><label>NOMBRE EN LA FICHA</label><p>{reclamoDP.nombre || '—'}</p></div>
                      <div className="detail-item"><label>CÓDIGO EN LA FICHA</label><p>{reclamoDP.codigo || '—'}</p></div>
                      <div className="detail-item"><label>ESPECIALIDAD</label><p>{reclamoDP.especialidad || '—'}</p></div>
                      <div className="detail-item"><label>CICLO RELATIVO</label><p>{reclamoDP.cicloRelativo ? `${reclamoDP.cicloRelativo}°` : '—'}</p></div>
                      <div className="detail-item"><label>PLAN DE ESTUDIO</label><p>{reclamoDP.planEstudio || '—'}</p></div>
                      <div className="detail-item">
                        <label>PROMEDIO PONDERADO</label>
                        <p style={{ fontWeight: 700, color: reclamoRS.enRiesgo ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                          {reclamoRS.promedioPonderado || '—'}
                          {reclamoRS.enRiesgo && <span style={{ marginLeft: 6, fontSize: '0.75rem' }}>⚠ EN RIESGO</span>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Descripción del Reclamo</h3>
                  <div className="problem-box glass-card">
                    <div className="badge-row">
                      <span className="type-large">{selectedReclamo.categoria}</span>
                      <span className="time-stamp">{fmtDate(selectedReclamo.created_at)}</span>
                    </div>
                    <p className="description-text">{selectedReclamo.descripcion}</p>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Documentos del Estudiante</h3>
                  <div className="files-preview-container">
                    {[
                      { key: 'ficha',  label: 'Ficha Académica',    raw: reclamoDocs.ficha  || storageUrl(selectedReclamo.email, 'ficha') },
                      { key: 'boleta', label: 'Boleta de Matrícula', raw: reclamoDocs.boleta || storageUrl(selectedReclamo.email, 'boleta') },
                      { key: 'avance', label: 'Avance Curricular',   raw: reclamoDocs.avance || storageUrl(selectedReclamo.email, 'avance') },
                    ].map(doc => { const url = signedDocs[doc.raw]; return (
                      <div key={doc.key} className="preview-card glass-card">
                        <div className="preview-header">
                          <span className="file-label">{doc.label}</span>
                          {url && <a href={url} target="_blank" rel="noreferrer" className="link-text">ABRIR ORIGINAL</a>}
                        </div>
                        <div className="preview-frame">
                          {url === false ? <p>No se pudo cargar el documento.</p>
                            : url ? <iframe src={url} title={doc.label} width="100%" height="400px" frameBorder="0" />
                            : <p>Cargando documento…</p>}
                        </div>
                      </div>
                    ); })}
                  </div>
                </div>

                {(reclamoDocs.evidencias || []).length > 0 && (
                  <div className="detail-section">
                    <h3>Pruebas Adjuntas por el Estudiante ({reclamoDocs.evidencias.length})</h3>
                    <div className="files-preview-container">
                      {reclamoDocs.evidencias.map((ev, i) => {
                        const url = signedDocs[ev.ref];
                        const esImagen = (ev.tipo || '').startsWith('image/');
                        return (
                          <div key={ev.ref || i} className="preview-card glass-card">
                            <div className="preview-header">
                              <span className="file-label" title={ev.nombre}>
                                {ev.nombre} {ev.bytes ? `· ${formatearBytes(ev.bytes)}` : ''}
                              </span>
                              {url && <a href={url} target="_blank" rel="noreferrer" className="link-text">ABRIR ORIGINAL</a>}
                            </div>
                            <div className="preview-frame">
                              {url === false ? <p>No se pudo cargar el archivo.</p>
                                : !url ? <p>Cargando archivo…</p>
                                : esImagen
                                  ? <img src={url} alt={ev.nombre} className="preview-imagen" />
                                  : <iframe src={url} title={ev.nombre} width="100%" height="400px" frameBorder="0" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar derecho */}
              <div className="modal-body-sidebar">

                {/* Estado actual */}
                <div className="sidebar-group">
                  <label className="sidebar-label">ESTADO ACTUAL</label>
                  <span className={`status-badge ${estadoClass(selectedReclamo.estado)}`}
                    style={{ fontSize: '0.9rem', padding: '8px 16px', display: 'inline-block' }}>
                    {estadoLabel(selectedReclamo.estado)}
                  </span>
                </div>

                {/* Cambiar estado */}
                <div className="sidebar-group">
                  <label className="sidebar-label">CAMBIAR ESTADO</label>
                  {reclamoCerrado ? (
                    <div style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                      background: 'rgba(20,184,166,0.10)', border: '1px solid var(--final-color)',
                      borderRadius: 10, padding: '12px 14px',
                    }}>
                      <span style={{ color: 'var(--final-color)', fontWeight: 700 }}>🔒</span>
                      <p style={{ margin: 0, fontSize: '0.8rem', lineHeight: 1.5, color: 'var(--text-main)' }}>
                        <strong style={{ color: 'var(--final-color)' }}>Ya no se puede rehacer el estado.</strong><br />
                        Este reclamo quedó como MATRICULADO, que es el estado final.
                      </p>
                    </div>
                  ) : isSoloLectura ? (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      Tu cuenta es de solo lectura, así que el estado no se puede cambiar desde aquí.
                    </p>
                  ) : (
                  <div className="status-actions-vertical">
                    <button
                      className={`btn-status btn-review ${tempEstado === 'EN_REVISION' ? 'active' : ''}`}
                      onClick={() => cambiarEstado('EN_REVISION')}
                    >
                      {tempEstado === 'EN_REVISION' ? '● EN REVISIÓN' : 'MARCAR EN REVISIÓN'}
                    </button>
                    <button
                      className={`btn-status btn-accept ${tempEstado === 'ACEPTADO' ? 'active' : ''}`}
                      onClick={() => cambiarEstado('ACEPTADO')}
                    >
                      {tempEstado === 'ACEPTADO' ? '✓ ACEPTADO' : 'MARCAR ACEPTADO'}
                    </button>
                    <button
                      className={`btn-status ${tempEstado === 'ACEPTADO_PARCIALMENTE' ? 'active' : ''}`}
                      style={{
                        background: tempEstado === 'ACEPTADO_PARCIALMENTE' ? 'rgba(249,115,22,0.18)' : 'transparent',
                        color: tempEstado === 'ACEPTADO_PARCIALMENTE' ? 'var(--partial-color)' : 'var(--text-dim)',
                        border: tempEstado === 'ACEPTADO_PARCIALMENTE' ? '1px solid var(--partial-color)' : '1px solid var(--border-color)',
                      }}
                      onClick={() => cambiarEstado('ACEPTADO_PARCIALMENTE')}
                    >
                      {tempEstado === 'ACEPTADO_PARCIALMENTE' ? '◐ ACEPTADO PARCIALMENTE' : 'MARCAR ACEPTADO PARCIALMENTE'}
                    </button>
                    <button
                      className={`btn-status ${tempEstado === 'RECHAZADO' ? 'active' : ''}`}
                      style={{
                        background: tempEstado === 'RECHAZADO' ? 'rgba(239,68,68,0.18)' : 'transparent',
                        color: tempEstado === 'RECHAZADO' ? 'var(--danger-color)' : 'var(--text-dim)',
                        border: tempEstado === 'RECHAZADO' ? '1px solid var(--danger-color)' : '1px solid var(--border-color)',
                      }}
                      onClick={() => cambiarEstado('RECHAZADO')}
                    >
                      {tempEstado === 'RECHAZADO' ? '✕ RECHAZADO' : 'MARCAR RECHAZADO'}
                    </button>
                    <button
                      className={`btn-status ${tempEstado === 'MATRICULADO' ? 'active' : ''}`}
                      style={{
                        background: tempEstado === 'MATRICULADO' ? 'rgba(20,184,166,0.18)' : 'transparent',
                        color: tempEstado === 'MATRICULADO' ? 'var(--final-color)' : 'var(--text-dim)',
                        border: tempEstado === 'MATRICULADO' ? '1px solid var(--final-color)' : '1px solid var(--border-color)',
                      }}
                      onClick={() => setConfirmarMatricular(true)}
                    >
                      {tempEstado === 'MATRICULADO' ? '🔒 MATRICULADO' : 'MARCAR MATRICULADO'}
                    </button>
                    <button className="btn-status btn-pending" onClick={() => cambiarEstado('PENDIENTE')}>
                      VOLVER A PENDIENTE
                    </button>
                  </div>
                  )}
                  {tempEstado === 'MATRICULADO' && !reclamoCerrado && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--warn-color)', marginTop: 8, lineHeight: 1.45 }}>
                      ⚠ Al enviar la respuesta este reclamo quedará cerrado y su estado ya no podrá cambiarse.
                    </p>
                  )}
                </div>

                {/* Comentario interno */}
                <div className="sidebar-group">
                  <label className="sidebar-label">NOTA INTERNA</label>
                  <textarea
                    value={tempComentario}
                    onChange={e => setTempComentario(e.target.value)}
                    onBlur={guardarNotaInterna}
                    readOnly={isSoloLectura}
                    placeholder="Comentario interno (no se envía al estudiante)..."
                    rows={3}
                    style={{
                      width: '100%', background: 'var(--surface-color)',
                      border: '1px solid var(--border-color)', borderRadius: 8,
                      color: 'var(--text-main)', fontSize: '0.82rem',
                      padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Info académica */}
                {reclamoRS.maxCreditos && (
                  <div className="sidebar-group">
                    <label className="sidebar-label">INFO ACADÉMICA</label>
                    <div className="glass-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="detail-item">
                        <label>MÁX. CRÉDITOS</label>
                        <p style={{ fontWeight: 700 }}>{reclamoRS.maxCreditos}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sin botón de guardar: el estado y la nota se guardan solos.
                    Este aviso es lo único que lo confirma. */}
                {(updating || saved) && (
                  <p style={{
                    fontSize: '0.74rem', fontWeight: 600, textAlign: 'center', margin: '4px 0 8px',
                    color: saved ? 'var(--ok-color)' : 'var(--text-dim)',
                  }}>
                    {updating ? 'Guardando...' : 'Guardado ✓'}
                  </p>
                )}

                {/* Responder al estudiante */}
                <div className="sidebar-group">
                  <label className="sidebar-label" style={{ marginBottom: 8 }}>
                    {isSoloLectura ? 'RESPUESTAS AL ESTUDIANTE' : 'RESPONDER AL ESTUDIANTE'}
                    {emailSent && <span style={{ color: 'var(--ok-color)', marginLeft: 8, fontSize: '0.75rem' }}>✓ Correo enviado</span>}
                  </label>
                  {!isSoloLectura && (<>
                  <textarea
                    value={respuestaTexto}
                    onChange={e => setRespuestaTexto(e.target.value)}
                    placeholder={`Escribe la respuesta que recibirá ${selectedReclamo.nombre?.split(' ')[0] || 'el estudiante'} por correo...`}
                    rows={5}
                    style={{
                      width: '100%', background: 'var(--surface-color)',
                      border: '1px solid var(--border-color)', borderRadius: 8,
                      color: 'var(--text-main)', fontSize: '0.82rem',
                      padding: '10px 12px', resize: 'vertical', fontFamily: 'inherit',
                      boxSizing: 'border-box', marginBottom: 8,
                    }}
                  />
                  <button
                    className="btn btn-primary full-width"
                    onClick={handleEnviarRespuesta}
                    disabled={sending || !respuestaTexto.trim()}
                    style={{
                      background: sending ? undefined
                        : tempEstado === 'RECHAZADO' ? 'rgba(239,68,68,0.15)'
                        : tempEstado === 'ACEPTADO_PARCIALMENTE' ? 'rgba(249,115,22,0.15)'
                        : tempEstado === 'ACEPTADO' ? 'rgba(52,211,153,0.15)'
                        : 'transparent',
                      borderColor: tempEstado === 'RECHAZADO' ? 'var(--danger-color)'
                        : tempEstado === 'ACEPTADO_PARCIALMENTE' ? 'var(--partial-color)'
                        : tempEstado === 'ACEPTADO' ? 'var(--ok-color)'
                        : 'var(--border-color)',
                      color: tempEstado === 'RECHAZADO' ? 'var(--danger-color)'
                        : tempEstado === 'ACEPTADO_PARCIALMENTE' ? 'var(--partial-color)'
                        : tempEstado === 'ACEPTADO' ? 'var(--ok-color)'
                        : 'var(--text-main)',
                    }}
                  >
                    {sending
                      ? 'ENVIANDO...'
                      : tempEstado === 'RECHAZADO'
                        ? 'ENVIAR CORREO Y RECHAZAR ✕'
                        : tempEstado === 'ACEPTADO_PARCIALMENTE'
                          ? 'ENVIAR CORREO Y ACEPTAR EN PARTE ◐'
                          : tempEstado === 'ACEPTADO'
                            ? 'ENVIAR RESPUESTA Y ACEPTAR ✓'
                            : 'ENVIAR RESPUESTA'}
                  </button>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' }}>
                    Enviará un correo a {selectedReclamo.email}
                    {ESTADOS_RESUELTOS.includes(tempEstado)
                      ? <> y marcará como {estadoLabel(tempEstado)}</>
                      : <> y lo dejará en {estadoLabel(tempEstado)}</>}
                  </p>
                  </>)}

                  {/* Un registro por cada envío, no solo el último: si hubo dos
                      idas y vueltas, el admin necesita ver qué se dijo la
                      primera vez, no solo lo más reciente. */}
                  {historialLoading && (
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 10 }}>Cargando historial de envíos...</p>
                  )}
                  {!historialLoading && historialRespuestas.length > 0 && (
                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                        Historial de envíos
                      </p>
                      {historialRespuestas.map((h, i) => (
                        <div key={i} style={{
                          background: 'var(--surface-color)', border: '1px solid var(--border-color)',
                          borderRadius: 8, padding: '10px 12px',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Correo {i + 1} enviado</span>
                            <span style={{
                              fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                              color: h.estado === 'RECHAZADO' ? 'var(--danger-color)'
                                : h.estado === 'ACEPTADO_PARCIALMENTE' ? 'var(--partial-color)'
                                : 'var(--ok-color)',
                              background: h.estado === 'RECHAZADO' ? 'rgba(239,68,68,0.12)'
                                : h.estado === 'ACEPTADO_PARCIALMENTE' ? 'rgba(249,115,22,0.12)'
                                : 'rgba(52,211,153,0.12)',
                            }}>{estadoLabel(h.estado)}</span>
                          </div>
                          <p style={{ fontSize: '0.78rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap', margin: '0 0 4px' }}>{h.mensaje}</p>
                          <p style={{ fontSize: '0.68rem', color: 'var(--text-dim)', margin: 0 }}>{fmtDate(h.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ QUÉ HIZO Y CUÁNDO — panel al pulsar un apodo ═══════════════ */}
      {detalleAtencion && (
        <div className="modal-overlay" onClick={() => setDetalleAtencion(null)}>
          {/* --modal-surface, no --surface-color: .glass-card trae fondo
              translúcido más su propio backdrop-filter, pensado para tarjetas
              sobre la página. Sobre un overlay ya desenfocado, eso se veía
              transparente encima de lo borroso de detrás. */}
          <div className="glass-card" style={{ width: '100%', maxWidth: 420, padding: 24, background: 'var(--modal-surface)', boxShadow: 'var(--modal-shadow)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <h3 style={{ margin: 0 }}>{apodoDe(detalleAtencion.email)}</h3>
              <span className="code-badge id-badge">{detalleAtencion.reclamoId}</span>
            </div>
            <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem', marginBottom: 18 }}>{detalleAtencion.email}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {detalleAtencion.eventos.map((ev, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  paddingBottom: 10, borderBottom: i < detalleAtencion.eventos.length - 1 ? '1px solid var(--border-color)' : 'none',
                }}>
                  <span style={{ fontSize: '0.85rem' }}>{accionLabel(ev)}</span>
                  <span className="date-text" style={{ whiteSpace: 'nowrap' }}>{fmtDate(ev.fecha)}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary btn-small" style={{ marginTop: 20, width: '100%' }}
              onClick={() => setDetalleAtencion(null)}>
              CERRAR
            </button>
          </div>
        </div>
      )}

      {/* ── Confirmar el cierre del reclamo ── */}
      {confirmarMatricular && selectedReclamo && (
        <div className="modal-overlay" onClick={() => setConfirmarMatricular(false)}>
          <div
            className="glass-card"
            style={{ width: '100%', maxWidth: 420, padding: 26, background: 'var(--modal-surface)', boxShadow: 'var(--modal-shadow)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 14px', color: 'var(--final-color)' }}>Esta decisión es irreversible</h3>
            <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-main)', margin: '0 0 10px' }}>
              Vas a marcar el reclamo <span className="code-badge id-badge">{selectedReclamo.id}</span> como{' '}
              <strong>MATRICULADO</strong>, que es el estado final: después <strong>no podrás cambiarlo</strong>.
            </p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: '0 0 22px' }}>
              El estudiante no se entera todavía: seguirá sin novedades hasta que le envíes la respuesta.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-small" style={{ flex: 1 }}
                onClick={() => setConfirmarMatricular(false)}>
                CANCELAR
              </button>
              <button className="btn btn-primary btn-small" style={{ flex: 1 }}
                onClick={confirmarYMatricular}>
                SÍ, MATRICULAR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar que se le vuelve a escribir al estudiante ── */}
      {confirmarReenvio && (
        <div className="modal-overlay" onClick={() => setConfirmarReenvio(null)}>
          {/* --modal-surface y no la traslucidez de .glass-card, por lo mismo
              que el panel de "qué hizo y cuándo": sobre el overlay desenfocado
              se vería transparente. */}
          <div
            className="glass-card"
            style={{ width: '100%', maxWidth: 420, padding: 26, background: 'var(--modal-surface)', boxShadow: 'var(--modal-shadow)' }}
            onClick={e => e.stopPropagation()}
          >
            {confirmarReenvio.esFinal ? (
              <>
                <h3 style={{ margin: '0 0 14px', color: 'var(--final-color)' }}>Esta decisión es irreversible</h3>
                <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-main)', margin: '0 0 10px' }}>
                  Vas a marcar el reclamo <span className="code-badge id-badge">{confirmarReenvio.id}</span> como{' '}
                  <strong>MATRICULADO</strong>, que es el estado final: después <strong>no podrás cambiarlo</strong>.
                </p>
                {confirmarReenvio.enviados > 0 && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-dim)', margin: '0 0 10px' }}>
                    Por este reclamo ya se {confirmarReenvio.enviados === 1 ? 'envió 1 correo' : `enviaron ${confirmarReenvio.enviados} correos`}.
                  </p>
                )}
                <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', margin: '0 0 22px' }}>
                  ¿Enviar el correo y cerrar el reclamo?
                </p>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 14px' }}>Ya le escribieron antes</h3>
                <p style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-main)', margin: '0 0 6px' }}>
                  A este estudiante {confirmarReenvio.enviados === 1
                    ? <>ya se le envió <strong>1 correo</strong></>
                    : confirmarReenvio.enviados > 1
                      ? <>ya se le enviaron <strong>{confirmarReenvio.enviados} correos</strong></>
                      : <>ya se le <strong>respondió antes</strong></>} por el reclamo{' '}
                  <span className="code-badge id-badge">{confirmarReenvio.id}</span>
                </p>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-dim)', margin: '0 0 22px' }}>
                  ¿Enviar otro correo?
                </p>
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary btn-small"
                style={{ flex: 1 }}
                onClick={() => setConfirmarReenvio(null)}
              >
                CANCELAR
              </button>
              <button
                className="btn btn-primary btn-small"
                style={{ flex: 1 }}
                onClick={enviarRespuesta}
              >
                {confirmarReenvio.esFinal ? 'SÍ, MATRICULAR' : 'ENVIAR DE NUEVO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ ESTUDIANTE MODAL ═══════════════ */}
      {selectedEstudiante && (
        <div className="modal-overlay" onClick={() => setSelectedEstudiante(null)}>
          <div className="modal-content glass-card animate-in" style={{ maxWidth: '1200px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2>{estudianteDP.nombre || selectedEstudiante.email}</h2>
                <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', marginTop: 4 }}>
                  {selectedEstudiante.codigo_estudiante
                    ? `${selectedEstudiante.codigo_estudiante} · ${estudianteDP.especialidad || '—'}`
                    : selectedEstudiante.email}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {!estudianteDP.nombre && (
                  <span className="status-badge" style={{ background: 'rgba(251,191,36,0.15)', color: 'var(--warn-color)' }}>
                    SIN PARSEAR
                  </span>
                )}
                {estudianteRS.enRiesgo && <span className="status-badge status-red">EN RIESGO</span>}
                <button className="close-btn" onClick={() => setSelectedEstudiante(null)}>CERRAR [X]</button>
              </div>
            </div>

            {/* Tab navigation */}
            <div style={{ display: 'flex', gap: 4, padding: '0 32px', borderBottom: '1px solid var(--border-color)' }}>
              {[
                { id: 'perfil',   label: 'PERFIL' },
                { id: 'malla',    label: 'MALLA CURRICULAR' },
                { id: 'horario',  label: 'HORARIO' },
                { id: 'pdfs',     label: 'DOCUMENTOS PDF' },
                { id: 'reclamos', label: `RECLAMOS${estudianteReclamos.length ? ` (${estudianteReclamos.length})` : ''}` },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id)}
                  style={{
                    padding: '10px 18px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    border: 'none',
                    borderBottom: modalTab === tab.id ? '2px solid var(--primary-accent)' : '2px solid transparent',
                    background: 'none',
                    color: modalTab === tab.id ? 'var(--primary-accent)' : 'var(--text-dim)',
                    cursor: 'pointer',
                    transition: 'color 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className={`modal-body premium-scroll${(modalTab === 'malla' || modalTab === 'horario') ? ' modal-canvas' : ''}`} style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 160px)', padding: (modalTab === 'malla' || modalTab === 'horario') ? '16px' : '40px' }}>

              {/* ── TAB: MALLA CURRICULAR ── */}
              {modalTab === 'malla' && (
                mallaData.rawAvance.length > 0
                  ? <MallaCurricular
                      cursosAprobados={mallaData.cursosAprobados}
                      cursosInscritos={mallaData.cursosInscritos}
                      aptoCodes={mallaData.aptoCodes}
                      rawAvance={mallaData.rawAvance}
                      porCiclo={mallaData.porCiclo}
                      boletaCursos={selectedEstudiante?.datos_parseados?.boletaMatricula?.cursos ?? []}
                    />
                  : <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
                      <p style={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                        Sin datos de avance curricular. Los PDFs aún no fueron procesados para este estudiante.
                      </p>
                    </div>
              )}

              {/* ── TAB: HORARIO ── */}
              {modalTab === 'horario' && (() => {
                const boletaCursos = selectedEstudiante?.datos_parseados?.boletaMatricula?.cursos ?? [];
                // Cursos habilitados = aprobados no, pero incluye los ya inscritos (primer ciclo sin historial)
                const habPlanCursos = PLAN_ESTUDIOS_SOFTWARE.filter(c => {
                  const cn = normCode(c.codigo);
                  if (mallaData.cursosAprobados.has(cn)) return false;
                  return c.preRequisitos.every(p => mallaData.cursosAprobados.has(normCode(p)));
                });
                return (
                  <HorarioCursos
                    cursos={boletaCursos}
                    aptoCursos={habPlanCursos}
                  />
                );
              })()}

              {/* ── TAB: PDFs ── */}
              {/* Los reclamos del estudiante. Se cruzan por correo, no por
                  código: el código solo se rellena al parsear los documentos y
                  la mayoría de fichas lo tiene vacío, así que el cruce fallaría
                  para casi todos. */}
              {modalTab === 'reclamos' && (
                <div className="detail-section">
                  {estudianteReclamos.length === 0 ? (
                    <p style={{ color: 'var(--text-dim)', fontSize: '0.9rem' }}>
                      Este estudiante no ha enviado ningún reclamo.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[...estudianteReclamos]
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .map(r => {
                          const de = r.datos_estudiante || {};
                          const cursos = [
                            ...(de.cursosRetirar || []).map(c => ({ ...c, tipo: 'RETIRAR' })),
                            ...(de.cursosMatricular || []).map(c => ({ ...c, tipo: 'MATRICULAR' })),
                          ];
                          return (
                            <div key={r.id} className="glass-card" style={{ padding: 16, cursor: 'pointer' }}
                              onClick={() => { setSelectedEstudiante(null); setSelectedReclamo(r); }}
                              title="Abrir este reclamo">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                                <span className="code-badge id-badge">{r.id}</span>
                                <span className={`status-badge ${estadoClass(r.estado)}`} title={estadoLabel(r.estado)}>{estadoLabelCorto(r.estado)}</span>
                                <span className="date-text" style={{ marginLeft: 'auto' }}>{fmtDate(r.created_at)}</span>
                              </div>
                              <p style={{ fontSize: '0.85rem', margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>
                                {(r.descripcion || '').slice(0, 240)}{(r.descripcion || '').length > 240 ? '…' : ''}
                              </p>
                              {cursos.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                  {cursos.map(c => (
                                    <span key={`${c.tipo}-${c.codigo}-${c.seccion}`} className="code-badge"
                                      style={{ fontSize: '0.68rem', color: c.tipo === 'RETIRAR' ? 'var(--danger-color)' : 'var(--ok-color)' }}>
                                      {c.tipo === 'RETIRAR' ? '−' : '+'} {c.codigo} · {c.seccion}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {modalTab === 'pdfs' && (
                <div className="detail-section" style={{ margin: 0 }}>
                  <div className="files-preview-container">
                    {[
                      { key: 'ficha',  label: 'Ficha Académica',    raw: selectedEstudiante.record_matricula_url || storageUrl(selectedEstudiante.email, 'ficha') },
                      { key: 'boleta', label: 'Boleta de Matrícula', raw: selectedEstudiante.boleta_url          || storageUrl(selectedEstudiante.email, 'boleta') },
                      { key: 'avance', label: 'Avance Curricular',   raw: selectedEstudiante.record_notas_url   || storageUrl(selectedEstudiante.email, 'avance') },
                    ].map(doc => { const url = signedDocs[doc.raw]; return (
                      <div key={doc.key} className="preview-card glass-card">
                        <div className="preview-header">
                          <span className="file-label">{doc.label}</span>
                          {url && <a href={url} target="_blank" rel="noreferrer" className="link-text">ABRIR ORIGINAL</a>}
                        </div>
                        <div className="preview-frame">
                          {url === false ? <p>No se pudo cargar el documento.</p>
                            : url ? <iframe src={url} title={doc.label} width="100%" height="400px" frameBorder="0" />
                            : <p>Cargando documento…</p>}
                        </div>
                      </div>
                    ); })}
                  </div>
                </div>
              )}

              {/* ── TAB: PERFIL ── */}
              {modalTab === 'perfil' && <>

              {/* Banner cuando los PDFs aún no se parsearon */}
              {!estudianteDP.nombre && (
                <div className="glass-card" style={{
                  padding: '16px 20px', marginBottom: 32,
                  borderLeft: '4px solid var(--warn-color)',
                  background: 'rgba(251,191,36,0.06)',
                }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: '1 1 300px' }}>
                      <p style={{ color: 'var(--warn-color)', fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
                        ⚠ Datos académicos pendientes de parsear
                      </p>
                      <p style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                        {extrayendo
                          ? 'Descargando sus PDF y extrayendo los datos…'
                          : 'Sus PDF están en Storage pero todavía no se han procesado. Puedes extraerlos ahora: se leen aquí mismo y se guarda el resultado.'}
                      </p>
                    </div>
                    {!isSoloLectura && (
                      <button
                        className="btn btn-primary btn-small"
                        style={{ flexShrink: 0 }}
                        disabled={extrayendo}
                        onClick={() => extraerDatosEstudiante(selectedEstudiante.email)}
                      >
                        {extrayendo ? 'EXTRAYENDO...' : 'EXTRAER DATOS'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="detail-section">
                <h3>Datos Personales</h3>
                <div className="detail-grid">
                  <div className="detail-item"><label>NOMBRE</label><p>{estudianteDP.nombre || '—'}</p></div>
                  <div className="detail-item">
                    <label>CÓDIGO</label>
                    <p>{selectedEstudiante.codigo_estudiante || estudianteDP.codigo || '—'}</p>
                  </div>
                  <div className="detail-item"><label>ESPECIALIDAD</label><p>{estudianteDP.especialidad || '—'}</p></div>
                  <div className="detail-item"><label>PLAN DE ESTUDIO</label><p>{estudianteDP.planEstudio || '—'}</p></div>
                  <div className="detail-item">
                    <label>CICLO RELATIVO</label>
                    <p>{estudianteDP.cicloRelativo ? `${estudianteDP.cicloRelativo}°` : '—'}</p>
                  </div>
                  <div className="detail-item">
                    <label>SEMESTRE INGRESO</label>
                    <p>{estudianteDP.semestreIngreso || selectedEstudiante.datos_parseados?._contacto?.semestreIngreso || '—'}</p>
                  </div>
                  <div className="detail-item"><label>MODALIDAD</label><p>{estudianteDP.modalidad || '—'}</p></div>
                  <div className="detail-item">
                    <label>CORREO</label>
                    <a href={`mailto:${selectedEstudiante.email}`} className="whatsapp-link" style={{ color: 'var(--primary-accent)' }}>
                      {selectedEstudiante.email}
                    </a>
                  </div>
                  {(estudianteDP.telefono || selectedEstudiante.datos_parseados?._contacto?.telefono) && (
                    <div className="detail-item">
                      <label>TELÉFONO</label>
                      {(() => {
                        const tel = estudianteDP.telefono || selectedEstudiante.datos_parseados._contacto.telefono;
                        return (
                          <a href={`https://wa.me/${tel.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="whatsapp-link">
                            {tel}
                          </a>
                        );
                      })()}
                    </div>
                  )}
                  {selectedEstudiante.datos_parseados?._contacto?.turno && (
                    <div className="detail-item">
                      <label>TURNO</label>
                      <p>{selectedEstudiante.datos_parseados._contacto.turno}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-section">
                {/* El botón se queda aunque ya esté parseado: los criterios del
                    parseo cambian (el riesgo académico, sin ir más lejos) y hay
                    que poder rehacerlo sobre alguien ya procesado. */}
                <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span>Resumen Académico</span>
                  {!isSoloLectura && (
                    <button
                      className="btn btn-secondary btn-small"
                      onClick={() => extraerDatosEstudiante(selectedEstudiante.email)}
                      disabled={extrayendo}
                      title="Descarga sus PDF y vuelve a extraer los datos académicos"
                    >
                      {extrayendo
                        ? 'EXTRAYENDO...'
                        : estudianteRS.promedioPonderado ? 'VOLVER A PARSEAR' : 'PARSEAR'}
                    </button>
                  )}
                </h3>
                {!estudianteRS.promedioPonderado ? (
                  <p style={{ color: 'var(--text-dim)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                    No disponible — los PDFs aún no fueron procesados.
                  </p>
                ) : (
                  <div className="detail-grid">
                    <div className="detail-item">
                      <label>PROMEDIO PONDERADO</label>
                      {/* Sin color de riesgo: el riesgo lo decide haber repetido
                          un curso, no el promedio. Pintarlo de rojo aquí hacía
                          creer que el promedio era el motivo. */}
                      <p style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                        {estudianteRS.promedioPonderado}
                      </p>
                    </div>
                    <div className="detail-item">
                      <label>MÁX. CRÉDITOS PERMITIDOS</label>
                      <p style={{ fontWeight: 700, fontSize: '1.2rem' }}>{estudianteRS.maxCreditos ?? '—'}</p>
                    </div>
                    <div className="detail-item">
                      <label>ESTADO ACADÉMICO</label>
                      <p style={{ color: estudianteRS.enRiesgo ? 'var(--danger-color)' : 'var(--ok-color)', fontWeight: 600 }}>
                        {estudianteRS.enRiesgo
                          ? '⚠️ En riesgo (desaprobó un curso 2+ veces)'
                          : '✓ Sin riesgo académico'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {estudianteBoleta.cursos?.length > 0 && (
                <div className="detail-section">
                  <h3>
                    Boleta de Matrícula — Ciclo Actual&nbsp;
                    <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>
                      ({estudianteBoleta.totalCursos} cursos · {estudianteBoleta.totalCreditos} créditos)
                    </span>
                  </h3>
                  <div className="cursos-table-wrap glass-card">
                    <table className="cursos-table">
                      <thead>
                        <tr><th>CÓDIGO</th><th>SEC</th><th>DÍA</th><th>HORA</th><th>AULA</th><th>TIPO</th><th>DOCENTE</th></tr>
                      </thead>
                      <tbody>
                        {estudianteBoleta.cursos.filter(c => c.dia).map((c, i) => (
                          <tr key={i}>
                            <td><span className="code-badge">{c.codigo}</span></td>
                            <td>{c.seccion}</td><td>{c.dia}</td><td>{c.hora}</td><td>{c.aula}</td>
                            <td><span className="code-badge">{c.tipo}</span></td>
                            <td style={{ fontSize: '0.75rem' }}>{c.docente}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {estudianteFicha.promedios?.length > 0 && (
                <div className="detail-section">
                  <h3>Ficha Académica — Promedios por Ciclo</h3>
                  <div className="cursos-table-wrap glass-card">
                    <table className="cursos-table">
                      <thead>
                        <tr><th>CICLO</th><th>PROMEDIO</th><th>CRÉDITOS</th></tr>
                      </thead>
                      <tbody>
                        {estudianteFicha.promedios.map((p, i) => (
                          <tr key={i}>
                            <td><span className="code-badge">{p.ciclo}</span></td>
                            <td style={{ fontWeight: 700, color: parseFloat(p.promedio) >= 10.5 ? 'var(--ok-color)' : 'var(--danger-color)' }}>
                              {p.promedio}
                            </td>
                            <td>{p.creditos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {estudianteReclamos.length > 0 && (
                <div className="detail-section">
                  <h3>Reclamos Registrados ({estudianteReclamos.length})</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {estudianteReclamos.map(r => (
                      <div key={r.id} className="glass-card"
                        style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span className="code-badge id-badge" style={{ marginRight: 12 }}>{r.id}</span>
                          <span style={{ fontSize: '0.9rem' }}>{r.categoria}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <span className="date-text">{fmtDateShort(r.created_at)}</span>
                          <span className={`status-badge ${estadoClass(r.estado)}`} title={estadoLabel(r.estado)}>{estadoLabelCorto(r.estado)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              </>}

            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="error-toast glass-card">
          <p>{error}</p>
          <button onClick={() => setError(null)}>X</button>
        </div>
      )}
    </div>
  );
}

export default App;
