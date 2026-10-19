import { useMemo, useState } from 'react';
import cargaRaw from '../carga_horaria_2026.json';

const DAYS     = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA'];
const DAY_FULL = { LU: 'Lunes', MA: 'Martes', MI: 'Miércoles', JU: 'Jueves', VI: 'Viernes', SA: 'Sábado' };
const TIPO_LABEL = { T: 'Teoría', P: 'Práctica', L: 'Laboratorio' };
const CELL_H = 60;
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7:00 – 21:00

const PALETTE = [
  ['#1e3a5f', '#60a5fa'], ['#14532d', '#34d399'], ['#4a1d96', '#a78bfa'],
  ['#7c2d12', '#fb923c'], ['#164e63', '#22d3ee'], ['#3f0d12', '#f87171'],
  ['#1a2e05', '#84cc16'], ['#3b0764', '#e879f9'],
];

function buildColorMap(codes) {
  const map = {};
  [...new Set(codes)].forEach((code, i) => { map[code] = PALETTE[i % PALETTE.length]; });
  return map;
}

function parseHora(hora) {
  if (!hora) return null;
  const m = String(hora).match(/(\d{1,2})[^\d](\d{1,2})/);
  return m ? { start: parseInt(m[1]), end: parseInt(m[2]) } : null;
}

function cleanDocente(name) {
  if (!name) return '';
  return name.replace(/^RA\s+/i, '').trim();
}

function groupBlocks(rawRows) {
  const map = {};
  rawRows.forEach(r => {
    const key = `${r.codigo}|${r.seccion}|${r.dia}`;
    if (!map[key]) map[key] = { ...r, sessions: [], start: r.start, end: r.end };
    map[key].sessions.push({ start: r.start, end: r.end, tipo: r.tipo, aula: r.aula });
    map[key].start = Math.min(map[key].start, r.start);
    map[key].end   = Math.max(map[key].end,   r.end);
  });
  return Object.values(map).map(g => ({
    ...g,
    sessions: g.sessions.sort((a, b) => a.start - b.start),
  }));
}

function calcLayout(allBlocks, target) {
  const overlapping = allBlocks.filter(b =>
    b.dia === target.dia && !(b.end <= target.start || b.start >= target.end)
  );
  const keys  = [...new Set(overlapping.map(b => `${b.codigo}|${b.seccion}`))].sort();
  const count = keys.length;
  if (count <= 1) return { width: '100%', left: '0%' };
  const idx = keys.indexOf(`${target.codigo}|${target.seccion}`);
  return { width: `${100 / count}%`, left: `${(idx * 100) / count}%` };
}

