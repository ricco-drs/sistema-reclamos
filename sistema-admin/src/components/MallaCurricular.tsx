import React, { useState, useMemo } from 'react';
import { PLAN_ESTUDIOS_SOFTWARE } from '../data/planEstudios';
import cargaRaw from '../carga_horaria_2026.json';

const N_W = 118;
const N_H = 48;
const C_GAP = 34;
const R_GAP = 12;
const C_W = N_W + C_GAP;
const R_H = N_H + R_GAP;
const PAD_X = 20;
const PAD_Y = 18;
const LABEL_H = 22;

const norm = (c) => c?.replace(/[-\s]/g, '').toUpperCase().trim() || '';

const STATUS_STYLE = {
  aprobado:    { fill: '#14532d', stroke: '#22c55e', text: '#86efac', accent: '#22c55e', label: 'Aprobado' },
  convalidado: { fill: '#1e1b4b', stroke: '#818cf8', text: '#c7d2fe', accent: '#818cf8', label: 'Convalidado' },
  inscrito:    { fill: '#1e3a8a', stroke: '#60a5fa', text: '#bfdbfe', accent: '#60a5fa', label: 'Matriculado' },
  apto:        { fill: '#78350f', stroke: '#fbbf24', text: '#fde68a', accent: '#fbbf24', label: 'Apto' },
  bloqueado:   { fill: '#1c2132', stroke: '#4a5568', text: '#a0aec0', accent: '#718096', label: 'Bloqueado' },
};

