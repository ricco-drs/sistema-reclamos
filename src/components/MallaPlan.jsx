import { useMemo, useState } from 'react';

// Mapa de prerrequisitos de un plan de estudios: una columna por ciclo y cada
// curso en su pista temática (el campo `fila` del JSON), de modo que las cadenas
// —cálculo, química, gestión— se leen como líneas horizontales. La pista viene
// en los datos y no calculada, porque un layout automático reordena los cursos y
// deja de parecerse al mapa que la facultad ya usa.
//
// Sirve para cualquier especialidad: recibe el plan y no importa nada suyo.

const ANCHO_NODO = 152;
const ALTO_NODO = 54;
const SEP_COLUMNA = 46;
const SEP_FILA = 20;
const PASO_X = ANCHO_NODO + SEP_COLUMNA;
const PASO_Y = ALTO_NODO + SEP_FILA;
const MARGEN_X = 24;
const ALTO_CABECERA = 42;
const ALTO_PIE = 40;
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// El prefijo del código ya codifica el área a la que pertenece el curso, así que
// se usa para colorear en vez de inventar una clasificación aparte.
const AREAS = {
  B: { nombre: 'Ciencias básicas y generales', color: '#64748b' },
  F: { nombre: 'Formación básica', color: '#0284c7' },
  H: { nombre: 'Humanidades', color: '#7c3aed' },
  T: { nombre: 'Tecnología e ingeniería', color: '#b45309' },
  G: { nombre: 'Gestión', color: '#0f766e' },
  S: { nombre: 'Sistemas y datos', color: '#be185d' },
};
const areaDe = (codigo) => AREAS[codigo[0]] || AREAS.B;

