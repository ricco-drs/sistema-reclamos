import React, { useEffect, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon, ChevronRight, ArrowLeft, Check, Pencil, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import tefiImg from '../../../assets/tefi.png';
import tefiUniImg from '../../../assets/Tefi-uni.png';
import reclamoAceptadoImg from '../../../assets/reclamo-aceptado.png';
import reclamoRechazadoImg from '../../../assets/reclamo-rechazado.png';
import { useReclamos, TIPOS_PROBLEMA_MATRICULA, CARRERAS_FIIS } from '../hooks/useReclamos';
import SelectorCursos from './SelectorCursos';

interface ReclamosPanelProps {
  onDocumentsProcessed?: (data: any) => void;
  emailSesion?: string | null;
  sessionToken?: string | null;
  onLoginRequired?: () => void;
  autoIniciar?: boolean;
  autoConsultar?: boolean;
  onAutoConsultarConsumido?: () => void;
  onAutoIniciarConsumido?: () => void;
}

// 1048576 bytes no le dice nada a nadie; "1.0 MB" sí.
function formatearTamano(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReclamosPanel({ onDocumentsProcessed, emailSesion, sessionToken, onLoginRequired, autoIniciar, onAutoIniciarConsumido, autoConsultar, onAutoConsultarConsumido }: ReclamosPanelProps) {
  const {
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
    handleUsarDocsGuardados,
    reclamoEnviado,
    reclamosExistentes, loadingConsulta,
    reclamoDetalle, loadingDetalle, abrirDetalleReclamo, cerrarDetalleReclamo,
    descripcionFormal, setDescripcionFormal,
    irAConfirmar,
    cursosRetirar, cursosMatricular, agregarCurso, quitarCurso,
    irACursos, volverADescripcion, cerrarConfirmacion,
    evidencias, agregarEvidencias, quitarEvidencia,
    subiendoEvidencia, errorEvidencia, maxEvidencias,
    usuarioExplicado,
    messagesEndRef,
    handleEnviarCodigo,
    handleVerificarCodigo,
    handleNuevoReclamo,
    handleConsultarReclamos,
    handleProcesarDocumentos,
    handleConfirmarDatos,
    handleSend,
    handleDecisionSi,
    handleDecisionNo,
    handleEnviarFormal,
  } = useReclamos(onDocumentsProcessed, emailSesion, sessionToken);

  // El Tercio puede cerrar el envío de reclamos nuevos. El servidor lo rechaza
  // igualmente, pero dejar el botón puesto llevaría al alumno por todo el flujo
  // para estrellarse al final. Arranca en null: hasta saberlo no se decide.
  const [ventanaAbierta, setVentanaAbierta] = useState<boolean | null>(null);

  useEffect(() => {
    // Se manda la sesión cuando la hay: con la ventana cerrada, el servidor
    // puede responder que sí a El Tercio para probar el flujo. Y se vuelve a
    // preguntar cuando cambia el token, porque al montar el componente el
    // estudiante todavía no ha iniciado sesión y la respuesta sería la general.
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3005'}/api/reclamos-habilitados`, {
      headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
    })
      .then(r => r.json())
      .then(d => setVentanaAbierta(!!d.habilitados))
      // Si no se puede consultar se deja abrir: el servidor tiene la última
      // palabra, y bloquear por un fallo de red sería peor.
      .catch(() => setVentanaAbierta(true));
  }, [sessionToken]);

  // Si el estudiante pidió un reclamo desde el chat general, arrancamos el
  // flujo automáticamente en cuanto lleguemos al menú (ya con sesión lista).
  useEffect(() => {
    if (autoIniciar && etapa === 'menu' && ventanaAbierta !== false) {
      handleNuevoReclamo();
      onAutoIniciarConsumido?.();
    }
  }, [autoIniciar, etapa, ventanaAbierta]);

  // En modo despedida solo queda consultar: se entra directo a la lista sin
  // pasar por el menú, que ofrecería cosas que ya no se pueden hacer.
  useEffect(() => {
    if (autoConsultar && etapa === 'menu') {
      handleConsultarReclamos();
      onAutoConsultarConsumido?.();
    }
  }, [autoConsultar, etapa]);

  // El resumen se abre como capa sobre la conversación y se edita ahí mismo:
  // mandar al estudiante de vuelta al chat para corregir un dígito le hacía
  // perder de vista el resto de lo que estaba revisando.
  const [editandoResumen, setEditandoResumen] = useState(false);
  const [errorResumen, setErrorResumen] = useState('');

  const guardarEdicion = () => {
    const cod = (codigoUni || '').trim().toUpperCase();
    if (!/^\d{7,8}[A-Z]$/.test(cod)) {
      setErrorResumen('El código debe tener 7 u 8 dígitos y una letra al final.');
      return;
    }
    if ((nombreCompleto || '').trim().split(/\s+/).length < 2) {
      setErrorResumen('Escribe tu nombre completo, con apellidos.');
      return;
    }
    if (!(descripcionFormal || '').trim()) {
      setErrorResumen('El reclamo no puede quedar vacío.');
      return;
    }
    setCodigoUni(cod);
    setErrorResumen('');
    setEditandoResumen(false);
  };

  const badgeColor = (estado: string) => {
    if (estado === 'ACEPTADO') return 'bg-green-500/15 text-green-400 border-green-500/30';
    if (estado === 'ACEPTADO_PARCIALMENTE') return 'bg-orange-500/15 text-orange-400 border-orange-500/30';
    if (estado === 'RECHAZADO') return 'bg-red-500/15 text-red-400 border-red-500/30';
    if (estado === 'EN_REVISION') return 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30';
    return 'bg-claude-border text-claude-muted border-claude-border';
  };

  // En la base van con guion bajo; al estudiante se le muestran legibles.
  const estadoTexto = (estado: string) =>
    estado === 'EN_REVISION' ? 'EN REVISIÓN'
    : estado === 'ACEPTADO_PARCIALMENTE' ? 'ACEPTADO PARCIALMENTE'
    : estado;

  // ── Sin sesión: pantalla unificada de login ──────────────────────────────
  if (etapa === 'verificacion_email') {
    return (
      <div className="flex-1 w-full flex flex-col items-center justify-center -mt-12 sm:-mt-20 animate-fade-up">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-5 mb-8 sm:mb-10">
          <img src={tefiUniImg} alt="Tefi" className="w-24 h-24 sm:w-32 sm:h-32 object-contain drop-shadow-xl" />
          <h1 className="font-serif text-2xl sm:text-4xl text-claude-text tracking-wide font-normal text-center sm:text-left px-4 sm:px-0">
            Hola, soy Tefi
          </h1>
        </div>
        <p className="text-claude-muted text-sm mb-6 text-center">Inicia sesión con tu correo <span className="text-claude-text">@uni.pe</span> para gestionar tus reclamos.</p>
        <button
          onClick={onLoginRequired}
          className="px-6 py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  // ── Verificación: ingresar código ─────────────────────────────────────────
  if (etapa === 'verificacion_codigo') {
    return (
      <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center gap-6 px-4">
        <img src={tefiUniImg} alt="Tefi" className="w-16 h-16 object-contain drop-shadow-md" />
        <div className="text-center">
          <h2 className="text-xl font-bold text-claude-text">Código enviado</h2>
          <p className="text-claude-muted text-sm mt-1">
            Revisa tu correo <span className="text-claude-text font-medium">{emailInput}</span> e ingresa el código que te enviamos.
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          <input
            type="text"
            placeholder="XXXX"
            maxLength={6}
            value={codigoInput}
            onChange={e => setCodigoInput(e.target.value.replace(/\D/g, ''))}
            onKeyDown={e => e.key === 'Enter' && handleVerificarCodigo()}
            className="w-full px-4 py-3 rounded-xl bg-claude-panel border border-claude-border text-claude-text text-center text-2xl font-bold tracking-[0.5em] placeholder-claude-muted focus:outline-none focus:border-claude-accent"
          />
          {verifyError && <p className="text-red-400 text-xs px-1">{verifyError}</p>}
          <button
            onClick={handleVerificarCodigo}
            disabled={verifyLoading || codigoInput.length < 4}
            className="w-full py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
          >
            {verifyLoading ? 'Verificando...' : 'Verificar código'}
          </button>
          <button
            onClick={() => { setEtapa('verificacion_email'); setCodigoInput(''); setVerifyError(''); }}
            className="text-xs text-claude-muted hover:text-claude-text transition-colors text-center"
          >
            Cambiar correo o reenviar código
          </button>
        </div>
      </div>
    );
  }

  // ── Menú principal ────────────────────────────────────────────────────────
  if (etapa === 'menu') {
    return (
      <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center gap-6 px-4">
        <img src={tefiUniImg} alt="Tefi" className="w-24 h-24 object-contain drop-shadow-md" />
        <h2 className="text-xl font-bold text-claude-text">¿Qué deseas hacer?</h2>
        <div className="w-full flex flex-col gap-3">
          {ventanaAbierta === false ? (
            <div className="w-full px-4 py-3.5 rounded-xl border border-claude-border bg-claude-panel text-center">
              <p className="text-sm font-medium text-claude-text">La ventana de reclamos está cerrada</p>
              <p className="text-xs text-claude-muted mt-1 leading-relaxed">
                El Tercio no está recibiendo reclamos nuevos por ahora. Puedes seguir consultando los que ya enviaste.
              </p>
            </div>
          ) : (
            <button
              onClick={handleNuevoReclamo}
              disabled={ventanaAbierta === null}
              className="w-full py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer"
            >
              {ventanaAbierta === null ? 'Cargando...' : 'Hacer un reclamo'}
            </button>
          )}
          <button
            onClick={handleConsultarReclamos}
            className="w-full py-3 rounded-xl border border-claude-border text-claude-muted text-sm hover:text-claude-text hover:border-claude-text transition-all cursor-pointer"
          >
            Consultar mis reclamos anteriores
          </button>
        </div>
      </div>
    );
  }

  // ── Detalle de un reclamo: en qué punto del trámite está ─────────────────
  if (etapa === 'consulta' && (reclamoDetalle || loadingDetalle)) {
    // El trámite avanza por estas fases. ACEPTADO y RECHAZADO son dos desenlaces
    // del mismo paso final, no dos pasos distintos, así que comparten posición.
    const FASES = [
      { titulo: 'Reclamo recibido', detalle: 'Tu reclamo entró al sistema y espera revisión.' },
      { titulo: 'En revisión',      detalle: 'El Tercio está evaluando tu caso.' },
      { titulo: 'Resuelto',         detalle: 'El Tercio tomó una decisión sobre tu reclamo.' },
    ];
    const d = reclamoDetalle;
    const estado = d?.estado || 'PENDIENTE';
    const resuelto = estado === 'ACEPTADO' || estado === 'ACEPTADO_PARCIALMENTE' || estado === 'RECHAZADO';
    const faseActual = resuelto ? 2 : estado === 'EN_REVISION' ? 1 : 0;
    // El parcial es un sí con matices, así que va en naranja: ni el verde del
    // aceptado, que prometería más de lo concedido, ni el rojo del rechazado.
    const desenlace = estado === 'ACEPTADO'
      ? { texto: 'Aceptado', color: 'text-green-400', borde: 'border-green-400 bg-green-400/10' }
      : estado === 'ACEPTADO_PARCIALMENTE'
        ? { texto: 'Aceptado parcialmente', color: 'text-orange-400', borde: 'border-orange-400 bg-orange-400/10' }
        : { texto: 'Rechazado', color: 'text-red-400', borde: 'border-red-400 bg-red-400/10' };

    const fecha = (f: string) => new Date(f).toLocaleString('es-PE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return (
      <div className="flex-1 w-full max-w-2xl mx-auto flex flex-col gap-4 mt-4 px-2 overflow-y-auto pb-8">
        <div className="flex items-center gap-3 pb-4 border-b border-claude-border">
          <button
            onClick={cerrarDetalleReclamo}
            className="p-2 -ml-2 rounded-lg text-claude-muted hover:text-claude-text hover:bg-claude-border/50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-claude-text">{d?.id || 'Cargando…'}</h2>
            {d && !d.error && (
              <p className="text-claude-muted text-xs mt-0.5">{d.categoria} · enviado el {fecha(d.created_at)}</p>
            )}
          </div>
        </div>

        {loadingDetalle ? (
          <div className="flex gap-1.5 items-center mt-4">
            <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : d?.error ? (
          <p className="text-red-400 text-sm mt-4">{d.error}</p>
        ) : d ? (
          <>
            <div className="bg-claude-panel border border-claude-border rounded-2xl p-5">
              <p className="text-[11px] uppercase tracking-widest text-claude-muted mb-4">Estado del trámite</p>
              <div className="flex flex-col">
                {FASES.map((fase, i) => {
                  const alcanzada = i <= faseActual;
                  const esUltima = i === FASES.length - 1;
                  // La fase final toma el color del desenlace: si no, "Resuelto"
                  // se vería en verde incluso cuando el reclamo fue rechazado.
                  const color = esUltima && resuelto
                    ? desenlace.color
                    : alcanzada ? 'text-claude-accent' : 'text-claude-muted';
                  const borde = esUltima && resuelto
                    ? desenlace.borde
                    : alcanzada ? 'border-claude-accent bg-claude-accent/10' : 'border-claude-border';
                  return (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${borde}`}>
                          {alcanzada
                            ? <Check className={`w-3.5 h-3.5 ${color}`} />
                            : <span className="w-1.5 h-1.5 rounded-full bg-claude-muted" />}
                        </div>
                        {!esUltima && (
                          <div className={`w-0.5 flex-1 min-h-[28px] ${i < faseActual ? 'bg-claude-accent' : 'bg-claude-border'}`} />
                        )}
                      </div>
                      <div className={esUltima ? 'pb-0' : 'pb-4'}>
                        <p className={`text-sm font-medium ${alcanzada ? 'text-claude-text' : 'text-claude-muted'}`}>
                          {esUltima && resuelto ? desenlace.texto : fase.titulo}
                        </p>
                        <p className="text-xs text-claude-muted mt-0.5">{fase.detalle}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {d.respuesta && (
              <div className="bg-claude-panel border border-claude-border rounded-2xl p-5">
                <p className="text-[11px] uppercase tracking-widest text-claude-muted mb-2">Respuesta del Tercio</p>
                <p className="text-sm text-claude-text whitespace-pre-wrap">{d.respuesta}</p>
              </div>
            )}

            <div className="bg-claude-panel border border-claude-border rounded-2xl p-5">
              <p className="text-[11px] uppercase tracking-widest text-claude-muted mb-2">Tu reclamo</p>
              <p className="text-sm text-claude-text whitespace-pre-wrap">{d.descripcion}</p>
            </div>

            {/* Lo que pidió sobre cursos. Va tras la descripción porque es la
                parte concreta del trámite, y le sirve para comprobar que las
                secciones que marcó son las que quería. */}
            {(d.cursosRetirar?.length > 0 || d.cursosMatricular?.length > 0) && (
              <div className="bg-claude-panel border border-claude-border rounded-2xl p-5">
                <p className="text-[11px] uppercase tracking-widest text-claude-muted mb-3">Cursos que solicitaste</p>
                <div className="flex flex-col gap-4">
                  {d.cursosRetirar?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-400 mb-2">Desmatricularte ({d.cursosRetirar.length})</p>
                      <div className="flex flex-col gap-1.5">
                        {d.cursosRetirar.map((c: any, i: number) => (
                          <div key={`r-${i}`} className="flex items-center gap-2 text-sm">
                            <span className="text-xs font-mono text-claude-accent shrink-0">{c.codigo}</span>
                            <span className="text-claude-text truncate flex-1">{c.nombre}</span>
                            <span className="text-xs text-claude-muted shrink-0">Sec. {c.seccion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {d.cursosMatricular?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-emerald-400 mb-2">Matricularte ({d.cursosMatricular.length})</p>
                      <div className="flex flex-col gap-1.5">
                        {d.cursosMatricular.map((c: any, i: number) => (
                          <div key={`m-${i}`} className="flex items-center gap-2 text-sm">
                            <span className="text-xs font-mono text-claude-accent shrink-0">{c.codigo}</span>
                            <span className="text-claude-text truncate flex-1">{c.nombre}</span>
                            <span className="text-xs text-claude-muted shrink-0">Sec. {c.seccion}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {d.evidencias?.length > 0 && (
              <div className="bg-claude-panel border border-claude-border rounded-2xl p-5">
                <p className="text-[11px] uppercase tracking-widest text-claude-muted mb-3">
                  Pruebas adjuntas ({d.evidencias.length})
                </p>
                <div className="flex flex-col gap-2">
                  {d.evidencias.map((ev: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      {ev.tipo?.startsWith('image/')
                        ? <ImageIcon className="w-4 h-4 shrink-0 text-claude-accent" />
                        : <FileText className="w-4 h-4 shrink-0 text-claude-accent" />}
                      <span className="text-claude-text truncate flex-1">{ev.nombre}</span>
                      <span className="text-xs text-claude-muted shrink-0">{formatearTamano(ev.bytes)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {d.historial?.length > 0 && (
              <div className="bg-claude-panel border border-claude-border rounded-2xl p-5">
                <p className="text-[11px] uppercase tracking-widest text-claude-muted mb-3">Historial</p>
                <div className="flex flex-col gap-2">
                  {d.historial.map((h: any, i: number) => (
                    <div key={i} className="flex justify-between gap-4 text-xs">
                      <span className="text-claude-text">
                        {h.tipo === 'creado' ? 'Reclamo enviado' : `Estado: ${estadoTexto(h.estado)}`}
                      </span>
                      <span className="text-claude-muted shrink-0">{fecha(h.fecha)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    );
  }

  // ── Consulta de reclamos existentes ───────────────────────────────────────
  if (etapa === 'consulta') {
    return (
      <div className="flex-1 w-full max-w-2xl mx-auto flex flex-col gap-4 mt-4 px-2">
        <div className="flex items-center justify-between pb-4 border-b border-claude-border">
          <div>
            <h2 className="text-xl font-bold text-claude-text">Mis reclamos</h2>
            <p className="text-claude-muted text-xs mt-0.5">{emailVerificado}</p>
          </div>
          <button
            onClick={() => setEtapa('menu')}
            className="text-xs text-claude-muted hover:text-claude-text transition-colors border border-claude-border px-3 py-1.5 rounded-lg cursor-pointer"
          >
            Volver
          </button>
        </div>
        {loadingConsulta ? (
          <div className="flex gap-1.5 items-center mt-4">
            <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        ) : reclamosExistentes.length === 0 ? (
          <p className="text-claude-muted text-sm mt-4">No tienes reclamos registrados aún.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {reclamosExistentes.map(r => (
              <button
                key={r.id}
                onClick={() => abrirDetalleReclamo(r.id)}
                className="w-full text-left bg-claude-panel border border-claude-border rounded-xl px-4 py-3 flex items-center justify-between gap-4 hover:border-claude-accent/50 transition-colors cursor-pointer">
                <div>
                  <p className="text-claude-text font-medium text-sm">{r.id}</p>
                  <p className="text-claude-muted text-xs mt-0.5">{r.categoria} · {new Date(r.created_at).toLocaleDateString('es-PE')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* El parcial también es una aceptación, así que lleva la
                      misma imagen: lo que lo matiza es la insignia de al lado. */}
                  {(r.estado === 'ACEPTADO' || r.estado === 'ACEPTADO_PARCIALMENTE')
                    && <img src={reclamoAceptadoImg} alt="Reclamo aceptado" className="w-9 h-9 object-contain" />}
                  {r.estado === 'RECHAZADO' && <img src={reclamoRechazadoImg} alt="Reclamo rechazado" className="w-9 h-9 object-contain" />}
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${badgeColor(r.estado)}`}>
                    {estadoTexto(r.estado)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-claude-muted" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Reclamo enviado: pantalla de éxito ────────────────────────────────────
  if (etapa === 'enviado') {
    return (
      <div className="flex-1 w-full max-w-md mx-auto flex flex-col items-center justify-center gap-6 px-4">
        <img src={reclamoAceptadoImg} alt="Reclamo aceptado" className="w-28 h-28 object-contain drop-shadow-md" />
        <div className="text-center">
          <h2 className="text-xl font-bold text-claude-text">Reclamo registrado</h2>
          <p className="text-claude-muted text-sm mt-1">Tu caso fue enviado correctamente a la FIIS.</p>
        </div>
        <div className="w-full bg-claude-panel border border-claude-border rounded-xl px-6 py-4 text-center">
          <p className="text-xs text-claude-muted mb-1">ID de tu caso</p>
          <p className="text-2xl font-bold text-claude-text tracking-wide">{reclamoEnviado?.id}</p>
          <p className="text-xs text-claude-muted mt-2">
            {avisoCorreo
              ? 'Guarda este ID. Tu reclamo quedó registrado, aunque el correo de confirmación no pudo enviarse.'
              : 'Guarda este ID. Te enviamos la confirmación a tu correo.'}
          </p>
        </div>
        <div className="w-full flex flex-col gap-3">
          <button
            onClick={handleNuevoReclamo}
            className="w-full py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
          >
            Hacer otro reclamo
          </button>
          <button
            onClick={() => setEtapa('menu')}
            className="w-full py-3 rounded-xl border border-claude-border text-claude-muted text-sm hover:text-claude-text transition-all cursor-pointer"
          >
            Volver al menú
          </button>
        </div>
      </div>
    );
  }

  // ── Mini-formulario datos de contacto ─────────────────────────────────────
  if (etapa === 'datos_contacto') {
    const camposCompletos = camposManual.telefono?.trim() && camposManual.turno;
    return (
      <div className="flex-1 w-full max-w-3xl mx-auto flex flex-col h-full mt-4">
        <div className="mb-4 pb-4 border-b border-claude-border flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-claude-text">Datos de contacto</h2>
            <p className="text-claude-muted text-xs mt-0.5">Completa los siguientes campos para continuar.</p>
          </div>
        </div>

        {/* Mensajes anteriores (extracción de PDFs) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4 flex flex-col gap-6">
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-4">
              {msg.role === 'assistant' && (
                <img src={tefiImg} alt="Tefi" className="w-11 h-11 shrink-0 object-contain drop-shadow-md" />
              )}
              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded shrink-0 bg-claude-accent/20 border border-claude-accent/40 flex items-center justify-center font-bold text-xs text-claude-accent">{emailVerificado ? emailVerificado[0].toUpperCase() : 'T'}</div>
              )}
              <div className="flex-1 pt-2 overflow-hidden">
                <div className="prose prose-p:leading-relaxed max-w-none text-[15px] text-claude-text">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Formulario */}
        <div className="pt-4 border-t border-claude-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs text-claude-muted mb-1 block">Teléfono</label>
              <input
                placeholder="9 dígitos"
                value={camposManual.telefono || ''}
                onChange={e => setCamposManual((p: any) => ({ ...p, telefono: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                className="w-full px-3 py-2.5 rounded-lg bg-claude-panel border border-claude-border text-claude-text text-sm placeholder-claude-muted focus:outline-none focus:border-claude-accent"
              />
            </div>
            <div>
              <label className="text-xs text-claude-muted mb-1 block">Turno</label>
              <select
                value={camposManual.turno || ''}
                onChange={e => setCamposManual((p: any) => ({ ...p, turno: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg bg-claude-panel border border-claude-border text-claude-text text-sm focus:outline-none focus:border-claude-accent"
              >
                <option value="0">Riesgo Académico</option>
                <option value="promocion">Promoción</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleConfirmarDatos}
            disabled={!camposCompletos}
            className="w-full py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
          >
            Continuar
          </button>
        </div>
      </div>
    );
  }

  // ── Flujo principal del reclamo (chat) ────────────────────────────────────
  return (
    <div className="flex-1 w-full max-w-3xl mx-auto flex flex-col h-full mt-4">
      <div className="mb-4 pb-4 border-b border-claude-border flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-claude-text">Reclamos</h2>
          <p className="text-claude-muted text-xs mt-0.5">Tefi te guiará para registrar tu reclamo.</p>
        </div>
        <button
          onClick={() => setEtapa('menu')}
          className="text-xs text-claude-muted hover:text-claude-text transition-colors border border-claude-border px-2.5 py-1 rounded-lg cursor-pointer"
        >
          Atrás
        </button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-4 flex flex-col gap-6">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-4">
            {msg.role === 'assistant' && (
              <img src={tefiImg} alt="Tefi" className="w-11 h-11 shrink-0 object-contain drop-shadow-md" />
            )}
            {msg.role === 'user' && (
              <div className="w-9 h-9 rounded shrink-0 bg-claude-border flex items-center justify-center font-medium text-xs text-claude-muted">Tú</div>
            )}
            <div className="flex-1 pt-2 overflow-hidden">
              {msg.role === 'assistant' ? (
                <div className="prose prose-p:leading-relaxed prose-ul:my-2 prose-li:my-0.5 max-w-none text-[15px] text-claude-text">
                  {msg.content === '' ? (
                    <div className="flex gap-1.5 items-center mt-2.5 h-6">
                      <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-claude-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  )}
                </div>
              ) : (
                <div className="text-[15px] leading-relaxed text-claude-text">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Panel: ¿llegaste a matricularte? */}
      {etapa === 'pregunta_matricula' && (
        <div className="pt-4 border-t border-claude-border">
          <div className="flex gap-3">
            <button onClick={() => handleRespuestaMatricula(true)}
              className="flex-1 py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer">
              Sí, me matriculé
            </button>
            <button onClick={() => handleRespuestaMatricula(false)}
              className="flex-1 py-2.5 rounded-xl border border-claude-border text-claude-text font-medium text-sm hover:bg-claude-border/50 transition-colors cursor-pointer">
              No me matriculé
            </button>
          </div>
        </div>
      )}

      {/* Especialidad: se pregunta antes de los documentos porque el parseo ya no
          corre en esta app, y sin ella el panel admin no podría filtrar por
          carrera los reclamos nuevos. */}
      {etapa === 'pregunta_carrera' && (
        <div className="pt-4 border-t border-claude-border">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CARRERAS_FIIS.map(nombre => (
              <button
                key={nombre}
                onClick={() => handleRespuestaCarrera(nombre)}
                className="py-2.5 px-3 rounded-xl border border-claude-border text-claude-text text-sm text-left hover:border-claude-accent hover:bg-claude-accent/5 transition-colors cursor-pointer"
              >
                {nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Código UNI */}
      {etapa === 'pregunta_codigo' && (
        <div className="pt-4 border-t border-claude-border flex flex-col gap-2">
          <input
            value={codigoUni}
            onChange={e => setCodigoUni(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleRespuestaCodigo()}
            placeholder="20231158C"
            maxLength={9}
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl bg-claude-panel border border-claude-border text-claude-text text-sm placeholder-claude-muted focus:outline-none focus:border-claude-accent"
          />
          {errorPaso && <p className="text-red-400 text-xs px-1">{errorPaso}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => retrocederA('carrera')}
              className="px-4 py-2.5 rounded-xl border border-claude-border text-claude-muted text-sm hover:text-claude-text transition-colors cursor-pointer"
            >
              Atrás
            </button>
            <button
              onClick={handleRespuestaCodigo}
              disabled={!codigoUni.trim()}
              className="flex-1 py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Nombre completo */}
      {etapa === 'pregunta_nombre' && (
        <div className="pt-4 border-t border-claude-border flex flex-col gap-2">
          <input
            value={nombreCompleto}
            onChange={e => setNombreCompleto(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRespuestaNombre()}
            placeholder="Nombres y apellidos"
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl bg-claude-panel border border-claude-border text-claude-text text-sm placeholder-claude-muted focus:outline-none focus:border-claude-accent"
          />
          {errorPaso && <p className="text-red-400 text-xs px-1">{errorPaso}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => retrocederA('codigo')}
              className="px-4 py-2.5 rounded-xl border border-claude-border text-claude-muted text-sm hover:text-claude-text transition-colors cursor-pointer"
            >
              Atrás
            </button>
            <button
              onClick={handleRespuestaNombre}
              disabled={!nombreCompleto.trim()}
              className="flex-1 py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Panel subir PDFs */}
      {etapa === 'subir_docs' && (() => {
        // La ficha y el avance son imprescindibles siempre. La boleta se exige a
        // quien dijo haberse matriculado —es su comprobante y sin él no hay con
        // qué contrastar el reclamo— y sigue opcional para quien no lo hizo,
        // porque sencillamente no la tiene.
        const boletaObligatoria = matriculado === true;
        const documentosRequeridos = [
          { key: 'ficha', label: 'Ficha Académica', opcional: false },
          { key: 'avance', label: 'Avance Curricular', opcional: false },
          { key: 'boleta', label: 'Boleta de Matrícula', opcional: !boletaObligatoria },
        ];
        const gridCols = 'sm:grid-cols-3';
        const obligatorios = documentosRequeridos.filter(d => !d.opcional);
        const faltaAlgunArchivo = obligatorios.some(({ key }) => !archivos[key]);
        // Se ofrecen los documentos que el estudiante ya tenga guardados, los
        // haya subido desde su perfil o en un reclamo anterior: para él son los
        // mismos archivos y su perfil dice que sirven "para usar en reclamos".
        //
        // La condición mira solo la ficha y el avance, no la boleta aunque sea
        // obligatoria: si la incluyera, a quien tiene esos dos guardados y le
        // falta la boleta se le escondería esta vista entera y tendría que
        // volver a subir los tres. En su lugar la boleta se pide aquí mismo y
        // el botón de continuar espera a que llegue.
        const yaGuardados = docsReutilizables && archivosUrls
          && !!archivosUrls['ficha'] && !!archivosUrls['avance'];
        const faltaBoletaGuardada = boletaObligatoria && !archivosUrls?.['boleta'];

        return (
          <div className="pt-4 border-t border-claude-border">
            {yaGuardados ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-claude-muted">Ya tienes estos documentos guardados en tu perfil:</p>
                <div className={`grid grid-cols-1 ${gridCols} gap-3`}>
                  {documentosRequeridos.map(({ key, label, opcional }) => {
                    // Lo guardado se muestra como tal; lo opcional que falta se
                    // puede añadir aquí mismo, sin obligar a "Subir nuevos" y
                    // volver a cargar la ficha y el avance que ya estaban.
                    if (archivosUrls[key]) {
                      return (
                        <div key={key} className="flex flex-col items-center justify-center gap-1 p-4 border border-claude-accent/30 bg-claude-accent/5 rounded-xl text-sm text-center text-claude-accent">
                          <span>{label}</span>
                          <span className="text-xs">✓ Guardado</span>
                        </div>
                      );
                    }
                    // Solo la boleta puede faltar aquí (sin ficha o avance no se
                    // llega a esta vista) y se sube en el sitio, sea opcional u
                    // obligatoria, para no obligar a recargar lo que ya estaba.
                    if (key !== 'boleta') return null;
                    return (
                      <label key={key} className={`flex flex-col items-center justify-center gap-1 p-4 border-2 border-dashed rounded-xl text-sm text-center transition-all ${
                        subiendoBoleta
                          ? 'border-claude-border text-claude-muted cursor-default'
                          : opcional
                            ? 'border-claude-border text-claude-muted hover:border-claude-text hover:text-claude-text cursor-pointer'
                            : 'border-red-400/50 text-claude-muted hover:border-red-400 hover:text-claude-text cursor-pointer'
                      }`}>
                        <span>{label}{opcional
                          ? <span className="text-xs font-normal opacity-70"> (opcional)</span>
                          : <span className="text-xs font-normal text-red-400"> (obligatoria)</span>}</span>
                        <span className="text-xs">{subiendoBoleta ? 'Subiendo...' : 'Haz clic para subir'}</span>
                        <input
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          disabled={subiendoBoleta}
                          onChange={e => {
                            const f = validarPdf(e.target.files?.[0]);
                            if (f) agregarBoletaGuardada(f);
                            e.target.value = '';
                          }}
                        />
                      </label>
                    );
                  })}
                </div>
                {faltaBoletaGuardada && (
                  <p className="text-xs text-red-400">
                    Como te matriculaste, sube tu Boleta de Matrícula para continuar.
                  </p>
                )}
                <div className="flex gap-2">
                  <button onClick={handleUsarDocsGuardados}
                    disabled={faltaBoletaGuardada || subiendoBoleta}
                    className="flex-1 py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer">
                    Usar estos documentos
                  </button>
                  <button onClick={() => { setArchivos({ ficha: null, boleta: null, avance: null }); }}
                    className="px-4 py-2.5 rounded-xl border border-claude-border text-claude-muted text-sm hover:text-claude-text transition-colors cursor-pointer">
                    Subir nuevos
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={`grid grid-cols-1 ${gridCols} gap-3 mb-3`}>
                  {documentosRequeridos.map(({ key, label, opcional }) => (
                    <label key={key} className={`flex flex-col items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all text-sm text-center
                      ${archivos[key] ? 'border-claude-accent bg-claude-accent/10 text-claude-accent' : 'border-claude-border text-claude-muted hover:border-claude-text hover:text-claude-text'}`}>
                      <span>{label}{opcional && <span className="text-xs font-normal opacity-70"> (opcional)</span>}</span>
                      <span className="text-xs">{archivos[key] ? `✓ ${archivos[key].name}` : 'Haz clic para subir'}</span>
                      <input type="file" accept="application/pdf,.pdf" className="hidden"
                        onChange={e => {
                          const f = validarPdf(e.target.files?.[0]);
                          if (f) setArchivos((prev: any) => ({ ...prev, [key]: f }));
                          // Se limpia para poder reintentar con el mismo nombre.
                          e.target.value = '';
                        }} />
                    </label>
                  ))}
                </div>
                {errorArchivo && (
                  <div className="mb-3 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2">
                    <span className="text-red-400 text-sm leading-none mt-0.5">⚠</span>
                    <p className="text-red-400 text-xs leading-relaxed flex-1">{errorArchivo}</p>
                    <button onClick={() => setErrorArchivo('')}
                      className="text-red-400 text-xs opacity-70 hover:opacity-100 cursor-pointer">✕</button>
                  </div>
                )}
                <button
                  onClick={() => retrocederA('nombre')}
                  className="w-full mb-2 py-2 rounded-xl border border-claude-border text-claude-muted text-xs hover:text-claude-text transition-colors cursor-pointer"
                >
                  Atrás (Corregir mis datos)
                </button>
                <button onClick={handleProcesarDocumentos} disabled={procesandoPdfs || faltaAlgunArchivo}
                  className="w-full py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer">
                  {procesandoPdfs ? 'Subiendo documentos...' : 'Subir documentos'}
                </button>
              </>
            )}
          </div>
        );
      })()}

      {/* Panel completar datos manualmente */}
      {etapa === 'completar' && (
        <div className="pt-4 border-t border-claude-border">
          <p className="text-claude-muted text-xs mb-3">Completa los datos que no pudieron extraerse:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {!datosEstudiante.telefono && (
              <input placeholder="Teléfono (9 dígitos)" value={camposManual.telefono || ''}
                onChange={e => setCamposManual((p: any) => ({ ...p, telefono: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-claude-panel border border-claude-border text-claude-text text-sm placeholder-claude-muted focus:outline-none focus:border-claude-accent" />
            )}
            {!datosEstudiante.turno && (
              <select value={camposManual.turno || ''} onChange={e => setCamposManual((p: any) => ({ ...p, turno: e.target.value }))}
                className="px-3 py-2 rounded-lg bg-claude-panel border border-claude-border text-claude-text text-sm focus:outline-none focus:border-claude-accent">
                <option value="0">Riesgo Académico</option>
                <option value="promocion">Promoción</option>
                {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            )}
            <select value={camposManual.tipoProblem || ''} onChange={e => setCamposManual((p: any) => ({ ...p, tipoProblem: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-claude-panel border border-claude-border text-claude-text text-sm focus:outline-none focus:border-claude-accent sm:col-span-2">
              <option value="">-- Tipo de problema --</option>
              {TIPOS_PROBLEMA_MATRICULA.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <button onClick={handleConfirmarDatos} disabled={!camposManual.tipoProblem}
            className="w-full py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer">
            Confirmar y continuar
          </button>
        </div>
      )}

      {/* Chat input */}
      {etapa === 'chat' && (
        <div className="pt-4 bg-claude-bg flex flex-col gap-2">
          {/* Sí/No: aparece solo cuando Tefi ya respondió al usuario */}
          {!isLoading && usuarioExplicado && messages.some(m => m.role === 'assistant' && m.content.trim() && m.id !== 'bienvenida') ? (
            <div className="bg-claude-panel border border-claude-border rounded-xl px-4 py-3 flex flex-col gap-2">
              <p className="text-sm text-claude-muted">¿Deseas enviar un reclamo al TEFIIS?</p>
              <div className="flex gap-2">
                <button onClick={handleDecisionSi}
                  className="flex-1 py-2 rounded-lg border border-claude-accent text-claude-accent text-sm font-medium hover:bg-claude-accent/10 transition-all cursor-pointer">
                  Sí, enviar reclamo
                </button>
                <button onClick={handleDecisionNo}
                  className="flex-1 py-2 rounded-lg border border-claude-border text-claude-muted text-sm hover:text-claude-text transition-all cursor-pointer">
                  No, gracias
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full bg-claude-panel border border-claude-border rounded-2xl p-3 flex flex-col">
              <textarea value={inputValue} onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={`Cuéntame brevemente qué pasó...`}
                className="w-full bg-transparent text-claude-text placeholder-claude-muted resize-none focus:outline-none min-h-[44px] max-h-32 text-base custom-scrollbar"
                rows={1} />
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-claude-muted px-1">
                  Reclamo: <span className="font-medium text-claude-accent">{categoriaSeleccionada?.label}</span>
                  {datosEstudiante.nombre && <> · {datosEstudiante.nombre.split(' ')[0]}</>}
                </span>
                <button onClick={handleSend} disabled={!inputValue.trim() || isLoading}
                  className="bg-claude-text text-claude-bg px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 cursor-pointer">
                  Enviar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Los dos listados juntos. Antes eran dos pasos seguidos, y quien
          quería cambiar de sección —retirar un curso y llevar el mismo en
          otra— lo hacía a ciegas, sin ver lo que había puesto antes. */}
      {etapa === 'cursos' && (
        <div className="pt-4 border-t border-claude-border flex flex-col gap-4">
          <p className="text-xs text-claude-muted leading-relaxed">
            Si no quieres desmatricularte de ningún curso, déjalo vacío. Lo mismo
            para matricularte: si no necesitas ninguno, déjalo vacío.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 sm:gap-5">
            <SelectorCursos
              tono="retirar"
              titulo="Desmatricularme de"
              ayuda="Cursos que quieres dejar."
              elegidos={cursosRetirar}
              onAgregar={(c: any) => agregarCurso('retirar', c)}
              onQuitar={(cod: string, sec: string) => quitarCurso('retirar', cod, sec)}
            />
            <div className="hidden sm:block w-px bg-claude-border shrink-0" />
            <SelectorCursos
              tono="matricular"
              titulo="Matricularme en"
              ayuda="Solo los que te faltan, no los que ya están en tu boleta."
              elegidos={cursosMatricular}
              onAgregar={(c: any) => agregarCurso('matricular', c)}
              onQuitar={(cod: string, sec: string) => quitarCurso('matricular', cod, sec)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={volverADescripcion}
              className="px-4 py-2.5 rounded-xl border border-claude-border text-claude-muted text-sm hover:text-claude-text transition-colors cursor-pointer"
            >
              Atrás
            </button>
            <button
              onClick={irAConfirmar}
              className="flex-1 py-2.5 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
            >
              {cursosRetirar.length + cursosMatricular.length === 0
                ? 'Continuar sin seleccionar cursos'
                : `Continuar con ${cursosRetirar.length + cursosMatricular.length} curso${cursosRetirar.length + cursosMatricular.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {/* Resumen sobre la conversación. Enviar es irreversible para el
          estudiante, así que revisa el conjunto en una capa aparte, sin el
          ruido del chat detrás, y corrige sin salir de ella. */}
      {etapa === 'confirmar_envio' && (() => {
        const turnoLegible = (t: string) => {
          if (!t) return '—';
          if (t === '0') return 'Riesgo Académico';
          if (t.toLowerCase().startsWith('promoc')) return 'Promoción';
          return `Turno ${t}`;
        };

        const Fila = ({ etiqueta, children }: any) => (
          <div className="flex items-center gap-4 py-3 border-b border-claude-border/40 last:border-0">
            <span className="w-32 sm:w-44 shrink-0 text-[13px] text-claude-muted leading-snug">{etiqueta}</span>
            <div className="flex-1 min-w-0 flex">{children}</div>
          </div>
        );
        const Valor = ({ children }: any) => (
          <span className="text-[15px] text-claude-text font-medium">{children || '—'}</span>
        );
        const entrada = "w-full max-w-[20rem] text-[15px] text-claude-text text-left bg-claude-bg border border-claude-border rounded-lg px-3 py-1.5 focus:outline-none focus:border-claude-accent";

        const Seccion = ({ titulo, children }: any) => (
          <div className="shrink-0 bg-claude-panel border border-claude-border rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-claude-border bg-claude-border/20">
              <span className="text-xs uppercase tracking-widest text-claude-muted font-medium">{titulo}</span>
            </div>
            <div className="px-5 py-2.5">{children}</div>
          </div>
        );

        const docs = ['ficha', 'boleta', 'avance'].filter(k => archivosUrls[k]);
        const nombreDoc: any = { ficha: 'Ficha Académica', boleta: 'Boleta de Matrícula', avance: 'Avance Curricular' };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-claude-bg/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl h-full max-h-[92dvh] bg-claude-bg border border-claude-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">

              <div className="px-6 py-5 border-b border-claude-border shrink-0 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-claude-text leading-tight">
                    {editandoResumen ? 'Corrige tu información' : 'Verifica si la información proporcionada es correcta'}
                  </h3>
                  <p className="text-xs text-claude-muted mt-1">
                    {editandoResumen
                      ? 'Cambia lo que necesites y guarda para volver al resumen.'
                      : 'Una vez enviado no podrás modificarlo, así que revísalo con calma.'}
                  </p>
                </div>
                {/* Cerrar no envía ni descarta: devuelve al final del reclamo
                    con todo lo escrito intacto, para seguir ajustándolo. */}
                <button
                  onClick={() => { setEditandoResumen(false); setErrorResumen(''); cerrarConfirmacion(); }}
                  title="Cerrar y volver al reclamo"
                  className="shrink-0 p-1.5 -mr-1.5 -mt-1 rounded-lg text-claude-muted hover:text-claude-text hover:bg-claude-border/50 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-visible px-6 py-5 flex flex-col gap-4">
                <Seccion titulo="Tus datos">
                  <Fila etiqueta="Nombre">
                    {editandoResumen
                      ? <input value={nombreCompleto} onChange={e => setNombreCompleto(e.target.value)} className={entrada} />
                      : <Valor>{nombreCompleto}</Valor>}
                  </Fila>
                  <Fila etiqueta="Código UNI">
                    {editandoResumen
                      ? <input value={codigoUni} maxLength={9} onChange={e => setCodigoUni(e.target.value.toUpperCase())} className={entrada} />
                      : <Valor>{codigoUni}</Valor>}
                  </Fila>
                  <Fila etiqueta="Especialidad">
                    {editandoResumen
                      ? <select value={carrera || ''} onChange={e => setCarrera(e.target.value)} className={entrada}>
                          {CARRERAS_FIIS.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      : <Valor>{carrera}</Valor>}
                  </Fila>
                  <Fila etiqueta="Teléfono">
                    {editandoResumen
                      ? <input value={camposManual.telefono || ''} maxLength={9}
                          onChange={e => setCamposManual((p: any) => ({ ...p, telefono: e.target.value.replace(/\D/g, '') }))}
                          className={entrada} />
                      : <Valor>{camposManual.telefono}</Valor>}
                  </Fila>
                  <Fila etiqueta="Turno">
                    {editandoResumen
                      ? <select value={camposManual.turno || ''} onChange={e => setCamposManual((p: any) => ({ ...p, turno: e.target.value }))} className={entrada}>
                          <option value="0">Riesgo Académico</option>
                          <option value="promocion">Promoción</option>
                          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => <option key={n} value={String(n)}>{n}</option>)}
                        </select>
                      : <Valor>{turnoLegible(camposManual.turno)}</Valor>}
                  </Fila>
                  <Fila etiqueta="¿Llegó a matricularse?">
                    {editandoResumen
                      ? <select value={matriculado === null ? '' : String(matriculado)} onChange={e => setMatriculado(e.target.value === 'true')} className={entrada}>
                          <option value="true">Sí</option>
                          <option value="false">No</option>
                        </select>
                      : <Valor>{matriculado === true ? 'Sí' : matriculado === false ? 'No' : '—'}</Valor>}
                  </Fila>
                </Seccion>

                <Seccion titulo={`Documentos${evidencias.length ? ' y pruebas' : ''}`}>
                  {docs.length
                    ? docs.map(k => (
                        <Fila key={k} etiqueta={nombreDoc[k]}>
                          <span className="text-[15px] text-claude-accent font-medium">✓ Adjunto</span>
                        </Fila>
                      ))
                    : <p className="py-2 text-sm text-claude-muted">Ningún documento adjunto</p>}
                  {evidencias.map((ev: any) => (
                    <Fila key={ev.ref} etiqueta={ev.nombre}>
                      <Valor>{formatearTamano(ev.bytes)}</Valor>
                    </Fila>
                  ))}
                </Seccion>

                {/* Al editar se muestran siempre los dos selectores, aunque no
                    haya nada elegido: corregir el reclamo incluye poder añadir
                    un curso que se olvidó, no solo quitar los que ya puso. */}
                {editandoResumen ? (
                  <Seccion titulo="Cursos solicitados">
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-5 py-2">
                      <SelectorCursos
                        tono="retirar"
                        titulo="Desmatricularme de"
                        ayuda="Déjalo vacío si no quieres retirar ninguno."
                        elegidos={cursosRetirar}
                        onAgregar={(c: any) => agregarCurso('retirar', c)}
                        onQuitar={(cod: string, sec: string) => quitarCurso('retirar', cod, sec)}
                      />
                      <div className="hidden sm:block w-px bg-claude-border shrink-0" />
                      <SelectorCursos
                        tono="matricular"
                        titulo="Matricularme en"
                        ayuda="Déjalo vacío si no necesitas ninguno."
                        elegidos={cursosMatricular}
                        onAgregar={(c: any) => agregarCurso('matricular', c)}
                        onQuitar={(cod: string, sec: string) => quitarCurso('matricular', cod, sec)}
                      />
                    </div>
                  </Seccion>
                ) : (cursosRetirar.length > 0 || cursosMatricular.length > 0) && (
                  <Seccion titulo="Cursos solicitados">
                    {cursosRetirar.map((c: any) => (
                      <Fila key={`r-${c.codigo}-${c.seccion}`} etiqueta={`Retirar · ${c.codigo} sec. ${c.seccion}`}>
                        <Valor>{c.nombre}</Valor>
                      </Fila>
                    ))}
                    {cursosMatricular.map((c: any) => (
                      <Fila key={`m-${c.codigo}-${c.seccion}`} etiqueta={`Matricular · ${c.codigo} sec. ${c.seccion}`}>
                        <Valor>{c.nombre}</Valor>
                      </Fila>
                    ))}
                  </Seccion>
                )}

                <Seccion titulo="Tu reclamo">
                  {editandoResumen
                    ? <textarea value={descripcionFormal} onChange={e => setDescripcionFormal(e.target.value)} rows={5}
                        className="w-full my-2 text-[15px] text-claude-text bg-claude-bg border border-claude-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:border-claude-accent custom-scrollbar" />
                    : <p className="py-2 text-[15px] text-claude-text whitespace-pre-wrap leading-relaxed">{descripcionFormal}</p>}
                </Seccion>

                {errorResumen && <p className="text-red-400 text-xs px-1">{errorResumen}</p>}
              </div>

              <div className="shrink-0 flex gap-3 px-6 py-5 border-t border-claude-border">
                {editandoResumen ? (
                  <button
                    onClick={guardarEdicion}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Guardar cambios
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setErrorResumen(''); setEditandoResumen(true); }}
                      disabled={enviandoFormal}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-claude-border text-claude-text text-sm font-medium hover:bg-claude-border/50 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <Pencil className="w-4 h-4" />
                      Editar
                    </button>
                    <button
                      onClick={handleEnviarFormal}
                      disabled={enviandoFormal}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-claude-text text-claude-bg font-medium text-sm disabled:opacity-40 hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      {enviandoFormal ? 'Enviando...' : <><Send className="w-4 h-4" />Todo correcto, enviar</>}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Descripción final del reclamo */}
      {etapa === 'descripcion_final' && (
        <div className="pt-4 bg-claude-bg flex flex-col gap-2">
          <div className="w-full bg-claude-panel border border-claude-border rounded-2xl p-3 flex flex-col">
            <textarea
              value={descripcionFormal}
              onChange={e => setDescripcionFormal(e.target.value)}
              placeholder="Describe tu reclamo con tus propias palabras..."
              className="w-full bg-transparent text-claude-text placeholder-claude-muted resize-none focus:outline-none min-h-[80px] max-h-48 text-base custom-scrollbar"
              rows={3}
            />
            {/* Pruebas adjuntas: opcionales, se suben al elegirlas para que el
                envío final no dependa de la red en el último momento. */}
            {evidencias.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-2 mb-1">
                {evidencias.map((ev: any) => (
                  <div key={ev.ref}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-claude-bg border border-claude-border">
                    {ev.tipo?.startsWith('image/')
                      ? <ImageIcon className="w-4 h-4 shrink-0 text-claude-accent" />
                      : <FileText className="w-4 h-4 shrink-0 text-claude-accent" />}
                    <span className="text-xs text-claude-text truncate flex-1" title={ev.nombre}>{ev.nombre}</span>
                    <span className="text-[10px] text-claude-muted shrink-0">{formatearTamano(ev.bytes)}</span>
                    <button
                      onClick={() => quitarEvidencia(ev.ref)}
                      disabled={enviandoFormal}
                      title={`Quitar ${ev.nombre}`}
                      className="p-0.5 rounded text-claude-muted hover:text-red-400 disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {errorEvidencia && (
              <p className="text-[11px] text-red-400 mt-1">{errorEvidencia}</p>
            )}

            <div className="flex items-center justify-between gap-3 mt-2">
              <label className={`flex items-center gap-1.5 text-xs transition-colors ${
                subiendoEvidencia || evidencias.length >= maxEvidencias || enviandoFormal
                  ? 'text-claude-muted cursor-default opacity-60'
                  : 'text-claude-muted hover:text-claude-text cursor-pointer'
              }`}>
                <Paperclip className="w-4 h-4" />
                {subiendoEvidencia
                  ? 'Subiendo...'
                  : evidencias.length >= maxEvidencias
                    ? 'Ya adjuntaste tu prueba'
                    : 'Adjuntar prueba en PDF (opcional)'}
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  disabled={subiendoEvidencia || evidencias.length >= maxEvidencias || enviandoFormal}
                  onChange={e => {
                    if (e.target.files?.length) agregarEvidencias(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                onClick={irACursos}
                disabled={!descripcionFormal.trim() || subiendoEvidencia}
                className="bg-claude-text text-claude-bg px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:opacity-90 cursor-pointer"
              >
                Continuar
              </button>
            </div>
          </div>
          <p className="text-center text-[11px] text-claude-muted">
            Puedes adjuntar un único PDF como prueba · máximo 10 MB
          </p>
        </div>
      )}
    </div>
  );
}
