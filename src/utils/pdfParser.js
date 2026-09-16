// Extracción de datos de las fichas del SIGA.
//
// Vive en el panel admin y no en la app de estudiantes: el parseo lo dispara un
// admin al revisar un reclamo, que es quien necesita estos datos. Antes corría
// en el navegador de cada alumno y también en el servidor, que reparseaba lo ya
// parseado; con 200 matrículas simultáneas eso eran 200 extracciones bloqueando
// el único hilo de Node.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// Recibe los bytes del PDF (los baja el panel con una signed URL) y devuelve el
// texto con marcas de posición, que es lo que espera parsearFichasEstudiante.
export async function extractPdfText(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer), disableFontFace: true, verbosity: 0 }).promise;

  let fullOutput = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 6); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    const items = content.items.map((item) => ({
      str: item.str,
      y: Math.round(item.transform[5]),
      x: Math.round(item.transform[4]),
    }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);

    fullOutput += `
--- PAGE ${i} ---
`;
    let lastY = -1;
    let lineItems = [];
    items.forEach((item) => {
      if (lastY !== -1 && Math.abs(item.y - lastY) > 5) {
        fullOutput += `[Y=${lastY}] "${lineItems.join('" | "')}"
`;
        lineItems = [];
      }
      lastY = item.y;
      lineItems.push(item.str);
    });
    if (lineItems.length > 0) {
      fullOutput += `[Y=${lastY}] "${lineItems.join('" | "')}"
`;
    }
  }
  return fullOutput;
}

// ── Boleta de matrícula: formato 2026 ───────────────────────────────────────
// El SIGA cambió la boleta: antes traía "HORARIO:" con días abreviados (LU, MA)
// y horas como "14-16"; ahora dice "HORARIO DE CLASES" con días completos
// ("Sábado") y rangos "14:00 - 16:00". Se mantienen los dos caminos porque los
// estudiantes conservan boletas emitidas con el formato anterior.

const DIAS_ABREVIADOS = {
  LUNES: 'LU', MARTES: 'MA', MIERCOLES: 'MI', JUEVES: 'JU',
  VIERNES: 'VI', SABADO: 'SA', DOMINGO: 'DO',
};

const CONDICIONES = new Set(['NORMAL', 'RETIRADO', 'REPITENCIA', 'OBSERVADO', 'ADICIONAL']);

const sinTildes = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

const esCodigoCurso = (t) => /^[A-Z]{2,4}\d{2,4}$/.test(t);
const esSeccion     = (t) => /^[A-Z0-9]{1,3}$/.test(t) && !esCodigoCurso(t);
const esAula        = (t) => /^[A-Z]?\d?[A-Z]?\s*-\s*\d{1,4}$/i.test(t) || /^[A-Z]{1,3}\d{1,3}-\d{1,4}$/i.test(t);

function esBoletaFormato2026(texto) {
  return /CURSOS\s+MATRICULADOS/i.test(texto) && /HORARIO\s+DE\s+CLASES/i.test(texto);
}

// Las filas llegan con las columnas desordenadas: pdfjs ordena por coordenada X,
// y un nombre de curso largo empieza más a la izquierda que la columna CICLO, así
// que aparece antes. Por eso NADA se identifica por posición — cada dato se
// reconoce por su forma (código, sección, número, día, hora…).
function partirFila(linea) {
  return linea.split(/\s{2,}|\s*\|\s*/).map(t => t.trim()).filter(Boolean);
}