// Parte el nombre en líneas que quepan en el nodo. Se aproxima el ancho por
// número de caracteres porque medir texto real exigiría montar el SVG antes.
function repartirEnLineas(texto, maxCaracteres = 22, maxLineas = 3) {
  const palabras = texto.split(' ');
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const tentativa = actual ? `${actual} ${palabra}` : palabra;
    if (tentativa.length <= maxCaracteres) {
      actual = tentativa;
    } else {
      if (actual) lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  if (lineas.length <= maxLineas) return lineas;
  const recortadas = lineas.slice(0, maxLineas);
  recortadas[maxLineas - 1] = recortadas[maxLineas - 1].replace(/.{1}$/, '…');
  return recortadas;
}

export default function MallaPlan({ plan }) {
  const [activo, setActivo] = useState(null);
  const [area, setArea] = useState('TODAS');

  const { cursos, porCodigo, dependientes, ancho, alto, creditosPorCiclo, filas } = useMemo(() => {
    const cursos = plan.cursos.map((c) => ({
      ...c,
      x: MARGEN_X + (c.ciclo - 1) * PASO_X,
      y: ALTO_CABECERA + (c.fila - 1) * PASO_Y,
    }));
    const porCodigo = new Map(cursos.map((c) => [c.codigo, c]));

    // Índice inverso: qué cursos se desbloquean con cada uno. Permite resaltar la
    // cadena hacia adelante, que es lo que suele preguntar un estudiante.
    const dependientes = new Map();
    for (const c of cursos) {
      for (const pre of c.preRequisitos) {
        if (!dependientes.has(pre)) dependientes.set(pre, []);
        dependientes.get(pre).push(c.codigo);
      }
    }

    const creditosPorCiclo = {};
    for (const c of cursos) {
      creditosPorCiclo[c.ciclo] = (creditosPorCiclo[c.ciclo] || 0) + c.creditos;
    }

    // Los electivos van en una fila propia debajo de todas las pistas.
    const filas = Math.max(...plan.cursos.map((c) => c.fila)) + 1;

    return {
      cursos,
      porCodigo,
      dependientes,
      creditosPorCiclo,
      filas,
      ancho: MARGEN_X * 2 + 10 * PASO_X - SEP_COLUMNA,
      alto: ALTO_CABECERA + filas * PASO_Y + ALTO_PIE,
    };
  }, [plan]);

  // Cadena completa del curso activo: todo lo que exige antes y todo lo que abre
  // después. Se recorre en anchura porque las cadenas llegan a tener 8 niveles.
  const resaltados = useMemo(() => {
    if (!activo) return null;
    const marcados = new Set([activo]);
    const haciaAtras = [activo];
    while (haciaAtras.length) {
      const actual = porCodigo.get(haciaAtras.pop());
      for (const pre of actual?.preRequisitos || []) {
        if (!marcados.has(pre)) { marcados.add(pre); haciaAtras.push(pre); }
      }
    }
    const haciaAdelante = [activo];
    while (haciaAdelante.length) {
      for (const sig of dependientes.get(haciaAdelante.pop()) || []) {
        if (!marcados.has(sig)) { marcados.add(sig); haciaAdelante.push(sig); }
      }
    }
    return marcados;
  }, [activo, porCodigo, dependientes]);

  const visible = (codigo) => {
    if (resaltados) return resaltados.has(codigo);
    if (area !== 'TODAS') return codigo[0] === area;
    return true;
  };

  const aristas = useMemo(() => {
    const lista = [];
    for (const destino of cursos) {
      destino.preRequisitos.forEach((pre, i) => {
        const origen = porCodigo.get(pre);
        if (!origen) return;
        const x1 = origen.x + ANCHO_NODO;
        const y1 = origen.y + ALTO_NODO / 2;
        const x2 = destino.x;
        const y2 = destino.y + ALTO_NODO / 2;
        // El codo se separa un poco por cada prerrequisito del mismo destino para
        // que dos flechas que llegan al mismo nodo no se dibujen encima.
        const codo = x1 + SEP_COLUMNA / 2 + (i - (destino.preRequisitos.length - 1) / 2) * 7;
        const d = y1 === y2
          ? `M ${x1} ${y1} L ${x2} ${y2}`
          : `M ${x1} ${y1} L ${codo} ${y1} L ${codo} ${y2} L ${x2} ${y2}`;
        lista.push({ d, origen: pre, destino: destino.codigo });
      });
    }
    return lista;
  }, [cursos, porCodigo]);

  const detalle = activo ? porCodigo.get(activo) : null;

  return (
    <div className="malla-industrial">
      <div className="malla-barra">
        <div>
          <h2 className="malla-titulo">Plan de estudios {plan.plan} — {plan.especialidad}</h2>
          <p className="malla-sub">
            {plan.cursos.length} cursos obligatorios · {plan.creditosObligatorios} créditos obligatorios ·{' '}
            {plan.creditosElectivos} electivos
            {plan.creditosComplementarios ? ` · ${plan.creditosComplementarios} complementarios` : ''} ·{' '}
            <strong>{plan.creditosTotales} en total</strong>
          </p>
        </div>
        <div className="malla-filtros">
          <button
            className={`malla-chip ${area === 'TODAS' && !activo ? 'activo' : ''}`}
            onClick={() => { setArea('TODAS'); setActivo(null); }}
          >
            TODAS
          </button>
          {Object.entries(AREAS).map(([inicial, info]) => (
            <button
              key={inicial}
              className={`malla-chip ${area === inicial && !activo ? 'activo' : ''}`}
              onClick={() => { setArea(inicial); setActivo(null); }}
              style={{ '--chip': info.color }}
            >
              <span className="malla-punto" style={{ background: info.color }} />
              {info.nombre}
            </button>
          ))}
        </div>
      </div>

      {detalle && (
        <div className="malla-detalle">
          <div>
            <span className="malla-detalle-codigo" style={{ color: areaDe(detalle.codigo).color }}>
              {detalle.codigo}
            </span>
            <strong>{detalle.nombre}</strong>
            <span className="malla-detalle-meta">
              Ciclo {ROMANOS[detalle.ciclo - 1]} · {detalle.creditos} créditos ·{' '}
              {detalle.horasTeoria}h teoría + {detalle.horasPracticaLab}h práctica ·
              sistema {detalle.sistemaEvaluacion}
            </span>
            <span className="malla-detalle-meta">
              Exige: {detalle.preRequisitos.length
                ? detalle.preRequisitos.map((p) => porCodigo.get(p)?.nombre || p).join(', ')
                : 'ningún curso previo'}
              {' · '}
              Habilita: {(dependientes.get(detalle.codigo) || []).length
                ? dependientes.get(detalle.codigo).map((p) => porCodigo.get(p)?.nombre || p).join(', ')
                : 'ningún curso posterior'}
            </span>
          </div>
          <button className="malla-cerrar" onClick={() => setActivo(null)}>QUITAR SELECCIÓN [X]</button>
        </div>
      )}

      <div className="malla-lienzo">
        <svg width={ancho} height={alto} role="img" aria-label={`Mapa de prerrequisitos del plan ${plan.plan} de ${plan.especialidad}`}>
          <defs>
            <marker id="punta" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--malla-linea)" />
            </marker>
            <marker id="punta-viva" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--primary-accent)" />
            </marker>
          </defs>

          {/* Cabecera de ciclos */}
          {ROMANOS.map((romano, i) => (
            <g key={romano}>
              <rect
                x={MARGEN_X + i * PASO_X} y={6}
                width={ANCHO_NODO} height={26} rx={6}
                fill="var(--malla-ciclo-fondo)" stroke="var(--malla-ciclo-borde)"
              />
              <text
                x={MARGEN_X + i * PASO_X + ANCHO_NODO / 2} y={23}
                textAnchor="middle" fontSize="12" fontWeight="700"
                fill="var(--malla-ciclo-texto)" letterSpacing="1.5"
              >
                CICLO {romano}
              </text>
            </g>
          ))}

          {/* Flechas de prerrequisito */}
          {aristas.map(({ d, origen, destino }) => {
            const vivo = resaltados && resaltados.has(origen) && resaltados.has(destino);
            const apagado = (resaltados && !vivo) || (area !== 'TODAS' && !resaltados && !(origen[0] === area && destino[0] === area));
            return (
              <path
                key={`${origen}-${destino}`}
                d={d}
                fill="none"
                stroke={vivo ? 'var(--primary-accent)' : 'var(--malla-linea)'}
                strokeWidth={vivo ? 2 : 1.2}
                markerEnd={vivo ? 'url(#punta-viva)' : 'url(#punta)'}
                opacity={apagado ? 0.12 : 1}
              />
            );
          })}

          {/* Cursos */}
          {cursos.map((c) => {
            const info = areaDe(c.codigo);
            const activoEste = activo === c.codigo;
            const apagado = !visible(c.codigo);
            const lineas = repartirEnLineas(c.nombre);
            return (
              <g
                key={c.codigo}
                transform={`translate(${c.x} ${c.y})`}
                onClick={() => setActivo(activoEste ? null : c.codigo)}
                style={{ cursor: 'pointer' }}
                opacity={apagado ? 0.18 : 1}
              >
                <rect
                  width={ANCHO_NODO} height={ALTO_NODO} rx={7}
                  fill="var(--malla-nodo-fondo)"
                  stroke={activoEste ? 'var(--primary-accent)' : info.color}
                  strokeWidth={activoEste ? 2.5 : 1.4}
                />
                <rect width={4} height={ALTO_NODO} rx={2} fill={info.color} />
                {lineas.map((linea, i) => (
                  <text
                    key={i}
                    x={ANCHO_NODO / 2} y={16 + i * 11}
                    textAnchor="middle" fontSize="9.5" fontWeight="600"
                    fill="var(--malla-nodo-texto)"
                  >
                    {linea}
                  </text>
                ))}
                <text x={10} y={ALTO_NODO - 7} fontSize="9" fontWeight="700" fill={info.color} fontFamily="ui-monospace, monospace">
                  {c.codigo}
                </text>
                <text x={ANCHO_NODO - 10} y={ALTO_NODO - 7} textAnchor="end" fontSize="9" fill="var(--malla-nodo-meta)">
                  {c.creditos} cr
                </text>
              </g>
            );
          })}

          {/* Electivos: no son cursos concretos, van como bloque por ciclo. Los
              créditos cambian de ciclo a ciclo y entre especialidades, así que
              cada bloque trae el suyo. */}
          {plan.electivos.map(({ ciclo, creditos }) => {
            return (
              <g key={`elect-${ciclo}`} opacity={resaltados || area !== 'TODAS' ? 0.18 : 1}>
                <rect
                  x={MARGEN_X + (ciclo - 1) * PASO_X}
                  y={ALTO_CABECERA + (filas - 1) * PASO_Y}
                  width={ANCHO_NODO} height={ALTO_NODO} rx={7}
                  fill="var(--malla-electivo-fondo)"
                  stroke="var(--malla-electivo-borde)"
                  strokeDasharray="5 3" strokeWidth={1.4}
                />
                <text
                  x={MARGEN_X + (ciclo - 1) * PASO_X + ANCHO_NODO / 2}
                  y={ALTO_CABECERA + (filas - 1) * PASO_Y + 26}
                  textAnchor="middle" fontSize="10" fontWeight="700"
                  fill="var(--malla-electivo-texto)"
                >
                  Electivos
                </text>
                <text
                  x={MARGEN_X + (ciclo - 1) * PASO_X + ANCHO_NODO / 2}
                  y={ALTO_CABECERA + (filas - 1) * PASO_Y + 41}
                  textAnchor="middle" fontSize="9"
                  fill="var(--malla-electivo-texto)"
                >
                  {creditos} cr
                </text>
              </g>
            );
          })}

          {/* Pie: créditos obligatorios de cada ciclo */}
          {ROMANOS.map((_, i) => (
            <text
              key={`pie-${i}`}
              x={MARGEN_X + i * PASO_X + ANCHO_NODO / 2}
              y={ALTO_CABECERA + filas * PASO_Y + 22}
              textAnchor="middle" fontSize="10.5" fontWeight="700"
              fill="var(--text-dim)"
            >
              {creditosPorCiclo[i + 1]} créditos
            </text>
          ))}
        </svg>
      </div>

      <p className="malla-pista">
        Haz clic en un curso para ver su cadena completa de prerrequisitos y todo lo que desbloquea.
      </p>
    </div>
  );
}