export default function MallaCurricular({ cursosAprobados, cursosInscritos, aptoCodes, rawAvance, porCiclo, boletaCursos = [] }) {
  const [hovered, setHovered] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const localPlanMap = useMemo(() => {
    const m = {};
    PLAN_ESTUDIOS_SOFTWARE.forEach(p => { m[norm(p.codigo)] = p; });
    return m;
  }, []);

  // Reverse map: normalizedCode → [{ ciclo, nota, veces, estado }]
  const cicloByCode = useMemo(() => {
    const map = {};
    Object.entries(porCiclo || {}).forEach(([ciclo, courses]) => {
      courses.forEach(c => {
        const key = norm(c.codigo);
        if (!map[key]) map[key] = [];
        map[key].push({ ciclo, nota: c.nota, veces: c.veces, estado: c.estado });
      });
    });
    return map;
  }, [porCiclo]);

  // Códigos que llegaron por convalidación
  const convalidadosCodes = useMemo(() => {
    const set = new Set<string>();
    rawAvance.forEach((c: any) => {
      if (c.estado === 'CONVAL') {
        set.add(norm(c.codigo));
        if (c.observacion) {
          const m = c.observacion.match(/EQUIV\.\s*CON\s+([A-Z0-9]+)/i);
          if (m) set.add(norm(m[1]));
        }
      }
    });
    return set;
  }, [rawAvance]);

  // Sección en la que el estudiante ya está inscrito: codigo → seccion
  const inscritoSeccionMap = useMemo(() => {
    const map: Record<string, string> = {};
    boletaCursos.forEach((c: any) => {
      if (c.codigo && c.seccion) map[norm(c.codigo)] = c.seccion;
    });
    return map;
  }, [boletaCursos]);

  // Secciones disponibles en la carga horaria: { [codigo]: { [seccion]: { docente, vacantes, sessions[] } } }
  const cargaMap = useMemo(() => {
    const map: Record<string, Record<string, any>> = {};
    (cargaRaw as any[]).forEach(r => {
      if (!map[r.codigo]) map[r.codigo] = {};
      if (!map[r.codigo][r.seccion]) map[r.codigo][r.seccion] = { docente: r.docente, vacantes: r.vacantes, sessions: [] };
      map[r.codigo][r.seccion].sessions.push({ dia: r.dia, inicio: r.horaInicio, fin: r.horaFinal, tipo: r.tipo, aula: r.aula });
    });
    return map;
  }, []);

  const getStatus = (code: string) => {
    const n = norm(code);
    if (cursosAprobados.has(n)) return convalidadosCodes.has(n) ? 'convalidado' : 'aprobado';
    if (cursosInscritos.has(n)) return 'inscrito';
    if (aptoCodes.has(n)) return 'apto';
    return 'bloqueado';
  };

  const { positions, edges, svgW, svgH } = useMemo(() => {
    const byCiclo = {};
    PLAN_ESTUDIOS_SOFTWARE.forEach(c => {
      const k = c.ciclo || 1;
      if (!byCiclo[k]) byCiclo[k] = [];
      byCiclo[k].push(c);
    });

    const maxRows = Math.max(...Object.values(byCiclo).map(a => a.length));
    const svgW = 10 * C_W + 2 * PAD_X;
    const svgH = maxRows * R_H + 2 * PAD_Y + LABEL_H;

    const positions = {};
    for (let ciclo = 1; ciclo <= 10; ciclo++) {
      const courses = byCiclo[ciclo] || [];
      const x = PAD_X + (ciclo - 1) * C_W;
      const colH = courses.length * R_H - R_GAP;
      const available = maxRows * R_H - R_GAP;
      const startY = PAD_Y + LABEL_H + Math.floor((available - colH) / 2);
      courses.forEach((course, i) => {
        positions[course.codigo] = { x, y: startY + i * R_H };
      });
    }

    const edges = [];
    PLAN_ESTUDIOS_SOFTWARE.forEach(course => {
      (course.preRequisitos || []).forEach(prereq => {
        if (positions[prereq] && positions[course.codigo]) {
          edges.push({ from: prereq, to: course.codigo });
        }
      });
    });

    return { positions, edges, svgW, svgH };
  }, []);

  const hovConnSet = useMemo(() => {
    if (!hovered) return null;
    const s = new Set();
    edges.forEach(e => {
      if (e.from === hovered || e.to === hovered) s.add(`${e.from}→${e.to}`);
    });
    return s;
  }, [hovered, edges]);

  const hovRelated = useMemo(() => {
    if (!hovered) return null;
    const s = new Set([hovered]);
    edges.forEach(e => {
      if (e.from === hovered) s.add(e.to);
      if (e.to === hovered) s.add(e.from);
    });
    return s;
  }, [hovered, edges]);

  const electivos = useMemo(() => {
    return rawAvance.filter(c => {
      if (localPlanMap[norm(c.codigo)]) return false; // es un curso del plan
      // Mantenemos los cursos equivalentes visibles en la sección inferior
      return true;
    });
  }, [rawAvance, localPlanMap]);

  const hoveredCourse = hovered ? PLAN_ESTUDIOS_SOFTWARE.find(c => c.codigo === hovered) : null;

  const renderEdge = ({ from, to }, i) => {
    const sp = positions[from];
    const tp = positions[to];
    if (!sp || !tp) return null;

    const x1 = sp.x + N_W;
    const y1 = sp.y + N_H / 2;
    const x2 = tp.x - 6;
    const y2 = tp.y + N_H / 2;
    const dx = Math.max(28, Math.abs(x2 - x1) * 0.42);
    const d = `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;

    const edgeKey = `${from}→${to}`;
    const isHov = hovConnSet?.has(edgeKey);
    const prereqOk = cursosAprobados.has(norm(from));
    const stroke = prereqOk ? '#22c55e' : '#4a5568';
    const opacity = hovered ? (isHov ? 0.9 : 0.04) : 0.28;

    return (
      <path
        key={edgeKey + i}
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={isHov ? 2 : 1}
        strokeDasharray={prereqOk ? 'none' : '5,4'}
        opacity={opacity}
        markerEnd={prereqOk ? 'url(#ah-green)' : 'url(#ah-gray)'}
        style={{ transition: 'opacity 0.12s' }}
      />
    );
  };

  const renderNode = (course) => {
    const p = positions[course.codigo];
    if (!p) return null;
    const status = getStatus(course.codigo);
    const s = STATUS_STYLE[status];
    const isHov = hovered === course.codigo;
    const isRel = hovRelated ? hovRelated.has(course.codigo) : true;
    const opacity = hovered ? (isRel ? 1 : 0.18) : 1;
    const name = course.nombre || '';
    const shortName = name.length > 22 ? name.slice(0, 21) + '…' : name;

    return (
      <g
        key={course.codigo}
        transform={`translate(${p.x},${p.y})`}
        style={{ cursor: 'pointer', opacity, transition: 'opacity 0.12s' }}
        onMouseEnter={() => setHovered(course.codigo)}
        onMouseLeave={() => setHovered(null)}
        onClick={() => setSelectedNode(course.codigo)}
      >
        {isHov && (
          <rect x={-3} y={-3} width={N_W + 6} height={N_H + 6} rx={9}
            fill="none" stroke={s.accent} strokeWidth={2} opacity={0.45} />
        )}
        <rect x={0} y={0} width={N_W} height={N_H} rx={6}
          fill={s.fill} stroke={s.stroke} strokeWidth={isHov ? 1.5 : 1} />
        <text x={N_W / 2} y={16} textAnchor="middle"
          fontSize={10.5} fontWeight="700" fontFamily="monospace" fill={s.accent}>
          {course.codigo}
        </text>
        <text x={N_W / 2} y={30} textAnchor="middle"
          fontSize={8.5} fill={s.text} fontFamily="ui-sans-serif,system-ui,sans-serif">
          {shortName}
        </text>
        <text x={N_W / 2} y={43} textAnchor="middle"
          fontSize={8} fill={s.text} opacity={0.6} fontFamily="ui-sans-serif,system-ui,sans-serif">
          {course.creditos} cr
        </text>
      </g>
    );
  };

  // ── Click modal ──
  const NodeModal = () => {
    if (!selectedNode) return null;
    const planCourse = PLAN_ESTUDIOS_SOFTWARE.find(c => c.codigo === selectedNode);

    let isConvalidadoPor: string | null = null;
    let avanceEntry: any = rawAvance.find((c: any) => norm(c.codigo) === norm(selectedNode));
    if (!avanceEntry) {
      avanceEntry = rawAvance.find((c: any) => {
        if (!c.observacion) return false;
        const em = c.observacion.match(/EQUIV\.\s*CON\s+([A-Z0-9]+)/i);
        if (em && norm(em[1]) === norm(selectedNode)) { isConvalidadoPor = c.codigo; return true; }
        return false;
      });
    }

    const periods = cicloByCode[norm(isConvalidadoPor || selectedNode)] || [];
    const status  = getStatus(selectedNode);
    const s       = STATUS_STYLE[status];
    const sections = cargaMap[selectedNode] ? Object.entries(cargaMap[selectedNode]) : [];
    const TIPO: Record<string, string> = { T: 'Teoría', P: 'Práctica', L: 'Laboratorio' };
    const DAY_S: Record<string, string> = { LU: 'Lu', MA: 'Ma', MI: 'Mi', JU: 'Ju', VI: 'Vi', SA: 'Sa' };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{
          backgroundColor: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)',
          padding: '32px',
        }}
        onClick={() => setSelectedNode(null)}
      >
        <div
          style={{
            background: '#0e1120', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 20, boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
            width: '100%', maxWidth: 520, overflow: 'hidden',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ── */}
          <div style={{ padding: '28px 32px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', letterSpacing: '0.06em', color: s.accent }}>
                    {selectedNode}
                  </span>
                  <span style={{
                    padding: '3px 10px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700,
                    color: s.accent, background: s.fill, border: `1px solid ${s.stroke}55`,
                  }}>
                    {isConvalidadoPor ? 'Convalidado' : s.label}
                  </span>
                </div>
                <p style={{ color: '#fff', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.4, marginBottom: 6 }}>
                  {planCourse?.nombre || avanceEntry?.nombre || '—'}
                </p>
                {planCourse && (
                  <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}>
                    Ciclo {planCourse.ciclo} del plan · {planCourse.creditos} créditos
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                style={{
                  color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: '1rem', lineHeight: 1,
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 8, flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: '24px 32px 32px', display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '70vh', overflowY: 'auto' }}>

            {/* Stats (solo si hay registro) */}
            {avanceEntry && (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {/* Nota */}
                  <div className="bg-black/35 rounded-xl p-4 text-center">
                    <div className={`text-4xl font-extrabold leading-none ${(avanceEntry.nota ?? 0) >= 10 ? 'text-green-400' : 'text-red-400'}`}>
                      {avanceEntry.nota ?? '—'}
                    </div>
                    <div className="text-[11px] text-white/30 mt-2 uppercase tracking-wider">Nota</div>
                  </div>
                  {/* Veces */}
                  <div className="bg-black/35 rounded-xl p-4 text-center">
                    <div className={`text-4xl font-extrabold leading-none ${(avanceEntry.veces ?? 1) > 1 ? 'text-amber-400' : 'text-white/55'}`}>
                      {avanceEntry.veces ?? '—'}
                    </div>
                    <div className="text-[11px] text-white/30 mt-2 uppercase tracking-wider">
                      {(avanceEntry.veces ?? 1) > 1 ? 'Veces ⚠' : 'Veces'}
                    </div>
                  </div>
                  {/* Estado */}
                  <div className="bg-black/35 rounded-xl p-4 text-center flex flex-col items-center justify-center">
                    <div className={`text-sm font-bold ${
                      (avanceEntry.estado === 'CONVAL' || isConvalidadoPor) ? 'text-indigo-400' :
                      avanceEntry.estado?.toUpperCase().startsWith('N') ? 'text-green-400' :
                      avanceEntry.estado?.toUpperCase().startsWith('REP') ? 'text-red-400' :
                      'text-amber-400'
                    }`}>
                      {isConvalidadoPor ? 'CONVAL' : avanceEntry.estado}
                    </div>
                    <div className="text-[11px] text-white/30 mt-2 uppercase tracking-wider">Estado</div>
                  </div>
                </div>

                {/* Convalidación info */}
                {(isConvalidadoPor || avanceEntry.observacion) && (
                  <div className="bg-indigo-950/40 border border-indigo-400/20 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-indigo-400 text-base shrink-0">ℹ</span>
                    <span className="text-indigo-300 text-xs">
                      {isConvalidadoPor ? `Convalidado mediante ${isConvalidadoPor}` : avanceEntry.observacion}
                    </span>
                  </div>
                )}

                {/* Historial de ciclos */}
                {periods.length > 0 && (
                  <div>
                    <p className="text-[11px] text-white/25 uppercase tracking-wider mb-2">Historial</p>
                    <div className="flex flex-wrap gap-2">
                      {periods.map((p: any, i: number) => (
                        <div key={i} className="bg-black/30 border border-white/6 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                          <span className="font-mono text-white/45">{p.ciclo}</span>
                          <span className={`font-bold ${(p.nota ?? 0) >= 10 ? 'text-green-400' : 'text-red-400'}`}>
                            {p.nota ?? '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!avanceEntry && status !== 'bloqueado' && (
              <div className="bg-amber-950/30 border border-amber-500/15 rounded-xl px-4 py-3 text-xs text-amber-300/80">
                ✓ Puedes matricularte en este curso este ciclo.
              </div>
            )}

            {/* Secciones disponibles (solo para aptos/inscritos) */}
            {(status === 'apto' || status === 'inscrito') && sections.length > 0 && (() => {
              const miSeccion = inscritoSeccionMap[norm(selectedNode)];
              return (
                <div>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
                    Secciones disponibles
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sections.map(([sec, data]: [string, any]) => {
                      const esLaMia = miSeccion && miSeccion === sec;
                      const borderColor = esLaMia ? '#60a5fa' : 'rgba(251,191,36,0.15)';
                      const bgColor    = esLaMia ? 'rgba(30,58,138,0.35)' : 'rgba(120,53,15,0.2)';
                      return (
                        <div key={sec} style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 12, padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: esLaMia ? '#60a5fa' : '#fbbf24', fontSize: '0.78rem' }}>
                                Sección {sec}
                              </span>
                              {esLaMia && (
                                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 99, padding: '2px 8px', letterSpacing: '0.04em' }}>
                                  MATRICULADO AQUÍ
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>{data.vacantes} vacantes</span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                            {data.sessions.map((ss: any, si: number) => (
                              <span key={si} style={{
                                fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)',
                                background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 6, padding: '3px 8px',
                              }}>
                                {DAY_S[ss.dia] ?? ss.dia} {ss.inicio}:00–{ss.fin}:00 · {TIPO[ss.tipo] || ss.tipo} · {ss.aula}
                              </span>
                            ))}
                          </div>
                          <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>{data.docente}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Prerrequisitos */}
            {planCourse && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                <p className="text-[11px] text-white/25 uppercase tracking-wider mb-2">Prerrequisitos</p>
                {(planCourse.preRequisitos || []).length === 0
                  ? <span className="text-white/30 text-xs italic">Ninguno</span>
                  : <div className="flex flex-wrap gap-1.5">
                      {planCourse.preRequisitos.map((pr: string) => {
                        const ps = getStatus(pr);
                        const ok = ps === 'aprobado' || ps === 'convalidado' || ps === 'inscrito';
                        return (
                          <span key={pr} className={`font-mono text-xs px-2 py-0.5 rounded-md border ${
                            ok ? 'text-green-400 border-green-500/25 bg-green-950/30'
                               : 'text-red-400 border-red-500/25 bg-red-950/30'
                          }`}>
                            {pr} {ok ? '✓' : '✗'}
                          </span>
                        );
                      })}
                    </div>
                }
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-auto">

      {/* Legend / hover info bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 min-h-[28px]">
        {hoveredCourse ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs bg-black/40 border border-white/10 rounded-lg px-3 py-2 w-full">
            <span className="font-mono font-bold" style={{ color: STATUS_STYLE[getStatus(hoveredCourse.codigo)].accent }}>
              {hoveredCourse.codigo}
            </span>
            <span className="text-white font-medium">{hoveredCourse.nombre}</span>
            <span className="text-white/40">{hoveredCourse.creditos} cr · Ciclo {hoveredCourse.ciclo}</span>
            {hoveredCourse.preRequisitosRaw && (
              <span className="text-white/30">
                Prereq: <span className="font-mono text-white/45">{hoveredCourse.preRequisitosRaw}</span>
              </span>
            )}
            <span className="ml-auto text-white/25 text-[10px]">clic para ver detalles</span>
          </div>
        ) : (
          <>
            {Object.entries(STATUS_STYLE).map(([key, s]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-white/45">
                <span className="w-3 h-3 rounded-sm inline-block border"
                  style={{ backgroundColor: s.fill, borderColor: s.stroke }} />
                {s.label}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-xs text-white/30 ml-2">
              <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#22c55e" strokeWidth="1.5" /></svg>
              Prereq. cumplido
            </span>
            <span className="flex items-center gap-1.5 text-xs text-white/30">
              <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4,3" /></svg>
              Prereq. pendiente
            </span>
          </>
        )}
      </div>

      {/* SVG graph */}
      <div className="overflow-x-auto rounded-xl border border-white/8 bg-black/20 flex-shrink-0">
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          <defs>
            <marker id="ah-green" markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,7 3,0 6" fill="#22c55e" opacity="0.7" />
            </marker>
            <marker id="ah-gray" markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0,7 3,0 6" fill="#4a5568" opacity="0.7" />
            </marker>
          </defs>

          {Array.from({ length: 10 }, (_, i) => (
            <text key={i}
              x={PAD_X + i * C_W + N_W / 2}
              y={PAD_Y + 13}
              textAnchor="middle"
              fontSize={10}
              fontWeight="600"
              fill="#4a5568"
              fontFamily="ui-sans-serif,system-ui,sans-serif"
            >
              Ciclo {i + 1}
            </text>
          ))}

          {edges.map((e, i) => renderEdge(e, i))}
          {PLAN_ESTUDIOS_SOFTWARE.map(renderNode)}
        </svg>
      </div>

      {/* Electivos */}
      {electivos.length > 0 && (
        <div className="pb-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-400 inline-block" />
            Cursos Extracurriculares ({electivos.length})
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {electivos.map((c, i) => (
              <div key={i} style={{
                background: 'rgba(88,28,135,0.28)', border: '1px solid rgba(168,85,247,0.22)',
                borderRadius: 10, padding: '12px 16px', minWidth: 160,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#c084fc', fontSize: '0.72rem' }}>{c.codigo}</div>
                <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', lineHeight: 1.3 }}>
                  {c.nombre && c.nombre.length >= 4 ? c.nombre : 'Curso electivo'}
                </div>
                {c.nota != null && (
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: c.nota >= 10 ? '#4ade80' : '#f87171', marginTop: 2 }}>
                    Nota: {c.nota}
                  </div>
                )}
                {c.observacion && (
                  <div style={{ fontSize: '0.65rem', color: 'rgba(96,165,250,0.7)' }}>{c.observacion}</div>
                )}
                {c.estado && (
                  <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>{c.estado}</div>
                )}
                {(() => {
                  const p = cicloByCode[norm(c.codigo)]?.[0];
                  return p ? (
                    <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)' }}>Ciclo: {p.ciclo}</div>
                  ) : null;
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      <NodeModal />
    </div>
  );
}