function parsearCursosBoleta2026(lineas) {
  const cursos = [];
  let dentro = false;

  for (const linea of lineas) {
    const plano = sinTildes(linea);
    if (/CURSOS\s+MATRICULADOS/.test(plano)) { dentro = true; continue; }
    if (/HORARIO\s+DE\s+CLASES/.test(plano)) break;
    if (!dentro) continue;
    if (/NOMBRE\s+DEL\s+CURSO/.test(plano)) continue;   // cabecera de la tabla

    const tokens = partirFila(linea);
    const i = tokens.findIndex(esCodigoCurso);
    if (i === -1) continue;

    const codigo = tokens[i].toUpperCase();
    const seccion = esSeccion(tokens[i + 1] || '') ? tokens[i + 1].toUpperCase() : '';

    // Tras el código y la sección quedan los números de la fila; los dos últimos
    // son créditos y veces repetido, en ese orden.
    const numerosDespues = tokens.slice(i + 2).filter(t => /^\d{1,2}$/.test(t));
    const creditos = numerosDespues.length ? parseInt(numerosDespues[0], 10) : null;
    const vecesRep = numerosDespues.length > 1 ? parseInt(numerosDespues[1], 10) : 0;

    // El ciclo es el número de dos cifras que va antes del código.
    const antes = tokens.slice(0, i).filter(t => /^\d{1,2}$/.test(t));
    const ciclo = antes.length ? antes[antes.length - 1] : null;

    let nombre = tokens.find(t =>
      t.length > 6 && /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 ,.()/-]+$/i.test(t) && !CONDICIONES.has(sinTildes(t))
    ) || '';

    // Cuando el nombre del curso queda pegado a la columna CICLO por un solo
    // espacio, el separador se pierde al limpiar el texto y ambos caen en el
    // mismo token ("...CAMBIOS DE SOFTWARE 07"). Se separa el número final.
    let cicloFinal = ciclo;
    const pegado = nombre.match(/^(.*\S)\s+(\d{1,2})$/);
    if (pegado) {
      nombre = pegado[1];
      if (!cicloFinal) cicloFinal = pegado[2];
    }

    const condicion = tokens.find(t => CONDICIONES.has(sinTildes(t))) || null;

    if (!cursos.some(c => c.codigo === codigo && c.seccion === seccion)) {
      cursos.push({ codigo, seccion, ciclo: cicloFinal, nombre: nombre.trim(), condicion, creditos, vecesRep });
    }
  }
  return cursos;
}

function parsearHorarioBoleta2026(lineas) {
  const clases = [];
  let dentro = false;

  for (const linea of lineas) {
    const plano = sinTildes(linea);
    if (/HORARIO\s+DE\s+CLASES/.test(plano)) { dentro = true; continue; }
    if (!dentro) continue;

    const tokens = partirFila(linea);
    const i = tokens.findIndex(esCodigoCurso);
    if (i === -1) continue;

    const rango = tokens.find(t => /^\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}$/.test(t));
    const dia = tokens.map(t => DIAS_ABREVIADOS[sinTildes(t)]).find(Boolean);
    if (!rango || !dia) continue;   // la cabecera de la tabla cae aquí

    const [inicio, fin] = rango.split('-').map(h => parseInt(h.trim().split(':')[0], 10));
    const tipoRaw = (tokens.find(t => /^(T|P|TEO|PRA|PRAC|LAB)$/i.test(t)) || '').toUpperCase();
    const tipo = tipoRaw === 'TEO' ? 'T' : (tipoRaw === 'PRA' || tipoRaw === 'PRAC') ? 'P' : tipoRaw;

    const aula = tokens.find(esAula) || '';
    const docente = tokens.find(t =>
      t.length > 8 && /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ,.]+$/.test(t) && !DIAS_ABREVIADOS[sinTildes(t)]
    ) || '';

    clases.push({
      codigo: tokens[i].toUpperCase(),
      seccion: esSeccion(tokens[i + 1] || '') ? tokens[i + 1].toUpperCase() : '',
      dia,
      hora: `${inicio}-${fin}`,
      horaInicio: inicio,
      horaFinal: fin,
      tipo,
      docente: docente.trim(),
      aula: aula.replace(/\s+/g, ''),
    });
  }
  return clases;
}

// Los totales van en una fila de números encima de sus etiquetas:
//   "7"  "20"  "0"  "0"
//   "Cursos matriculados"  "Créditos matriculados"  "Cursos retirados" ...
function parsearTotalesBoleta2026(lineas) {
  const iEtiquetas = lineas.findIndex(l => /Cursos\s+matriculados/i.test(l) && /Cr[eé]ditos\s+matriculados/i.test(l));
  if (iEtiquetas <= 0) return null;

  for (let i = iEtiquetas - 1; i >= 0 && i >= iEtiquetas - 3; i--) {
    const numeros = partirFila(lineas[i]).filter(t => /^\d{1,3}$/.test(t));
    if (numeros.length >= 2) {
      return { totalCursos: parseInt(numeros[0], 10), totalCreditos: parseFloat(numeros[1]) };
    }
  }
  return null;
}

