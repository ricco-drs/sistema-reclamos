import { useState, useRef, useEffect } from 'react';
import { PLAN_ESTUDIOS_SOFTWARE } from '../../../data/planEstudios';
import CURSOS_SECCIONES from '../../../data/cursos_secciones.json';
import { correoPermitido } from '../../../utils/correosPermitidos';

// Por ahora TEFIIS solo tramita reclamos de Matrícula, así que se selecciona
// automáticamente y no se muestra un paso de elección de categoría.
export const CATEGORIAS = [
  { id: 'matricula', label: 'Matrícula' },
];

// Las cuatro especialidades de la FIIS. El nombre va completo porque es el que
// viaja con el reclamo y el que el panel admin usa para filtrar: allí clasifica
// por palabra clave (INDUSTRIAL, SISTEMAS, SOFTWARE, INTELIGENCIA), así que
// estos textos tienen que contenerlas.
//
// La declara el estudiante desde que el parseo salió de esta app: antes la
// especialidad se leía de su ficha, y sin parseo el filtro por carrera del
// panel se quedaría vacío para todos los reclamos nuevos.
// Cursos aperturados con sus secciones, sacados del cuadro oficial. El
// estudiante elige de aquí en vez de escribir a mano: un código inventado o una
// sección que no existe convierte el reclamo en algo que el Tercio no puede
// tramitar sin volver a preguntarle.
export const CURSOS = CURSOS_SECCIONES as { codigo: string; nombre: string; secciones: string[] }[];

export interface CursoElegido {
  codigo: string;
  nombre: string;
  seccion: string;
}

export const CARRERAS_FIIS = [
  'Ingeniería Industrial',
  'Ingeniería de Sistemas',
  'Ingeniería de Software',
  'Ingeniería de Inteligencia Artificial',
];

export const TIPOS_PROBLEMA_MATRICULA = [
  'Error en carga horaria', 'Matrícula rechazada', 'Problemas con reserva',
  'Conflicto de horario', 'Convalidación pendiente', 'Otro'
];

// El backend guarda datos_parseados en formato anidado (resumen, datosPersonales,
// boletaMatricula, avanceCurricular). El resto de la app (resumen del chat, datosEstudiante)
// espera los mismos campos planos que produce utils/pdfParser.ts. Esta función replica
// esa derivación para poder usar datos ya guardados sin volver a parsear los PDFs.
function derivarDatosPlanos(nested: any) {
  const dp = nested?.datosPersonales || {};
  const jalados = (nested?.avanceCurricular?.cursos || [])
    .filter((c: any) => c.veces > 1 || (c.nota !== null && c.nota < 10));
  const cursosEnBoleta = [...new Set((nested?.boletaMatricula?.cursos || []).map((c: any) => c.codigo))];

  return {
    codigo: dp.codigo,
    nombre: dp.nombre,
    especialidad: dp.especialidad,
    correo: dp.correo,
    telefono: dp.telefono,
    ciclo: dp.cicloRelativo,
    semestreIngreso: dp.semestreIngreso,
    turno: dp.turno,
    planEstudio: dp.planEstudio,
    promedioPonderadoFinal: nested?.resumen?.promedioPonderado || 'No calculado',
    maxCreditosMatricula: nested?.resumen?.maxCreditos ?? 'N/A',
    enRiesgoAcademico: nested?.resumen?.enRiesgo,
    creditosMatriculados: (nested?.boletaMatricula?.totalCreditos ?? 0).toString(),
    cursosMatriculados: cursosEnBoleta.length.toString(),
    historialJalados: jalados.map((j: any) => `${j.codigo}(${j.veces}v)`).join(', ') || 'Ninguno',
    observaciones: (nested?.avanceCurricular?.observaciones || []).join(', ') || 'Ninguna',
  };
}

// Prueba opcional que el estudiante adjunta al reclamo: un único PDF. El tope y
// el tipo se repiten en el backend, que es quien manda; aquí solo se evita una
// subida que ya se va a rechazar, para no gastar la red del estudiante.
const MAX_EVIDENCIAS = 1;

export interface Evidencia {
  ref: string;      // referencia al archivo en el bucket privado, no descargable por sí sola
  nombre: string;   // nombre original, solo para mostrar
  tipo: string;     // mime declarado por el navegador
  bytes: number;
}

