import React, { useMemo, useState } from 'react';
import { Plus, Search, X, Check } from 'lucide-react';
import { CURSOS, type CursoElegido } from '../hooks/useReclamos';

interface Props {
  titulo: string;
  ayuda: string;
  elegidos: CursoElegido[];
  onAgregar: (curso: CursoElegido) => void;
  onQuitar: (codigo: string, seccion: string) => void;
  /** Acento del encabezado: rojo para retirar, verde para matricular. */
  tono?: 'retirar' | 'matricular';
}

// Se busca sin tildes y sin distinguir mayúsculas: los nombres del cuadro
// oficial vienen en mayúsculas y sin acentos, y nadie escribe "MATEMATICA" así.
const normalizar = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export default function SelectorCursos({
  titulo, ayuda, elegidos, onAgregar, onQuitar, tono = 'matricular',
}: Props) {
  const [buscando, setBuscando] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [cursoAbierto, setCursoAbierto] = useState<typeof CURSOS[number] | null>(null);

  const resultados = useMemo(() => {
    const q = normalizar(consulta.trim());
    if (!q) return [];
    return CURSOS
      .filter(c => normalizar(c.codigo).includes(q) || normalizar(c.nombre).includes(q))
      .slice(0, 20);   // el listado vive en un panel corto; más resultados no se leen
  }, [consulta]);

  const cerrarBuscador = () => {
    setBuscando(false);
    setConsulta('');
    setCursoAbierto(null);
  };

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-3">
      <div>
        <p className={`text-sm font-semibold ${tono === 'retirar' ? 'text-red-400' : 'text-emerald-400'}`}>
          {titulo}
        </p>
        <p className="text-xs text-tefiis-muted mt-0.5 leading-relaxed">{ayuda}</p>
      </div>

      {/* Lo ya elegido */}
      {elegidos.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {elegidos.map(c => (
            <div key={`${c.codigo}-${c.seccion}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-tefiis-panel border border-tefiis-border">
              <span className="text-xs font-mono text-tefiis-accent shrink-0">{c.codigo}</span>
              <span className="text-xs text-tefiis-text truncate flex-1">{c.nombre}</span>
              <span className="text-xs text-tefiis-muted shrink-0">Sec. {c.seccion}</span>
              <button
                onClick={() => onQuitar(c.codigo, c.seccion)}
                title={`Quitar ${c.codigo} sección ${c.seccion}`}
                className="p-0.5 rounded text-tefiis-muted hover:text-red-400 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!buscando ? (
        <button
          onClick={() => setBuscando(true)}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-tefiis-border text-tefiis-muted text-sm hover:border-tefiis-text hover:text-tefiis-text transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Añadir
        </button>
      ) : (
        <div className="rounded-xl border border-tefiis-border bg-tefiis-panel overflow-hidden">
          {!cursoAbierto ? (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-tefiis-border">
                <Search className="w-4 h-4 text-tefiis-muted shrink-0" />
                <input
                  value={consulta}
                  onChange={e => setConsulta(e.target.value)}
                  placeholder="Buscar por nombre o código"
                  autoFocus
                  className="flex-1 bg-transparent text-sm text-tefiis-text placeholder-tefiis-muted focus:outline-none"
                />
                <button onClick={cerrarBuscador} className="p-0.5 rounded text-tefiis-muted hover:text-tefiis-text cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar">
                {!consulta.trim() ? (
                  <p className="px-3 py-3 text-xs text-tefiis-muted">
                    Escribe para buscar entre los {CURSOS.length} cursos aperturados.
                  </p>
                ) : resultados.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-tefiis-muted">Ningún curso coincide con «{consulta}».</p>
                ) : (
                  resultados.map(c => (
                    <button
                      key={c.codigo}
                      onClick={() => setCursoAbierto(c)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-tefiis-border/40 transition-colors cursor-pointer"
                    >
                      <span className="text-xs font-mono text-tefiis-accent shrink-0">{c.codigo}</span>
                      <span className="text-xs text-tefiis-text truncate flex-1">{c.nombre}</span>
                      <span className="text-[10px] text-tefiis-muted shrink-0">{c.secciones.length} sec.</span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 border-b border-tefiis-border">
                <span className="text-xs font-mono text-tefiis-accent shrink-0">{cursoAbierto.codigo}</span>
                <span className="text-xs text-tefiis-text truncate flex-1">{cursoAbierto.nombre}</span>
                <button onClick={() => setCursoAbierto(null)} className="text-[11px] text-tefiis-muted hover:text-tefiis-text cursor-pointer shrink-0">
                  Cambiar
                </button>
              </div>
              <div className="px-3 py-3">
                <p className="text-[11px] text-tefiis-muted mb-2">Elige la sección:</p>
                <div className="flex flex-wrap gap-1.5">
                  {cursoAbierto.secciones.map(sec => {
                    const yaEsta = elegidos.some(e => e.codigo === cursoAbierto.codigo && e.seccion === sec);
                    return (
                      <button
                        key={sec}
                        disabled={yaEsta}
                        onClick={() => {
                          onAgregar({ codigo: cursoAbierto.codigo, nombre: cursoAbierto.nombre, seccion: sec });
                          cerrarBuscador();
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                          yaEsta
                            ? 'border-tefiis-accent/40 bg-tefiis-accent/10 text-tefiis-accent cursor-default'
                            : 'border-tefiis-border text-tefiis-text hover:border-tefiis-accent hover:bg-tefiis-accent/5 cursor-pointer'
                        }`}
                      >
                        {yaEsta && <Check className="w-3 h-3 inline mr-1" />}
                        {sec}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