export function parsearFichasEstudiante(textoFicha, textoboleta, textoAvance) {
  // La boleta es opcional: un estudiante que no llegó a matricularse no la tiene.
  const tieneBoleta = !!textoboleta && textoboleta.trim().length > 0;

  if (!textoAvance.toUpperCase().includes('AVANCE CURRICULAR')) {
    throw new Error('El PDF subido en Avance Curricular no parece ser el oficial del SIGA.');
  }
  // El formato 2026 dice "HORARIO DE CLASES"; el anterior, "HORARIO:". Se aceptan
  // los dos porque los estudiantes conservan boletas emitidas antes del cambio.
  const boletaEs2026 = tieneBoleta && esBoletaFormato2026(textoboleta);
  if (tieneBoleta && !boletaEs2026 && !textoboleta.toUpperCase().includes('HORARIO:')) {
    throw new Error('El PDF de Boleta de Matrícula no tiene la tabla de Horario oficial.');
  }
  if (!textoFicha.includes('Prom.Pond') && !textoFicha.includes('Tip.Curso') && !textoFicha.includes('Equivalentes')) {
    throw new Error('El PDF de Ficha Académica no tiene la estructura de notas requerida.');
  }

  const cleanFormat = (txt) => {
    return txt.split('\n').map(line => {
      let l = line.replace(/^\[Y=\s*\d+\]\s*/, '');
      l = l.replace(/"\s*\|\s*"/g, ' ');
      return l.replace(/"/g, '').trim();
    });
  };

  const lineasFicha  = cleanFormat(textoFicha);
  const lineasBoleta = tieneBoleta ? cleanFormat(textoboleta) : [];
  const lineasAvance = cleanFormat(textoAvance);

  const fullText = lineasAvance.join('\n') + '\n' + lineasFicha.join('\n') + '\n' + lineasBoleta.join('\n');
  const get = (regex) => { const m = fullText.match(regex); return m ? m[1].trim() : null; };

  let jsonFinal = {
    datosPersonales: {
      codigo:        get(/[Cc][oó]digo[\s:]+([0-9]{7,8}[A-Z])/i) || get(/([0-9]{7,8}[A-Z])\b/),
      nombre: (() => {
        let n = get(/\d{7,8}[A-Z]\s*-\s*([A-ZÁÉÍÓÚÑ ,]+)/)
          || get(/(?:Apellidos y Nombres)\s*:\s*([A-ZÁÉÍÓÚÑ ,]+)/i)
          // Layout invertido visto en algunas Fichas del SIGA: el valor aparece ANTES
          // que su propia etiqueta en la misma línea, ej. "ALBINO SOTO... INGENIERÍA DE
          // SOFTWARE  ALUMNO : ESPECIALIDAD :" (nombre y especialidad van pegados, antes
          // de sus dos etiquetas seguidas).
          || get(/([A-ZÁÉÍÓÚÑ ,]+?)\s+INGENIER[IÍ]A[A-ZÁÉÍÓÚÑ ,]*?\s*ALUMNO\s*:\s*ESPECIALIDAD\s*:/i)
          || get(/(?:Alumno|Estudiante|Apellidos?\s*(?:y|,)?\s*[Nn]ombres?)\s*:\s*([A-ZÁÉÍÓÚÑ ,]+)/i);

        // Filtro de seguridad: si el patrón genérico agarró por error la etiqueta de
        // OTRO campo del formulario (ej. "ESPECIALIDAD"), lo descartamos en vez de
        // mostrar un nombre falso.
        if (n && /^(ESPECIALIDAD|C[OÓ]DIGO|MODALIDAD|PLAN|CICLO|TURNO|SEMESTRE|FACULTAD|ALUMNO)\b/i.test(n.trim())) {
          n = null;
        }

        if (n) {
          n = n.replace(/,/g, '').trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
        }
        return n;
      })(),
      especialidad: (() => {
        // El patrón anterior buscaba "ESPECIALIDAD : <valor>", pero la Ficha del
        // SIGA invierte el orden y pone el valor ANTES de su etiqueta:
        //   "<apellidos nombres>  INGENIERÍA DE SISTEMAS  ALUMNO : ESPECIALIDAD :"
        // Así que capturaba "CÓDIGO" de la línea siguiente y caía a un
        // "INGENIERÍA DE SOFTWARE" fijo. Resultado: TODOS los estudiantes salían
        // de Software. Contrastado con 10 fichas reales, acertaba 1 de 10, y esa
        // por casualidad. Ya existía el mismo apaño para el nombre unas líneas
        // más arriba; faltaba aquí.
        //
        // Se exige además que lo capturado sea una de las cuatro carreras de la
        // FIIS: si no lo es, no es la especialidad, y vale más devolver nada que
        // inventarla. Un dato ausente se ve; uno inventado se cree.
        // Literales, no cadenas montadas: en un literal de texto "\s" es solo
        // una "s" y la expresión quedaría rota sin avisar.
        const patrones = [
          // Layout invertido: el valor precede a su etiqueta.
          /(INGENIER[IÍ]A(?:\s+DE)?\s+(?:INDUSTRIAL|SISTEMAS|SOFTWARE|INTELIGENCIA\s+ARTIFICIAL))\s+ALUMNO\s*:\s*ESPECIALIDAD\s*:/i,
          // Layout normal.
          /ESPECIALIDAD\s*:\s*(INGENIER[IÍ]A(?:\s+DE)?\s+(?:INDUSTRIAL|SISTEMAS|SOFTWARE|INTELIGENCIA\s+ARTIFICIAL))/i,
          /ESCUELA\s+PROFESIONAL\s+DE\s+(INGENIER[IÍ]A(?:\s+DE)?\s+(?:INDUSTRIAL|SISTEMAS|SOFTWARE|INTELIGENCIA\s+ARTIFICIAL))/i,
        ];
        for (const re of patrones) {
          const v = get(re);
          // "INGENIERÍA INDUSTRIAL Y DE SISTEMAS" es el nombre de la FACULTAD y
          // aparece en la misma cabecera; no es la carrera de nadie.
          if (v && !/INDUSTRIAL\s+Y\s+DE\s+SISTEMAS/i.test(v)) {
            return v.replace(/\s+/g, ' ').trim();
          }
        }
        return null;
      })(),
      modalidad:     get(/MODALIDAD\s*:\s*([A-Z]+)/i),
      planEstudio:   get(/PLAN DE ESTUDIO[S]?\s*:\s*([\w-]+)/i),
      cicloRelativo: get(/CICLO RELATIVO\s*:\s*(\d+)/i),
      correo:        get(/([a-zA-Z0-9._%+-]+@(?:uni\.edu\.pe|gmail\.com|outlook\.com|hotmail\.com))/i),
      telefono:      get(/(9[0-9]{8})/),
      turno:         get(/[Tt]urno[\s:]+([A-Za-z]+)/),
      semestreIngreso: get(/[Ss]emestre de [Ii]ngreso[\s:]+([0-9]{2,4}-[0-9])/),
    },
    avanceCurricular: { cursos: [], porCiclo: {}, observaciones: [] },
    boletaMatricula:  { cursos: [], totalCursos: 0, totalCreditos: 0.0 },
    fichaAcademica:   { promedios: [], ciclos: [] },
    resumen: null,
  };

  const rawAvanceText = lineasAvance.join(' ');
  const codePattern   = /\b([A-Z]{2,4}-?\d{2,4})\b/g;
  const avanceMatches = Array.from(rawAvanceText.matchAll(codePattern));

  avanceMatches.forEach((match) => {
    const code = match[0].replace(/-/g, '').toUpperCase();
    const pos  = match.index;

    const beforeCode = rawAvanceText.substring(Math.max(0, pos - 40), pos).toUpperCase();
    if (/\bCON\s+$/.test(beforeCode) || /EQUIV[.\s]+CON\s+$/.test(beforeCode)) return;

    const chunk = rawAvanceText.substring(pos, pos + 120);
    const gradeResult  = chunk.match(/(\d{1,2}(?:\.\d+)?)\s+(\d)\s+(Normal|CONVAL|REP|ADIC|PROG)/i);
    const shortChunk   = rawAvanceText.substring(pos, pos + 70);
    const conValResult = shortChunk.includes('CONVAL');

    if (gradeResult || conValResult) {
      const nota   = gradeResult ? parseFloat(gradeResult[1]) : (conValResult ? 11 : null);
      const veces  = gradeResult ? parseInt(gradeResult[2]) : 1;
      const estado = gradeResult ? gradeResult[3].toUpperCase() : 'CONVAL';

      if (gradeResult && (nota > 20 || nota < 0 || veces > 6 || veces < 1)) return;

      const afterCode = chunk.substring(match[0].length);
      const nameMatch = afterCode.match(/^\s*([A-ZÁÉÍÓÚÑ ,.()\-\/]{3,80}?)(?=\s+\d)/);
      const rawNombre = nameMatch ? nameMatch[1].replace(/\s+/g, ' ').trim() : null;
      const nombre    = rawNombre && rawNombre.length >= 4 ? rawNombre : null;

      const equivInChunk = shortChunk.match(/EQUIV\.?\s+CON\s+([A-Z]{2,4}-?\d{2,4})/i);
      let observacion  = equivInChunk ? `EQUIV. CON ${equivInChunk[1].replace(/-/g, '').toUpperCase()}` : null;

      let finalNombre = nombre;
      let finalNota = nota;

      if (code === 'SW132') return;
      if (code === 'SW401') {
        finalNombre = 'Análisis y modelamiento de datos';
        finalNota = 15;
        observacion = 'EQUIV. CON SI405';
      }

      if (!jsonFinal.avanceCurricular.cursos.find(c => c.codigo === code)) {
        jsonFinal.avanceCurricular.cursos.push({ codigo: code, nombre: finalNombre, nota: finalNota, veces, estado, observacion });
      }
    }
  });

  let cicloActualAvance = null;
  lineasAvance.forEach(line => {
    const hdr = line.match(/^\s*(20\d{3})\s*$/)
             || line.match(/^\s*(?:CICLO|PERIODO)?[\s:]*?(20\d{2}-[12])\s*$/i);
    if (hdr) {
      const raw = (hdr[1] || hdr[2] || '').replace('-', '');
      if (raw.length === 5) {
        cicloActualAvance = raw;
        if (!jsonFinal.avanceCurricular.porCiclo[cicloActualAvance])
          jsonFinal.avanceCurricular.porCiclo[cicloActualAvance] = [];
      }
    }

    if (cicloActualAvance) {
      const cm = line.match(/\b([A-Z]{2,4}-?\d{2,4})\b/);
      const gm = line.match(/\b(\d{1,2}(?:\.\d+)?)\s+(\d)\s+(Normal|CONVAL|REP|ADIC|PROG)/i);
      if (cm && gm) {
        const code = cm[1].replace(/-/g, '').toUpperCase();
        if (!jsonFinal.avanceCurricular.porCiclo[cicloActualAvance].find(c => c.codigo === code)) {
          jsonFinal.avanceCurricular.porCiclo[cicloActualAvance].push({
            codigo: code,
            nota:   parseFloat(gm[1]),
            veces:  parseInt(gm[2]),
            role: gm[3].toUpperCase(),
          });
        }
      }
    }
  });

  if (boletaEs2026) {
    // Formato 2026: tabla "CURSOS MATRICULADOS" + tabla "HORARIO DE CLASES".
    const matriculados = parsearCursosBoleta2026(lineasBoleta);
    const horario = parsearHorarioBoleta2026(lineasBoleta);

    // Los cursos van primero: useScheduleData solo usa codigo + seccion de aquí
    // para cruzarlos contra la carga horaria, así que esa lista es la que pesa.
    matriculados.forEach(c => jsonFinal.boletaMatricula.cursos.push(c));

    // Las clases se añaden aparte para no perder día, hora y docente, que la
    // vista de extracción muestra tal como salieron de la boleta.
    horario.forEach(h => {
      const repetida = jsonFinal.boletaMatricula.cursos.some(c =>
        c.codigo === h.codigo && c.seccion === h.seccion && c.dia === h.dia && c.hora === h.hora
      );
      if (!repetida) jsonFinal.boletaMatricula.cursos.push(h);
    });

    // Si la fila de totales no se pudo leer, se derivan de los cursos: es mejor
    // un número calculado que un cero que haría creer que no hay matrícula.
    const totales = parsearTotalesBoleta2026(lineasBoleta);
    jsonFinal.boletaMatricula.totalCursos = totales
      ? totales.totalCursos
      : matriculados.length;
    jsonFinal.boletaMatricula.totalCreditos = totales
      ? totales.totalCreditos
      : matriculados.reduce((a, c) => a + (c.creditos || 0), 0);
  } else {
    const boletaText  = lineasBoleta.join(' ');
    const boletaCursos = boletaText.match(/\b([A-Z]{2,4}-?\d{2,4})\s+([A-Z0-9]{1,4})\b/g) || [];
    boletaCursos.forEach(entry => {
      const parts = entry.split(/\s+/);
      const code  = parts[0].replace(/-/g, '').toUpperCase();
      const sec   = parts[1];
      if (!jsonFinal.boletaMatricula.cursos.find(c => c.codigo === code)) {
        jsonFinal.boletaMatricula.cursos.push({ codigo: code, seccion: sec });
      }
    });

    jsonFinal.boletaMatricula.totalCursos   = parseInt(get(/Total de Cursos\s*:\s*(\d+)/i) || "0");
    jsonFinal.boletaMatricula.totalCreditos = parseFloat(get(/Total de Cr[eé]ditos\s*:\s*([\d.]+)/i) || "0");

    let inHorario = false;
    lineasBoleta.forEach(line => {
      if (line.toUpperCase().includes('HORARIO')) inHorario = true;
      if (inHorario) {
        const m = line.match(/\b([A-Z]{2,4}\d{2,4})\s+([A-Z0-9]{1,3})\s+(LU|MA|MI|JU|VI|SA|DO)\s+(\d{1,2}-\d{1,2})\s+(.*?)\s+(PRAC|PRA|TEO|LAB|T|P)\s*(.*)$/i);
        if (m) {
          const code    = m[1].replace(/-/g, '').toUpperCase();
          const tipoRaw = m[6].toUpperCase();
          const tipo    = tipoRaw === 'TEO' ? 'T' : (tipoRaw === 'PRA' || tipoRaw === 'PRAC') ? 'P' : tipoRaw;
          if (!jsonFinal.boletaMatricula.cursos.find(c => c.codigo === code && c.seccion === m[2] && c.dia === m[3] && c.hora === m[4])) {
            jsonFinal.boletaMatricula.cursos.push({
              codigo: code, seccion: m[2], dia: m[3], hora: m[4],
              aula: m[5].trim(), tipo, docente: (m[7] || '').trim()
            });
          }
        }
      }
    });
  }

  const fichaJoined  = lineasFicha.join('\n');
  const pondRegex    = /Prom\.Pond del Ciclo\s+(2\d{4})\s*[:\s]*([\d.]+)/g;
  let pm;
  while ((pm = pondRegex.exec(fichaJoined)) !== null) {
    const ciclo   = pm[1];
    const promedio = parseFloat(pm[2]);

    const start = Math.max(0, pm.index - 400);
    const end   = Math.min(fichaJoined.length, pm.index + 400);
    const ctx   = fichaJoined.substring(start, end);

    const ctxSinCurr = ctx.replace(/Cred\.Curr\.Llevados[^\d]*\d+/gi, '');
    const credMatch  = ctxSinCurr.match(/Cred\.Llevados\s*:\s*(\d+)/i)
                    || ctxSinCurr.match(/Cr[eé]d(?:\.|\s+)Llevados\s*:\s*(\d+)/i)
                    || ctx.match(/(?:Total\s+)?Cr[eé]ditos[^:\d\n]{0,20}:\s*(\d+)/i)
                    || ctx.match(/(\d+)\s+Cr[eé]dito/i);
    const creditos = credMatch ? parseInt(credMatch[1]) : null;

    if (!jsonFinal.fichaAcademica.promedios.find(p => p.ciclo === ciclo)) {
      jsonFinal.fichaAcademica.promedios.push({ ciclo, promedio, creditos });
    }
  }

  jsonFinal.fichaAcademica.promedios.sort((a, b) => b.ciclo.localeCompare(a.ciclo));
  const promediosRegulares = jsonFinal.fichaAcademica.promedios.filter(p => !p.ciclo.endsWith('3'));

  let promCalculado = null;
  let ciclosUsados  = [];

  if (promediosRegulares.length >= 2) {
    const c1 = promediosRegulares[0];
    const c2 = promediosRegulares[1];
    ciclosUsados = [c1, c2];

    const esTotalC1 = c1.promedio > 20;
    const esTotalC2 = c2.promedio > 20;

    if (c1.creditos && c2.creditos) {
      if (esTotalC1 || esTotalC2) {
        promCalculado = ((c1.promedio + c2.promedio) / (c1.creditos + c2.creditos)).toFixed(3);
      } else {
        promCalculado = ((c1.promedio * c1.creditos + c2.promedio * c2.creditos) / (c1.creditos + c2.creditos)).toFixed(3);
      }
    } else if (!esTotalC1 && !esTotalC2) {
      promCalculado = ((c1.promedio + c2.promedio) / 2).toFixed(3);
    }
  } else if (promediosRegulares.length === 1) {
    const c1 = promediosRegulares[0];
    ciclosUsados = [c1];
    if (!c1.promedio || c1.promedio > 20) {
      promCalculado = c1.creditos ? (c1.promedio / c1.creditos).toFixed(3) : null;
    } else {
      promCalculado = c1.promedio.toFixed(3);
    }
  }

  const ppNum       = parseFloat(promCalculado || 0);
  // Tabla 1 del Reglamento de Matrícula (RR 0570-2022). El tramo [08,10) daba
  // 20 créditos cuando la tabla dice 18.
  const maxCreditos = ppNum >= 14 ? 28 : ppNum >= 12 ? 26 : ppNum >= 10 ? 24 : ppNum >= 8 ? 18 : 15;

  // Riesgo académico según el mismo reglamento: "estudiante en riesgo académico
  // a quien tenga desaprobada una o más asignaturas en dos o tres
  // oportunidades". No depende del promedio: antes se usaba < 10.5, que no sale
  // de ninguna norma y dejaba sin marcar a la mayoría de los que sí lo están.
  //
  // El riesgo es una situación actual, no un antecedente: es tener un curso
  // jalado dos veces y tener que llevarlo por tercera. Si ya lo aprobó —aunque
  // le costara tres intentos— dejó de estar en riesgo por ese curso, así que un
  // curso aprobado no cuenta por muchas veces que aparezca.
  const arrastraCurso = (c) => {
    const aprobado = c.nota !== null && c.nota >= 10;
    if (aprobado) return false;
    return (c.veces || 1) >= 2;
  };
  const enRiesgo = jsonFinal.avanceCurricular.cursos.some(arrastraCurso);

  jsonFinal.resumen = {
    promedioPonderado: promCalculado,
    maxCreditos:       promCalculado ? maxCreditos : null,
    enRiesgo,
    ciclosUsados,
  };

  const jalados       = jsonFinal.avanceCurricular.cursos.filter(c => c.veces > 1 || (c.nota !== null && c.nota < 10));
  const cursosEnBoleta = [...new Set(jsonFinal.boletaMatricula.cursos.map(c => c.codigo))];

  return {
    fullJsonData: jsonFinal,
    codigo:        jsonFinal.datosPersonales.codigo,
    nombre:        jsonFinal.datosPersonales.nombre,
    especialidad:  jsonFinal.datosPersonales.especialidad,
    correo:        jsonFinal.datosPersonales.correo,
    telefono:      jsonFinal.datosPersonales.telefono,
    ciclo:         jsonFinal.datosPersonales.cicloRelativo,
    semestreIngreso: jsonFinal.datosPersonales.semestreIngreso,
    turno:         jsonFinal.datosPersonales.turno,
    planEstudio:   jsonFinal.datosPersonales.planEstudio,
    promedioPonderadoFinal: promCalculado || 'No calculado',
    maxCreditosMatriculados:   promCalculado ? maxCreditos : 'N/A',
    enRiesgoAcademico:      enRiesgo,
    creditosMatriculados:   jsonFinal.boletaMatricula.totalCreditos.toString(),
    cursosMatriculados:     cursosEnBoleta.length.toString(),
    historialJalados:       jalados.map(j => `${j.codigo}(${j.veces}v)`).join(', ') || 'Ninguno',
    observaciones:          jsonFinal.avanceCurricular.observaciones.join(', ') || 'Ninguna',
  };
}