export function useReclamos(onDocumentsProcessed?: (data: any) => void, emailSesion?: string | null, sessionToken?: string | null) {
  // ── Verificación ──────────────────────────────────────────────────────────
  // Si viene sesión global, saltamos directamente al menú
  const [etapa, setEtapa] = useState(emailSesion ? 'menu' : 'verificacion_email');
  const [emailInput, setEmailInput] = useState('');
  const [codigoInput, setCodigoInput] = useState('');
  const [emailVerificado, setEmailVerificado] = useState<string | null>(emailSesion || null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  // Si el estudiante llega directo a "Reclamos" sin pasar por el login del top-nav,
  // este hook verifica su email por su cuenta y guarda su propio token de sesión.
  const [tokenInterno, setTokenInterno] = useState<string | null>(null);
  const activeToken = sessionToken || tokenInterno;

  // Sincroniza si el usuario se loguea DESPUÉS de que el panel ya estaba montado
  useEffect(() => {
    if (emailSesion && !emailVerificado) {
      setEmailVerificado(emailSesion);
      setEtapa('menu');
    }
  }, [emailSesion]);

  useEffect(() => {
    if (!emailVerificado || !activeToken) return;
    cargarDocsGuardados(emailVerificado, activeToken);
  }, [emailVerificado, activeToken]);

  // ── Reclamo ───────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<any[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<any>(null);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [datosEstudiante, setDatosEstudiante] = useState<any>({});
  const [datosAvanzados, setDatosAvanzados] = useState<any>(null);
  const [archivos, setArchivos] = useState<any>({ ficha: null, boleta: null, avance: null });
  // Qué archivo se rechazó y por qué. Se comprueba aquí y no solo en el
  // servidor: el servidor rechaza el archivo nada más ver su cabecera y corta
  // la conexión con la subida en curso, así que el móvil no llega a leer la
  // respuesta y el navegador lanza "Failed to fetch" — un error de red que no
  // explica nada. Comprobándolo antes, ni se sube ni hay nada que malinterpretar.
  const [errorArchivo, setErrorArchivo] = useState('');

  const esPdf = (file: File) =>
    file.type === 'application/pdf' && /\.pdf$/i.test(file.name || '');

  // Devuelve el archivo si vale; si no, deja el aviso puesto y devuelve null.
  const validarPdf = (file: File | undefined | null): File | null => {
    if (!file) return null;
    if (esPdf(file)) { setErrorArchivo(''); return file; }
    const ext = (file.name.split('.').pop() || '').toUpperCase();
    setErrorArchivo(
      `"${file.name}" no es un PDF${ext && ext.length <= 5 ? ` (es un archivo ${ext})` : ''}. `
      + 'Los documentos deben estar en formato PDF. Si tienes una foto, conviértela a PDF antes de subirla.'
    );
    return null;
  };
  const [procesandoPdfs, setProcesandoPdfs] = useState(false);
  // null = todavía no responde. La respuesta ya no cambia qué documentos se
  // exigen —la boleta es opcional en ambos casos— pero se conserva porque viaja
  // con el reclamo: al Tercio le dice si el alumno llegó a matricularse.
  const [matriculado, setMatriculado] = useState<boolean | null>(null);
  const [carrera, setCarrera] = useState<string | null>(null);
  // Código y nombre los declara el estudiante desde que el parseo salió de esta
  // app: antes salían de su ficha académica, y sin ellos el panel admin mostraba
  // los reclamos nuevos sin nombre ni código en la lista.
  const [codigoUni, setCodigoUni] = useState('');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [errorPaso, setErrorPaso] = useState('');
  const [camposManual, setCamposManual] = useState<any>({});

  // ── Envío y consulta ──────────────────────────────────────────────────────
  const [enviandoFormal, setEnviandoFormal] = useState(false);
  const enviandoRef = useRef(false);
  // El reclamo se registró pero su correo de acuse no salió. Se avisa sin
  // presentarlo como un fallo del envío, que es lo que provocaba reintentos.
  const [avisoCorreo, setAvisoCorreo] = useState(false);
  const [reclamoEnviado, setReclamoEnviado] = useState<any>(null);
  const [reclamosExistentes, setReclamosExistentes] = useState<any[]>([]);
  const [loadingConsulta, setLoadingConsulta] = useState(false);
  // Detalle del reclamo abierto desde "Mis reclamos": null = ninguno abierto.
  const [reclamoDetalle, setReclamoDetalle] = useState<any>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [descripcionFormal, setDescripcionFormal] = useState('');
  // Cursos que el estudiante pide retirar o llevar. Ambos arrancan vacíos: el
  // reclamo puede no ir de cursos concretos, así que no se obliga a elegir.
  const [cursosRetirar, setCursosRetirar] = useState<CursoElegido[]>([]);
  const [cursosMatricular, setCursosMatricular] = useState<CursoElegido[]>([]);
  const [archivosUrls, setArchivosUrls] = useState<Record<string, string>>({});
  // Pruebas opcionales del reclamo (capturas, cartas, resoluciones). Se suben
  // apenas se eligen para que el envío no dependa de la red del estudiante en
  // el último paso, y quedan en su carpeta privada hasta que envía el reclamo.
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [subiendoEvidencia, setSubiendoEvidencia] = useState(false);
  const [errorEvidencia, setErrorEvidencia] = useState<string | null>(null);
  const [usuarioExplicado, setUsuarioExplicado] = useState(false);
  // true si el estudiante tiene documentos guardados cuya extracción quedó
  // completa, vengan de donde vengan. Antes exigía que se hubieran usado en un
  // reclamo ya enviado (_confirmadoEnReclamo), y eso dejaba fuera justo los que
  // sube desde su perfil, que existe precisamente "para usar en reclamos": los
  // veía guardados ahí y aun así el trámite se los volvía a pedir.
  const [docsReutilizables, setDocsReutilizables] = useState(false);

  const messagesEndRef = useRef(null);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';

  const NOMBRE_DOC: Record<string, string> = {
    ficha: 'la Ficha Académica', boleta: 'la Boleta de Matrícula', avance: 'el Avance Curricular',
  };

  const uploadDoc = async (file: File, tipo: 'ficha' | 'boleta' | 'avance'): Promise<string> => {
    if (!emailVerificado) throw new Error('Debes verificar tu correo antes de subir documentos.');
    // El servidor lo rechazaría igual, pero cortando la conexión a media subida:
    // en el móvil eso se ve como un fallo de red en vez de como lo que es.
    if (!esPdf(file)) throw new Error(`"${file.name}" no es un PDF. Los documentos deben estar en formato PDF`);

    const enviar = async () => {
      const formData = new FormData();
      formData.append('email', emailVerificado);
      formData.append('tipo', tipo);
      formData.append('file', file);
      return fetch(`${apiUrl}/api/docs/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}` },
        body: formData,
      });
    };

    let res: Response;
    try {
      res = await enviar();
    } catch {
      // fetch solo rechaza por fallo de red, nunca por un error del servidor.
      // En móvil pasa con facilidad, así que se reintenta una vez antes de
      // hacerle repetir todo al estudiante.
      await new Promise(r => setTimeout(r, 1500));
      try {
        res = await enviar();
      } catch {
        throw new Error(`se cortó la conexión al subir ${NOMBRE_DOC[tipo]}. Revisa tu señal e inténtalo otra vez`);
      }
    }

    // El cuerpo puede no ser JSON: si el servidor se está reiniciando devuelve
    // una página de error, y entonces res.json() reventaba con un mensaje
    // incomprensible en vez de decir qué pasó.
    let data: any = {};
    try { data = await res.json(); } catch { /* se responde con el estado */ }
    if (!res.ok) {
      if (res.status === 401) throw new Error('tu sesión caducó. Vuelve a verificar tu correo');
      throw new Error(data.error || `el servidor respondió ${res.status} al subir ${NOMBRE_DOC[tipo]}`);
    }
    return data.url;
  };

  // El servidor comprueba la sesión ANTES de leer el archivo. Si el token
  // caducó, responde 401 y cierra con la subida aún en curso; el móvil, que va
  // más lento, no llega a leer esa respuesta y el navegador lanza "Failed to
  // fetch". El estudiante veía un fallo de red cuando en realidad era su sesión.
  // Preguntarlo antes, sin cuerpo, evita todo eso.
  const sesionSigueViva = async (): Promise<boolean> => {
    if (!emailVerificado || !activeToken) return false;
    try {
      const r = await fetch(`${apiUrl}/api/docs/${encodeURIComponent(emailVerificado)}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      return r.status !== 401;
    } catch {
      // Sin red no hay forma de saberlo: se deja seguir y que lo diga la subida.
      return true;
    }
  };

  const agregarEvidencias = async (lista: FileList | File[]) => {
    if (!emailVerificado) {
      setErrorEvidencia('Verifica tu correo antes de adjuntar archivos.');
      return;
    }
    const nuevos = Array.from(lista);
    const espacio = MAX_EVIDENCIAS - evidencias.length;
    if (espacio <= 0) {
      setErrorEvidencia('Ya adjuntaste tu prueba. Quítala si quieres cambiarla por otra.');
      return;
    }

    // El selector ya filtra por PDF, pero se comprueba igual: en algunos
    // navegadores se puede elegir "todos los archivos" y saltarse ese filtro.
    const noPdf = nuevos.slice(0, espacio).find(f => f.type !== 'application/pdf');
    if (noPdf) {
      setErrorEvidencia('La prueba debe ser un archivo PDF.');
      return;
    }

    setErrorEvidencia(nuevos.length > espacio
      ? 'Solo se admite un PDF como prueba; se subió el primero.'
      : null);
    setSubiendoEvidencia(true);
    try {
      // De uno en uno: así un archivo rechazado no arrastra a los demás y el
      // estudiante ve exactamente cuál falló.
      for (const file of nuevos.slice(0, espacio)) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${apiUrl}/api/reclamos/evidencias`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeToken}` },
          body: formData,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErrorEvidencia(`${file.name}: ${data.error || 'no se pudo subir'}`);
          continue;
        }
        setEvidencias(prev => [...prev, data.evidencia]);
      }
    } finally {
      setSubiendoEvidencia(false);
    }
  };

  const quitarEvidencia = async (ref: string) => {
    // Se quita de la lista primero: si el borrado en el servidor falla, el
    // archivo queda huérfano en el bucket pero el reclamo ya no lo referencia,
    // que es lo que le importa al estudiante.
    setEvidencias(prev => prev.filter(e => e.ref !== ref));
    setErrorEvidencia(null);
    fetch(`${apiUrl}/api/reclamos/evidencias?ref=${encodeURIComponent(ref)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${activeToken}` },
    }).catch(e => console.warn('No se pudo borrar la evidencia del servidor:', e.message));
  };

  // Trae el estado más reciente de los documentos guardados del estudiante
  // (pueden haber cambiado en su perfil desde la última vez que se cargaron).
  const cargarDocsGuardados = async (email: string, token?: string | null) => {
    try {
      const r = await fetch(`${apiUrl}/api/docs/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!data) return;

      const urls: Record<string, string> = {};
      if (data.boleta_url) urls.boleta = data.boleta_url;
      if (data.record_notas_url) urls.avance = data.record_notas_url;
      if (data.record_matricula_url) urls.ficha = data.record_matricula_url;
      setArchivosUrls(urls);

      let datosParsed = data.datos_parseados;
      const tieneUrls = data.boleta_url && data.record_notas_url && data.record_matricula_url;
      const incompleto = !datosParsed || !datosParsed.avanceCurricular || !datosParsed.datosPersonales;

      if (tieneUrls && incompleto) {
        try {
          const res = await fetch(`${apiUrl}/api/docs/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              boleta_url: data.boleta_url,
              record_notas_url: data.record_notas_url,
              record_matricula_url: data.record_matricula_url,
              codigo_estudiante: data.codigo_estudiante,
              datos_parseados: datosParsed
            })
          });
          const resData = await res.json();
          if (resData.success && resData.datos_parseados) {
            datosParsed = resData.datos_parseados;
          }
        } catch (err) {
          console.error("Error healing documents on claims mount:", err);
        }
      }

      if (datosParsed) {
        setDatosAvanzados(datosParsed);
        setDatosEstudiante(derivarDatosPlanos(datosParsed));
        if (datosParsed._contacto) setCamposManual(datosParsed._contacto);
        // Se exige extracción completa: ofrecer documentos cuyo parseo falló
        // llevaría al estudiante a un reclamo sin sus datos académicos.
        setDocsReutilizables(!!(datosParsed.datosPersonales && datosParsed.avanceCurricular));
      } else {
        setDatosAvanzados(null);
        setDatosEstudiante({});
        setCamposManual({});
        setDocsReutilizables(false);
      }
    } catch {
      // sin conexión con el backend: se mantiene el estado previo
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMsg = (role: string, content: string, extras: any = {}) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), role, content, ...extras }]);
  };

  // ── Paso 1: Enviar código al email ────────────────────────────────────────
  const handleEnviarCodigo = async () => {
    if (!emailInput.trim()) return;
    if (!correoPermitido(emailInput)) {
      setVerifyError('Solo se permiten correos institucionales UNI (@uni.pe).');
      return;
    }
    setVerifyLoading(true);
    setVerifyError('');
    try {
      const res = await fetch(`${apiUrl}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEtapa('verificacion_codigo');
    } catch (err: any) {
      setVerifyError(err.message);
    } finally {
      setVerifyLoading(false);
    }
  };

  // ── Paso 2: Verificar código ──────────────────────────────────────────────
  const handleVerificarCodigo = async () => {
    if (!codigoInput.trim()) return;
    setVerifyLoading(true);
    setVerifyError('');
    try {
      const res = await fetch(`${apiUrl}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim(), code: codigoInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmailVerificado(emailInput.trim());
      setTokenInterno(data.token);
      setEtapa('menu');
    } catch (err: any) {
      setVerifyError(err.message);
    } finally {
      setVerifyLoading(false);
    }
  };

  // ── Menú: nuevo reclamo ───────────────────────────────────────────────────
  const handleNuevoReclamo = () => {
    setMessages([{
      id: 'bienvenida',
      role: 'assistant',
      content: 'Para poder ayudarte a realizar un reclamo sobre la matrícula, primero necesito saber: ¿llegaste a matricularte?',
    }]);
    setCategoriaSeleccionada(CATEGORIAS[0]);
    setArchivos({ ficha: null, boleta: null, avance: null });
    setMatriculado(null);
    setUsuarioExplicado(false);
    // No resetear archivosUrls, datosEstudiante ni datosAvanzados de entrada: se refrescan abajo
    // por si el estudiante actualizó sus documentos en su perfil desde la última carga.
    setDescripcionFormal('');
    setEtapa('pregunta_matricula');
    if (emailVerificado && activeToken) cargarDocsGuardados(emailVerificado, activeToken);
  };

  // ── Respuesta a "¿llegaste a matricularte?" ───────────────────────────────
  const handleRespuestaMatricula = (valor: boolean) => {
    setMatriculado(valor);
    addMsg('user', valor ? 'Sí, llegué a matricularme.' : 'No, no llegué a matricularme.');
    addMsg('assistant', 'Entendido.');
    preguntarCarrera();
  };

  // Los tres pasos de datos, en orden. Cada mensaje se etiqueta con el paso al
  // que pertenece para poder deshacerlo: al retroceder se borran los mensajes de
  // ese paso en adelante, en vez de dejar en el chat la respuesta equivocada
  // encima de la corregida.
  const PASOS_DATOS = ['carrera', 'codigo', 'nombre'];

  const preguntarCarrera = () => {
    addMsg('assistant', '¿A qué especialidad perteneces?', { paso: 'carrera' });
    setEtapa('pregunta_carrera');
  };

  const preguntarCodigo = () => {
    addMsg('assistant', 'Ahora escribe tu código UNI (por ejemplo: 20231158C).', { paso: 'codigo' });
    setEtapa('pregunta_codigo');
  };

  const preguntarNombre = () => {
    addMsg('assistant', 'Por último, escribe tu nombre completo.', { paso: 'nombre' });
    setEtapa('pregunta_nombre');
  };

  const retrocederA = (paso: string) => {
    const desde = PASOS_DATOS.indexOf(paso);
    if (desde === -1) return;
    setErrorPaso('');
    // Se conservan los mensajes sin paso (los del inicio del flujo) y los de
    // pasos anteriores; el resto se descarta y la pregunta se vuelve a hacer.
    setMessages(prev => prev.filter(m => {
      const i = PASOS_DATOS.indexOf(m.paso);
      return i === -1 || i < desde;
    }));
    if (paso === 'carrera') preguntarCarrera();
    else if (paso === 'codigo') preguntarCodigo();
    else preguntarNombre();
  };

  // ── Respuesta a "¿a qué especialidad perteneces?" ─────────────────────────
  const handleRespuestaCarrera = (valor: string) => {
    setCarrera(valor);
    addMsg('user', valor, { paso: 'carrera' });
    preguntarCodigo();
  };

  // El código UNI son 7 u 8 dígitos y una letra (20231158C). Se valida aquí para
  // que el estudiante lo corrija en el momento y no acabe en un reclamo que el
  // Tercio no pueda cruzar con sus registros.
  const handleRespuestaCodigo = () => {
    const valor = codigoUni.trim().toUpperCase();
    if (!/^\d{7,8}[A-Z]$/.test(valor)) {
      setErrorPaso('El código debe tener 7 u 8 dígitos y una letra al final, como 20231158C.');
      return;
    }
    setErrorPaso('');
    setCodigoUni(valor);
    addMsg('user', valor, { paso: 'codigo' });
    preguntarNombre();
  };

  const handleRespuestaNombre = () => {
    const valor = nombreCompleto.trim().replace(/\s+/g, ' ');
    if (valor.split(' ').length < 2) {
      setErrorPaso('Escribe tu nombre completo, con apellidos.');
      return;
    }
    setErrorPaso('');
    setNombreCompleto(valor);
    addMsg('user', valor, { paso: 'nombre' });
    addMsg('assistant',
      // Quien llegó a matricularse tiene boleta y es el comprobante de lo que
      // se le asignó: sin ella no hay con qué contrastar su reclamo. Quien no
      // se matriculó simplemente no la tiene, así que ahí sigue opcional.
      matriculado === true
        ? 'Gracias. Ahora sube tus fichas académicas en formato PDF:\n- Ficha Académica\n- Avance Curricular\n- Boleta de Matrícula'
        : 'Gracias. Ahora sube tus fichas académicas en formato PDF:\n- Ficha Académica\n- Avance Curricular\n- Boleta de Matrícula _(opcional)_',
      { paso: 'nombre' }
    );
    setEtapa('subir_docs');
  };

  // ── Menú: consultar reclamos ──────────────────────────────────────────────
  const handleConsultarReclamos = async () => {
    setEtapa('consulta');
    // Se entra siempre por la lista: si quedó abierto el detalle de una visita
    // anterior, el estudiante vería ese reclamo en vez de sus reclamos.
    setReclamoDetalle(null);
    setLoadingConsulta(true);
    try {
      const res = await fetch(`${apiUrl}/api/reclamos/mine`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error consultando reclamos');
      setReclamosExistentes(data || []);
    } catch (err) {
      console.error('Error consultando reclamos:', err);
    } finally {
      setLoadingConsulta(false);
    }
  };

  const abrirDetalleReclamo = async (caseId: string) => {
    setLoadingDetalle(true);
    // Se limpia antes de pedir: si queda el anterior en pantalla, el estudiante
    // ve por un instante el estado de otro reclamo como si fuera el que abrió.
    setReclamoDetalle(null);
    try {
      const res = await fetch(`${apiUrl}/api/reclamos/mine/${encodeURIComponent(caseId)}`, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cargar el reclamo');
      setReclamoDetalle(data);
    } catch (err: any) {
      setReclamoDetalle({ error: err.message });
    } finally {
      setLoadingDetalle(false);
    }
  };

  const cerrarDetalleReclamo = () => setReclamoDetalle(null);

  // Permite añadir la boleta cuando el estudiante reusa sus documentos guardados
  // y esa es la única que le falta. Sin esto, la única salida era "Subir nuevos",
  // que obliga a volver a cargar la ficha y el avance que ya tenía.
  const [subiendoBoleta, setSubiendoBoleta] = useState(false);

  const agregarBoletaGuardada = async (file: File) => {
    setSubiendoBoleta(true);
    try {
      const url = await uploadDoc(file, 'boleta');
      setArchivosUrls(prev => ({ ...prev, boleta: url }));
      if (emailVerificado) {
        await fetch(`${apiUrl}/api/docs/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
          body: JSON.stringify({ boleta_url: url }),
        });
      }
    } catch (e: any) {
      alert('No se pudo subir la boleta: ' + e.message);
    } finally {
      setSubiendoBoleta(false);
    }
  };

  // ── Usar documentos ya guardados (solo si vienen de un reclamo ya enviado) ──
  const handleUsarDocsGuardados = () => {
    // El botón ya llega deshabilitado en ese caso, pero se comprueba igual: es
    // la única puerta a la siguiente etapa y no debe depender solo de la vista.
    if (matriculado === true && !archivosUrls?.boleta) {
      alert('Como te matriculaste, la Boleta de Matrícula es obligatoria para continuar.');
      return;
    }
    if (onDocumentsProcessed && datosAvanzados) onDocumentsProcessed(datosAvanzados);

    addMsg('user', 'Usar mis documentos guardados.');
    // Ya no se enumeran datos extraídos: esta app dejó de parsear, así que para
    // un estudiante nuevo la lista salía vacía con un "_No se encontraron
    // datos_" que parecía un fallo del sistema.
    addMsg('assistant', 'Listo, usaré los documentos que ya tienes guardados.');

    const contactoCompleto = camposManual.telefono && camposManual.turno;
    if (contactoCompleto) {
      addMsg('assistant', 'Tus datos de contacto ya están listos. Detalla tu reclamo con tus propias palabras, no tiene que ser formal:');
      setEtapa('descripcion_final');
    } else {
      addMsg('assistant', 'Ahora completa o actualiza tus datos de contacto para continuar.');
      setEtapa('datos_contacto');
    }
  };

  // ── Procesar PDFs ─────────────────────────────────────────────────────────
  const handleProcesarDocumentos = async () => {
    // La ficha y el avance son imprescindibles siempre. La boleta se exige solo
    // a quien dijo haberse matriculado: es su comprobante y sin él no hay con
    // qué contrastar el reclamo. Quien no se matriculó no la tiene.
    if (!archivos.ficha || !archivos.avance) {
      alert('Sube al menos la Ficha Académica y el Avance Curricular para continuar.');
      return;
    }
    if (matriculado === true && !archivos.boleta) {
      alert('Como te matriculaste, la Boleta de Matrícula es obligatoria para continuar.');
      return;
    }
    setProcesandoPdfs(true);

    if (!(await sesionSigueViva())) {
      addMsg('assistant', 'Tu sesión caducó por seguridad. Vuelve a verificar tu correo y sube los documentos otra vez; no has perdido nada de lo anterior.');
      setProcesandoPdfs(false);
      return;
    }

    addMsg('user', '📎 Documentos subidos.');
    try {
      // El navegador ya no extrae los datos: los PDF solo se guardan. La
      // extracción la dispara un admin desde el panel al revisar el reclamo,
      // que es quien necesita esos datos para decidir. Así el estudiante no
      // carga con un trabajo que no le sirve a él, y el parseo deja de correr
      // en 200 navegadores distintos con versiones y resultados dispares.
      const urls: Record<string, string> = {};
      urls.ficha = await uploadDoc(archivos.ficha, 'ficha');
      if (archivos.boleta) urls.boleta = await uploadDoc(archivos.boleta, 'boleta');
      urls.avance = await uploadDoc(archivos.avance, 'avance');
      setArchivosUrls(urls);

      if (emailVerificado) {
        // Se guardan solo las rutas. Sin datos_parseados: el backend ya no
        // extrae nada en esta ruta, eso es ahora tarea del panel.
        await fetch(`${apiUrl}/api/docs/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
          body: JSON.stringify({
            boleta_url: urls.boleta || null,
            record_notas_url: urls.avance,
            record_matricula_url: urls.ficha,
          }),
        });
      }

      addMsg('assistant',
        'Listo, recibí tus documentos. Ahora completa los datos de contacto para continuar.'
      );
      setEtapa('datos_contacto');
    } catch (e: any) {
      addMsg('assistant', `No se pudieron guardar los documentos: ${e.message}. Intenta de nuevo.`);
    } finally {
      setProcesandoPdfs(false);
    }
  };

  const handleConfirmarDatos = () => {
    const datosFinal = { ...datosEstudiante, ...camposManual };
    setDatosEstudiante(datosFinal);
    addMsg('user', `Teléfono: ${camposManual.telefono || '—'} · Turno: ${camposManual.turno || '—'}`);
    // Se pasa directo a redactar el reclamo: antes había un paso intermedio donde
    // Tefi analizaba el caso y preguntaba si deseaba enviarlo, pero alargaba el
    // trámite para algo que el estudiante ya decidió al entrar aquí.
    addMsg('assistant', `Detalla tu reclamo con tus propias palabras, no tiene que ser formal:`);
    setEtapa('descripcion_final');

    // Persistir los datos de contacto en Supabase para que se reflejen también en el perfil.
    if (emailVerificado) {
      const datosParseados = { ...(datosAvanzados || {}), _contacto: camposManual };
      setDatosAvanzados(datosParseados);
      fetch(`${apiUrl}/api/docs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({
          boleta_url: archivosUrls.boleta,
          record_notas_url: archivosUrls.avance,
          record_matricula_url: archivosUrls.ficha,
          codigo_estudiante: datosFinal.codigo || null,
          datos_parseados: datosParseados,
        })
      }).catch(e => console.warn('No se guardaron los datos de contacto:', e.message));
    }
  };

  // ── Chat con Tefi (RAG) ───────────────────────────────────────────────────
  const sendToTefi = async (prompt: string) => {
    setIsLoading(true);
    const assistantId = Date.now() + 1;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);
    try {
      const formattedHistory = messages
        .filter(m => m.id !== 'bienvenida' && !m.showCategories && m.content.trim() !== '')
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.content }));

      const res = await fetch(`${apiUrl}/api/rag/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: prompt,
          history: formattedHistory,
          systemInstruction: 'Eres Tefi, asistente experto de la FIIS-UNI especializado en guiar a los alumnos a formular reclamos consistentes. Tienes acceso a todos los reglamentos oficiales. DEBES basar tus respuestas en los documentos para resolver o guiar el reclamo del alumno. Sé empático y estructurado usando Markdown. Jamás des información falsa. LÍMITE DE ALCANCE: solo hablas de matrícula, reclamos y trámites académicos de la FIIS-UNI. Si el estudiante pregunta algo sin relación con eso (matemáticas, cultura general, otros temas), no lo respondas — indica amablemente que solo puedes ayudar con su reclamo, sin importar cuán simple parezca la pregunta ni si el estudiante insiste.'
        })
      });
      if (!res.ok) throw new Error('Error al conectar con el servidor RAG');
      const data = await res.json();
      if (data.success && data.answer) {
        let fullText = data.answer.replace(/\[cite:\s*[\d,\s]+\]/gi, '').replace(/\bNo\.\s+/g, 'N° ').trim();
        const textParts = fullText.split(' ');
        let currentText = '';
        for (let i = 0; i < textParts.length; i++) {
          currentText += textParts[i] + ' ';
          setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: currentText } : m));
          await new Promise(r => setTimeout(r, 20));
        }
      } else {
        throw new Error('Respuesta vacía del servidor');
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: `Error: ${err.message}` } : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;
    const texto = inputValue;
    addMsg('user', texto);
    setInputValue('');
    setUsuarioExplicado(true);

    const resumen = Object.entries(datosEstudiante).filter(([, v]) => v).map(([k, v]) => `${labelCampo(k)}: ${v}`).join(' | ');

    let cursosAprobadosTexto = 'Ninguno registrado';
    if (datosAvanzados?.avanceCurricular?.cursos) {
      const aprobados = datosAvanzados.avanceCurricular.cursos
        .filter((c: any) => (c.nota !== null && c.nota >= 10) || (c.estado && c.estado.toUpperCase().includes('CONVAL')))
        .map((c: any) => `- ${c.codigo}`).join('\n');
      cursosAprobadosTexto = aprobados || 'Ninguno registrado';
    }

    let cursosInscritosTexto = 'Ninguno registrado';
    if (datosAvanzados?.boletaMatricula?.cursos) {
      const inscritos = datosAvanzados.boletaMatricula.cursos.map((c: any) => `- ${c.codigo}`).join('\n');
      cursosInscritosTexto = inscritos || 'Ninguno registrado';
    }

    const planAbreviado = PLAN_ESTUDIOS_SOFTWARE.map((c: any) => `- ${c.codigo}: ${c.nombre} (Prerrequisitos: ${c.preRequisitosRaw})`).join('\n');

    sendToTefi(
      `Datos verificados del estudiante: ${resumen}
Correo verificado: ${emailVerificado}
Categoría de reclamo: ${categoriaSeleccionada?.label}

CURSOS APROBADOS (Avance Curricular):
${cursosAprobadosTexto}

CURSOS MATRICULADOS (Boleta):
${cursosInscritosTexto}

Plan de Estudios (malla curricular):
${planAbreviado}

Mensaje del estudiante: ${texto}

INSTRUCCIONES ESTRICTAS:
1. Respóndele directamente al estudiante (tú a tú). Extrae su PRIMER NOMBRE de los datos verificados y úsalo.
2. Da una recomendación breve y clara basándote en los reglamentos RAG y su historial académico.
3. NO determines si el reclamo es procedente o no — eso lo evaluará el personal de la FIIS.
4. Al final de tu respuesta, pregúntale de forma natural y breve: "¿Deseas enviar un reclamo al TEFIIS?"`
    );
  };

  // ── Decisión del estudiante ───────────────────────────────────────────────
  const handleDecisionSi = () => {
    addMsg('user', 'Sí, deseo enviar un reclamo.');
    addMsg('assistant', 'De acuerdo. Detalla tu reclamo con tus propias palabras, no tiene que ser formal:');
    setEtapa('descripcion_final');
  };

  const handleDecisionNo = () => {
    addMsg('user', 'No, gracias.');
    addMsg('assistant', 'Entendido. Si en algún momento necesitas enviar un reclamo, puedes volver aquí cuando quieras.');
    setEtapa('menu');
  };

  // ── Envío formal a Supabase ───────────────────────────────────────────────
  // Los dos listados de cursos se piden en la misma pantalla. Antes eran dos
  // pasos seguidos, y quien quería cambiar de sección —retirar uno y llevar el
  // mismo en otra— tenía que hacerlo a ciegas, sin ver lo que había puesto en
  // el paso anterior.
  const irACursos = () => {
    if (!descripcionFormal.trim()) return;
    setEtapa('cursos');
  };
  const volverADescripcion = () => setEtapa('descripcion_final');

  // Se admite el mismo curso en dos secciones distintas (pedir cambio de
  // sección es justo el caso más común), pero no el mismo par dos veces.
  const agregarCurso = (lista: 'retirar' | 'matricular', curso: CursoElegido) => {
    const set = lista === 'retirar' ? setCursosRetirar : setCursosMatricular;
    set(prev => prev.some(c => c.codigo === curso.codigo && c.seccion === curso.seccion)
      ? prev
      : [...prev, curso]);
  };

  const quitarCurso = (lista: 'retirar' | 'matricular', codigo: string, seccion: string) => {
    const set = lista === 'retirar' ? setCursosRetirar : setCursosMatricular;
    set(prev => prev.filter(c => !(c.codigo === codigo && c.seccion === seccion)));
  };

  // Antes de enviar se muestra un resumen de todo lo que va a viajar con el
  // reclamo. Enviar es irreversible para el estudiante —no puede editarlo
  // después—, así que conviene que vea el conjunto antes de confirmar.
  const irAConfirmar = () => {
    if (!descripcionFormal.trim()) return;
    setEtapa('confirmar_envio');
  };

  // Cerrar el resumen devuelve al final del reclamo, no lo envía ni lo pierde:
  // todo lo escrito sigue en pie y se puede volver a abrir.
  const cerrarConfirmacion = () => setEtapa('cursos');

  const handleEnviarFormal = async () => {
    // Una referencia y no solo el estado: setEnviandoFormal no surte efecto
    // hasta el siguiente repintado, así que dos clics seguidos entran los dos
    // antes de que el botón llegue a deshabilitarse.
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setAvisoCorreo(false);
    setEnviandoFormal(true);
    try {
      const resReclamo = await fetch(`${apiUrl}/api/reclamos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
        body: JSON.stringify({
          nombre: nombreCompleto || datosEstudiante.nombre || null,
          codigo_estudiante: codigoUni || datosEstudiante.codigo || null,
          categoria: categoriaSeleccionada?.label,
          descripcion: descripcionFormal,
          datos_estudiante: {
            ...datosEstudiante,
            // Va después del spread para que la carrera que acaba de declarar
            // mande sobre cualquier especialidad heredada de un parseo viejo.
            especialidad: carrera || datosEstudiante.especialidad || null,
            nombre: nombreCompleto || datosEstudiante.nombre || null,
            codigo: codigoUni || datosEstudiante.codigo || null,
            datosAvanzados,
            matriculado,
          },
          documentos: archivosUrls,
          evidencias,
          cursos_retirar: cursosRetirar,
          cursos_matricular: cursosMatricular,
        }),
      });
      const dataReclamo = await resReclamo.json();
      if (!resReclamo.ok) throw new Error(dataReclamo.error || 'Error al registrar el reclamo');
      const caseId = dataReclamo.id;

      // Solo se manda el id: el destinatario y los datos del caso los saca el
      // servidor de la base. Enviarlos desde aquí convertía este endpoint en un
      // enviador de correos a direcciones arbitrarias.
      const resConfirmar = await fetch(`${apiUrl}/api/reclamos/confirmar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ caseId })
      });
      // Un fallo aquí NO cancela el envío: el reclamo ya está creado. Antes se
      // lanzaba, el alert decía "Error al registrar el reclamo" —que era falso—
      // y el estudiante volvía a pulsar Enviar creando otro. El correo es un
      // acuse de recibo, no parte del registro.
      if (!resConfirmar.ok) {
        const errData = await resConfirmar.json().catch(() => ({}));
        console.warn('Reclamo registrado, pero no se pudo enviar el correo de confirmación:',
          errData.error || resConfirmar.status);
        setAvisoCorreo(true);
      }

      // El reclamo se envió con éxito: los documentos usados quedan habilitados
      // para reusarse en el próximo reclamo sin volver a subirlos.
      if (emailVerificado) {
        const datosConfirmados = { ...(datosAvanzados || {}), _confirmadoEnReclamo: true };
        setDatosAvanzados(datosConfirmados);
        fetch(`${apiUrl}/api/docs/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${activeToken}` },
          body: JSON.stringify({
            boleta_url: archivosUrls.boleta || null,
            record_notas_url: archivosUrls.avance,
            record_matricula_url: archivosUrls.ficha,
            codigo_estudiante: datosEstudiante.codigo || null,
            datos_parseados: datosConfirmados,
          })
        }).catch(e => console.warn('No se pudo marcar documentos como confirmados:', e.message));
      }

      fetch('https://tefiis-m2.onrender.com/api/v1/m2/expedientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: caseId,
          codigoEstudiante: datosEstudiante.codigo || datosEstudiante.codigoEstudiante || '',
          email: emailVerificado,
          nombre: datosEstudiante.nombre || '',
          motivoReclamo: categoriaSeleccionada?.label || '',
          descripcion: descripcionFormal,
        })
      }).catch(e => console.warn('tefiis-m2 expediente no registrado:', e.message));

      setReclamoEnviado({ id: caseId });
      setEtapa('enviado');
    } catch (err: any) {
      alert(`Error al registrar el reclamo: ${err.message}`);
    } finally {
      enviandoRef.current = false;
      setEnviandoFormal(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const labelCampo = (k: string) => ({
    codigo: 'Código', nombre: 'Nombre', especialidad: 'Especialidad',
    correo: 'Correo', telefono: 'Teléfono', ciclo: 'Ciclo relativo',
    semestreIngreso: 'Semestre de ingreso', turno: 'Turno',
    planEstudio: 'Plan de estudios',
    promedioPonderadoFinal: 'Promedio matrícula',
    maxCreditosMatricula: 'Créditos máximos habilitados',
    enRiesgoAcademico: 'En riesgo académico',
    creditosMatriculados: 'Créditos en boleta',
    cursosMatriculados: 'Cantidad de cursos',
    historialJalados: 'Historial de repitencia',
    resumenHorarios: 'Horario detallado',
    observaciones: 'Observ./Convalidaciones',
    tipoProblem: 'Tipo de problema',
  }[k] || k);

  return {
    etapa, setEtapa,
    emailInput, setEmailInput,
    codigoInput, setCodigoInput,
    emailVerificado,
    verifyLoading, verifyError, setVerifyError,
    messages,
    categoriaSeleccionada,
    inputValue, setInputValue,
    isLoading,
    datosEstudiante,
    archivos, setArchivos,
    errorArchivo, setErrorArchivo, validarPdf,
    archivosUrls,
    docsReutilizables,
    matriculado, setMatriculado,
    handleRespuestaMatricula,
    carrera, setCarrera, handleRespuestaCarrera,
    codigoUni, setCodigoUni, handleRespuestaCodigo,
    nombreCompleto, setNombreCompleto, handleRespuestaNombre,
    errorPaso, retrocederA,
    agregarBoletaGuardada, subiendoBoleta,
    procesandoPdfs,
    camposManual, setCamposManual,
    enviandoFormal, avisoCorreo,
    reclamoEnviado,
    reclamosExistentes, loadingConsulta,
    reclamoDetalle, loadingDetalle, abrirDetalleReclamo, cerrarDetalleReclamo,
    descripcionFormal, setDescripcionFormal,
    irAConfirmar,
    cursosRetirar, cursosMatricular, agregarCurso, quitarCurso,
    irACursos, volverADescripcion, cerrarConfirmacion,
    evidencias, agregarEvidencias, quitarEvidencia,
    subiendoEvidencia, errorEvidencia,
    maxEvidencias: MAX_EVIDENCIAS,
    usuarioExplicado,
    messagesEndRef,
    handleEnviarCodigo,
    handleVerificarCodigo,
    handleNuevoReclamo,
    handleConsultarReclamos,
    handleProcesarDocumentos,
    handleUsarDocsGuardados,
    handleConfirmarDatos,
    handleSend,
    handleDecisionSi,
    handleDecisionNo,
    handleEnviarFormal,
  };
}