// ── Modal de detalle de bloque ────────────────────────────────────────────────
function BlockModal({ block, colorMap, onClose }) {
  if (!block) return null;
  const [fill, stroke] = colorMap[block.codigo] ?? ['#1e3a5f', '#60a5fa'];
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#0e1120', border: `1.5px solid ${stroke}40`,
          borderRadius: 16, width: '100%', maxWidth: 420,
          overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: fill }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1.1rem', color: stroke, letterSpacing: '0.06em' }}>
                {block.codigo}
                {block.seccion && (
                  <span style={{ fontSize: '0.75rem', marginLeft: 10, opacity: 0.7 }}>Sec {block.seccion}</span>
                )}
              </div>
              {block.nombre && (
                <div style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '0.9rem', marginTop: 6, lineHeight: 1.35 }}>
                  {block.nombre}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.35)', fontSize: '1rem', lineHeight: 1,
              width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 26px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Sesiones */}
          <div>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 8 }}>
              Sesiones · {DAY_FULL[block.dia] || block.dia}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {block.sessions.map((s, i) => (
                <div key={i} style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: 8,
                  padding: '8px 12px', display: 'flex', gap: 12, alignItems: 'center',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: stroke, fontWeight: 600 }}>
                    {String(s.start).padStart(2,'0')}:00 – {String(s.end).padStart(2,'0')}:00
                  </span>
                  {s.tipo && (
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 7px' }}>
                      {TIPO_LABEL[s.tipo] || s.tipo}
                    </span>
                  )}
                  {s.aula && (
                    <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                      {s.aula}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Docente */}
          {block.docente && (
            <div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', marginBottom: 5 }}>
                Docente
              </div>
              <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)' }}>
                {cleanDocente(block.docente)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Grilla de horario ─────────────────────────────────────────────────────────
function HorarioGrid({ blocks, colorMap, onBlockClick }) {
  if (blocks.length === 0) return (
    <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
      <p style={{ fontStyle: 'italic', fontSize: '0.9rem' }}>Sin datos de horario disponibles.</p>
    </div>
  );

  const totalH = HOURS.length * CELL_H;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: DAYS.length * 130 + 56, display: 'flex' }}>
        {/* Horas */}
        <div style={{ width: 52, flexShrink: 0 }}>
          <div style={{ height: 36 }} />
          {HOURS.map(h => (
            <div key={h} style={{
              height: CELL_H, display: 'flex', alignItems: 'flex-start',
              paddingRight: 8, paddingTop: 4, boxSizing: 'border-box',
              fontSize: '0.65rem', color: 'var(--text-dim)',
              fontVariantNumeric: 'tabular-nums', justifyContent: 'flex-end',
            }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Columnas de días */}
        {DAYS.map(day => {
          const dayBlocks = blocks.filter(b => b.dia === day);
          return (
            <div key={day} style={{ flex: 1, minWidth: 120 }}>
              <div style={{
                height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em',
                color: 'var(--text-dim)', borderBottom: '1px solid var(--border-color)',
              }}>
                {DAY_FULL[day]}
              </div>

              <div style={{
                position: 'relative', height: totalH,
                borderLeft: '1px solid var(--border-color)',
                borderRight: '1px solid var(--border-color)',
                borderBottom: '1px solid var(--border-color)',
                background: 'rgba(255,255,255,0.012)', overflow: 'hidden',
              }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    position: 'absolute', top: (h - 7) * CELL_H,
                    left: 0, right: 0, height: 1,
                    background: 'var(--border-color)', opacity: 0.28,
                  }} />
                ))}

                {dayBlocks.map((block, i) => {
                  const [fill, stroke] = colorMap[block.codigo] ?? ['#333', '#888'];
                  const top    = (block.start - 7) * CELL_H + 2;
                  const height = (block.end - block.start) * CELL_H - 4;
                  const layout = calcLayout(blocks, block);
                  const docente = cleanDocente(block.docente);

                  return (
                    <div
                      key={i}
                      onClick={() => onBlockClick(block)}
                      style={{
                        position: 'absolute', top, height,
                        left: `calc(${layout.left} + 2px)`,
                        width: `calc(${layout.width} - 4px)`,
                        background: fill, border: `1.5px solid ${stroke}`,
                        borderRadius: 6, padding: '5px 7px',
                        overflow: 'hidden', zIndex: 2, boxSizing: 'border-box',
                        cursor: 'pointer',
                        transition: 'filter 0.12s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.25)'}
                      onMouseLeave={e => e.currentTarget.style.filter = ''}
                    >
                      <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.72rem', color: stroke, lineHeight: 1 }}>
                        {block.codigo}
                      </div>
                      {block.seccion && (
                        <div style={{ fontSize: '0.6rem', color: stroke, opacity: 0.85, marginTop: 2 }}>
                          Sec {block.seccion}
                        </div>
                      )}
                      {block.sessions.map((s, si) => (
                        <div key={si} style={{ fontSize: '0.58rem', color: stroke, opacity: 0.75, lineHeight: 1.45, marginTop: 1 }}>
                          {String(s.start).padStart(2,'0')}:00–{String(s.end).padStart(2,'0')}:00
                          {s.tipo ? ` · ${TIPO_LABEL[s.tipo] || s.tipo}` : ''}
                          {s.aula  ? ` · ${s.aula}` : ''}
                        </div>
                      ))}
                      {height > 85 && docente && (
                        <div style={{ fontSize: '0.57rem', color: stroke, opacity: 0.5, marginTop: 4, lineHeight: 1.2 }}>
                          {docente.split(',')[0].split(' ').slice(0, 3).join(' ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ codes, colorMap, courseList = [] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
      {codes.map(code => {
        const [fill, stroke] = colorMap[code] ?? ['#333', '#888'];
        const course = courseList.find ? courseList.find(c => c.codigo === code) : null;
        return (
          <span key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-dim)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: fill, border: `1.5px solid ${stroke}`, flexShrink: 0 }} />
            {code}{course?.nombre ? ` — ${course.nombre}` : ''}
          </span>
        );
      })}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function HorarioCursos({ cursos = [], aptoCursos = [] }) {
  const [tab, setTab] = useState('actual');
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [activeColorMap, setActiveColorMap] = useState({});

  const { actualBlocks, actualColorMap } = useMemo(() => {
    const raw = [];
    cursos.forEach(c => {
      const t = parseHora(c.hora);
      if (!t || !c.dia) return;
      raw.push({
        codigo: c.codigo, seccion: c.seccion, nombre: c.nombre,
        dia: c.dia.toUpperCase().slice(0, 2),
        start: t.start, end: t.end,
        tipo: c.tipo, aula: c.aula, docente: c.docente,
      });
    });
    const blocks   = groupBlocks(raw);
    const colorMap = buildColorMap(blocks.map(b => b.codigo));
    return { actualBlocks: blocks, actualColorMap: colorMap };
  }, [cursos]);

  const { habBlocks, habColorMap, sinHorario } = useMemo(() => {
    const aptoCodes = new Set(aptoCursos.map(c => c.codigo));
    const raw = cargaRaw
      .filter(r => aptoCodes.has(r.codigo))
      .map(r => ({
        codigo: r.codigo, seccion: r.seccion, nombre: r.nombre,
        dia: r.dia.toUpperCase().slice(0, 2),
        start: r.horaInicio, end: r.horaFinal,
        tipo: r.tipo, aula: r.aula, docente: r.docente,
      }));
    const blocks       = groupBlocks(raw);
    const codesEnCarga = new Set(blocks.map(b => b.codigo));
    const colorMap     = buildColorMap(blocks.map(b => b.codigo));
    const sinHorario   = aptoCursos.filter(c => !codesEnCarga.has(c.codigo));
    return { habBlocks: blocks, habColorMap: colorMap, sinHorario };
  }, [aptoCursos]);

  const handleBlockClick = (block, colorMap) => {
    setSelectedBlock(block);
    setActiveColorMap(colorMap);
  };

  const actualCodes = [...new Set(actualBlocks.map(b => b.codigo))];
  const habCodes    = [...new Set(habBlocks.map(b => b.codigo))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Modal */}
      {selectedBlock && (
        <BlockModal
          block={selectedBlock}
          colorMap={activeColorMap}
          onClose={() => setSelectedBlock(null)}
        />
      )}

      {/* Pestañas */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        {[
          { id: 'actual',      label: 'Horario Actual' },
          { id: 'habilitados', label: `Cursos Habilitados${aptoCursos.length ? ` (${aptoCursos.length})` : ''}` },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '9px 18px', fontSize: '0.74rem', fontWeight: 700,
            letterSpacing: '0.05em', border: 'none', background: 'none', cursor: 'pointer',
            color: tab === t.id ? 'var(--primary-accent)' : 'var(--text-dim)',
            borderBottom: tab === t.id ? '2px solid var(--primary-accent)' : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'actual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {actualCodes.length > 0 && <Legend codes={actualCodes} colorMap={actualColorMap} />}
          <HorarioGrid
            blocks={actualBlocks}
            colorMap={actualColorMap}
            onBlockClick={b => handleBlockClick(b, actualColorMap)}
          />
        </div>
      )}

      {tab === 'habilitados' && (
        aptoCursos.length === 0
          ? <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-dim)' }}>
              <p style={{ fontStyle: 'italic', fontSize: '0.9rem' }}>Sin cursos habilitados detectados.</p>
            </div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {habCodes.length > 0 && (
                <Legend codes={habCodes} colorMap={habColorMap} courseList={aptoCursos} />
              )}
              {sinHorario.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {sinHorario.map((c, i) => (
                    <span key={i} style={{
                      padding: '4px 10px', borderRadius: 20,
                      background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.18)',
                      fontSize: '0.72rem',
                    }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#fbbf24' }}>{c.codigo}</span>
                      <span style={{ color: 'rgba(251,191,36,0.45)', marginLeft: 6, fontSize: '0.65rem' }}>sin sección este semestre</span>
                    </span>
                  ))}
                </div>
              )}
              <HorarioGrid
                blocks={habBlocks}
                colorMap={habColorMap}
                onBlockClick={b => handleBlockClick(b, habColorMap)}
              />
            </div>
      )}
    </div>
  );
}
