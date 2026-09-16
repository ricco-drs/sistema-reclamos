import React, { useState, useEffect } from 'react';
import { ArrowLeft, LogOut, CheckCircle, Upload, Trash2 } from 'lucide-react';
import ConfirmDialog from '../../../components/ConfirmDialog';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3005';

const DOCS = [
  { tipo: 'ficha'  as const, label: 'Ficha Académica',     field: 'record_matricula_url', desc: 'Ficha de matrícula oficial de la FIIS' },
  { tipo: 'boleta' as const, label: 'Boleta de Matrícula', field: 'boleta_url',            desc: 'Boleta de matrícula del ciclo actual' },
  { tipo: 'avance' as const, label: 'Avance Curricular',   field: 'record_notas_url',      desc: 'Record de notas y avance curricular' },
] as const;

type DocTipo = 'ficha' | 'boleta' | 'avance';

interface Props {
  email: string;
  sessionToken: string | null;
  onBack: () => void;
  onLogout: () => void;
  /** Cerrado el ciclo, el perfil se reduce a cerrar sesión: subir o borrar
   *  documentos y actualizar el contacto ya no sirven para nada, porque el
   *  servidor no acepta reclamos nuevos. */
  soloCerrarSesion?: boolean;
}

export default function ProfilePage({ email, sessionToken, onBack, onLogout, soloCerrarSesion = false }: Props) {
  const authHeaders = { Authorization: `Bearer ${sessionToken}` };
  const [docs, setDocs] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingDoc, setUploadingDoc] = useState<DocTipo | null>(null);
  const [contacto, setContacto] = useState({ telefono: '', turno: '' });
  const [editandoContacto, setEditandoContacto] = useState(false);
  const [savingContacto, setSavingContacto] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [viendoDoc, setViendoDoc] = useState<DocTipo | null>(null);
  const [borrandoDoc, setBorrandoDoc] = useState<DocTipo | null>(null);
  const [docPendienteEliminar, setDocPendienteEliminar] = useState<{ tipo: DocTipo; field: string; label: string } | null>(null);

  const handleVerDoc = async (tipo: DocTipo, url: string) => {
    setViendoDoc(tipo);
    try {
      const res = await fetch(`${API_URL}/api/docs/signed-url?url=${encodeURIComponent(url)}`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      alert('No se pudo abrir el documento: ' + e.message);
    } finally {
      setViendoDoc(null);
    }
  };

  const handleConfirmarEliminarDoc = async () => {
    if (!docPendienteEliminar) return;
    const { tipo, field } = docPendienteEliminar;
    setBorrandoDoc(tipo);
    try {
      const res = await fetch(`${API_URL}/api/docs/${encodeURIComponent(email)}/${tipo}`, { method: 'DELETE', headers: authHeaders });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDocs((prev: any) => ({ ...prev, [field]: null }));
      setDocPendienteEliminar(null);
    } catch (e: any) {
      alert('No se pudo eliminar el documento: ' + e.message);
    } finally {
      setBorrandoDoc(null);
    }
  };

  useEffect(() => {
    // Sin nada que enseñar aparte del botón de salir, pedir los documentos solo
    // haría esperar un "Cargando..." delante de un botón.
    if (soloCerrarSesion) { setLoading(false); return; }
    if (!sessionToken) { setLoading(false); return; }
    fetch(`${API_URL}/api/docs/${encodeURIComponent(email)}`, { headers: authHeaders })
      .then(r => r.json())
      .then(async d => {
        if (d) {
          const tieneUrls = d.boleta_url && d.record_notas_url && d.record_matricula_url;
          const incompleto = !d.datos_parseados || !d.datos_parseados.avanceCurricular || !d.datos_parseados.datosPersonales;
          
          if (tieneUrls && incompleto) {
            try {
              const res = await fetch(`${API_URL}/api/docs/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({
                  boleta_url: d.boleta_url,
                  record_notas_url: d.record_notas_url,
                  record_matricula_url: d.record_matricula_url,
                  codigo_estudiante: d.codigo_estudiante,
                  datos_parseados: d.datos_parseados
                })
              });
              const resData = await res.json();
              if (resData.success && resData.datos_parseados) {
                d.datos_parseados = resData.datos_parseados;
                d.codigo_estudiante = resData.datos_parseados.datosPersonales?.codigo || d.codigo_estudiante;
              }
            } catch (err) {
              console.error("Error healing documents on profile mount:", err);
            }
          }
          
          setDocs(d);
          const c = d.datos_parseados?._contacto || {};
          setContacto({ telefono: c.telefono || '', turno: c.turno || '' });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [email, sessionToken]);

  const handleReplaceDoc = async (tipo: DocTipo, file: File) => {
    setUploadingDoc(tipo);
    try {
      const formData = new FormData();
      formData.append('tipo', tipo);
      formData.append('file', file);
      const uploadRes = await fetch(`${API_URL}/api/docs/upload`, { method: 'POST', headers: authHeaders, body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error);
      const newUrl = uploadData.url;

      const updated = {
        boleta_url: docs?.boleta_url,
        record_notas_url: docs?.record_notas_url,
        record_matricula_url: docs?.record_matricula_url,
      };
      if (tipo === 'boleta') updated.boleta_url = newUrl;
      if (tipo === 'avance') updated.record_notas_url = newUrl;
      if (tipo === 'ficha')  updated.record_matricula_url = newUrl;

      // force_reparse: el archivo cambió pero la URL guardada es siempre la misma
      // (mismo path, upsert), así que sin este flag el backend no detecta el cambio
      // y se queda sirviendo el JSON viejo indefinidamente.
      const saveRes = await fetch(`${API_URL}/api/docs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ...updated, force_reparse: true })
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error);
      setDocs((prev: any) => ({ ...prev, ...updated, datos_parseados: saveData.datos_parseados ?? prev?.datos_parseados }));
    } catch (e: any) {
      alert('Error al subir: ' + e.message);
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleGuardarContacto = async () => {
    setSavingContacto(true);
    try {
      const datosParsed = { ...(docs?.datos_parseados || {}), _contacto: contacto };
      await fetch(`${API_URL}/api/docs/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          boleta_url: docs?.boleta_url,
          record_notas_url: docs?.record_notas_url,
          record_matricula_url: docs?.record_matricula_url,
          codigo_estudiante: docs?.codigo_estudiante,
          datos_parseados: datosParsed,
        })
      });
      setDocs((prev: any) => ({ ...prev, datos_parseados: datosParsed }));
      setEditandoContacto(false);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally {
      setSavingContacto(false);
    }
  };

  const handleBotonContacto = () => {
    if (editandoContacto) {
      handleGuardarContacto();
    } else {
      setEditandoContacto(true);
    }
  };

  const inicial = email[0].toUpperCase();

  return (
    <div className="flex-1 w-full max-w-2xl mx-auto flex flex-col pt-2 pb-12 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button onClick={onBack}
          className="p-2 rounded-xl hover:bg-claude-border/50 transition-colors cursor-pointer text-claude-muted hover:text-claude-text">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-claude-text">Mi perfil</h1>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-claude-muted text-sm">Cargando...</div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Avatar + email */}
          <div className="flex items-center gap-4 p-5 bg-claude-panel border border-claude-border rounded-2xl">
            <div className="w-14 h-14 rounded-full bg-claude-accent/20 border-2 border-claude-accent/40 flex items-center justify-center text-2xl font-bold text-claude-accent">
              {inicial}
            </div>
            <div>
              <p className="font-semibold text-claude-text">{email}</p>
              <p className="text-xs text-claude-muted mt-0.5">Estudiante FIIS · UNI</p>
            </div>
          </div>

          {!soloCerrarSesion && (<>
          {/* Documentos */}
          <div className="bg-claude-panel border border-claude-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-claude-border">
              <h2 className="font-semibold text-claude-text">Documentos académicos</h2>
              <p className="text-xs text-claude-muted mt-0.5">Sube tus fichas en PDF para usar en reclamos</p>
            </div>
            <div className="divide-y divide-claude-border">
              {DOCS.map(({ tipo, label, field, desc }) => {
                const tiene = !!docs?.[field];
                const subiendo = uploadingDoc === tipo;
                return (
                  <div key={tipo} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tiene ? 'bg-green-500/15' : 'bg-claude-border/50'}`}>
                        {tiene
                          ? <CheckCircle className="w-4 h-4 text-green-400" />
                          : <Upload className="w-4 h-4 text-claude-muted" />
                        }
                      </div>
                      <div>
                        <p className="text-sm font-medium text-claude-text">{label}</p>
                        <p className="text-xs text-claude-muted">{tiene ? 'PDF guardado' : desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {tiene && (
                        <>
                          <button onClick={() => handleVerDoc(tipo, docs[field])} disabled={viendoDoc !== null}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer bg-claude-border/50 text-claude-text hover:bg-claude-border disabled:opacity-50">
                            {viendoDoc === tipo ? 'Abriendo...' : 'Ver'}
                          </button>
                          <button onClick={() => setDocPendienteEliminar({ tipo, field, label })} disabled={borrandoDoc !== null}
                            title="Eliminar documento"
                            className="p-1.5 rounded-lg transition-colors cursor-pointer text-red-400/80 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <label className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        subiendo
                          ? 'bg-claude-border text-claude-muted'
                          : tiene
                            ? 'bg-claude-border/50 text-claude-text hover:bg-claude-border'
                            : 'bg-claude-accent/20 text-claude-accent hover:bg-claude-accent/30 border border-claude-accent/30'
                      }`}>
                        {subiendo ? 'Subiendo...' : tiene ? 'Cambiar' : 'Subir PDF'}
                        <input type="file" accept=".pdf" className="hidden" disabled={uploadingDoc !== null}
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleReplaceDoc(tipo, f); e.target.value = ''; }} />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Datos de contacto */}
          <div className="bg-claude-panel border border-claude-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-claude-border">
              <h2 className="font-semibold text-claude-text">Datos de contacto</h2>
              <p className="text-xs text-claude-muted mt-0.5">Se usan para completar tus reclamos automáticamente</p>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              <div>
                <label className="text-xs text-claude-muted mb-1 block">Teléfono</label>
                <input
                  type="tel"
                  placeholder="9 dígitos"
                  value={contacto.telefono}
                  maxLength={9}
                  disabled={!editandoContacto}
                  onChange={e => setContacto(p => ({ ...p, telefono: e.target.value.replace(/\D/g, '') }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-claude-bg border border-claude-border text-claude-text text-sm placeholder-claude-muted focus:outline-none focus:border-claude-accent disabled:opacity-60 disabled:cursor-default"
                />
              </div>
              <div>
                <label className="text-xs text-claude-muted mb-1 block">Turno</label>
                <select
                  value={contacto.turno}
                  disabled={!editandoContacto}
                  onChange={e => setContacto(p => ({ ...p, turno: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl bg-claude-bg border border-claude-border text-claude-text text-sm focus:outline-none focus:border-claude-accent disabled:opacity-60 disabled:cursor-default"
                >
                  <option value="0">Riesgo Académico</option>
                  <option value="promocion">Promoción</option>
                  {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Actualizar datos */}
          <button onClick={handleBotonContacto} disabled={savingContacto}
            className="w-full py-3 rounded-xl bg-claude-text text-claude-bg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer">
            {savingContacto ? 'Guardando...' : savedOk ? '¡Actualizado!' : editandoContacto ? 'Guardar cambios' : 'Actualizar datos'}
          </button>

          </>)}

          {/* Cerrar sesión */}
          <button onClick={onLogout}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl border border-red-500/20 text-red-400 text-sm hover:bg-red-500/5 transition-colors cursor-pointer">
            <LogOut className="w-4 h-4" />
            Cerrar sesión
          </button>
        </div>
      )}

      <ConfirmDialog
        open={docPendienteEliminar !== null}
        title={`Eliminar ${docPendienteEliminar?.label ?? 'documento'}`}
        message="Esta acción no se puede deshacer. El PDF se borrará permanentemente de tus documentos guardados."
        confirmLabel="Eliminar"
        danger
        loading={borrandoDoc !== null}
        onConfirm={handleConfirmarEliminarDoc}
        onCancel={() => setDocPendienteEliminar(null)}
      />
    </div>
  );
}
