import { read, utils } from 'xlsx';
import fs from 'fs';

function run() {
    const filePath = './src/assets/CARGA HORARIA 2026-1  v3.xlsx';
    if (!fs.existsSync(filePath)) {
        console.error('File no found: ', filePath);
        return;
    }
    
    // Read the file buffer
    const buf = fs.readFileSync(filePath);
    const workbook = read(buf, { type: 'buffer' });
    
    // Asume the first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Use header: 1 to get array of arrays
    const rawData = utils.sheet_to_json(sheet, { header: 1, defval: "" });
    
    // Find the actual header row (usually the first row with more than 3 columns)
    const headerRowIdx = rawData.findIndex(row => row.length > 5 && (row[0] || "").toString().includes("CÓDIGO") || (row[1] || "").toString().includes("NOMBRE"));
    if (headerRowIdx === -1) {
        console.error("Could not find the header row.");
        return;
    }

    const headers = rawData[headerRowIdx].map(h => String(h).replace(/[\r\n]+/g, " ").replace(/\s\s+/g, ' ').trim());
    
    const dataRows = rawData.slice(headerRowIdx + 1).filter(r => r.length > 0 && r[0] !== "");
    
    // Parse into objects mapped by headers
    const cleanData = dataRows.map((rowArr) => {
        let row = {};
        headers.forEach((h, i) => { row[h] = rowArr[i]; });
        
        return {
            codigo: row['CÓDIGO'] || row['CODIGO'] || '',
            nombre: row['NOMBRE DEL CURSO'] || '',
            seccion: row['SECCIÓN'] || row['SECCION'] || '',
            sistemaEvaluacion: row['SISTEMA DE EVALUACIÓN'] || '',
            docente: row['APELLIDOS Y NOMBRES DEL DOCENTE'] || '',
            tipo: row['TIPO'] || '',
            aula: String(row['AULA'] || ''),
            dia: row['DÍA'] || row['DIA'] || '',
            horaInicio: typeof row['HORA INICIO'] === 'number' ? row['HORA INICIO'] : parseInt(row['HORA INICIO'] || 'NaN'),
            horaFinal: typeof row['HORA FINAL'] === 'number' ? row['HORA FINAL'] : parseInt(row['HORA FINAL'] || 'NaN'),
            vacantes: Number(row['VACANTES'] || 0)
        };
    }).filter(r => r.codigo && r.dia && !isNaN(r.horaInicio));

    const jsContent = `export const CARGA_HORARIA_${new Date().getFullYear()} = ${JSON.stringify(cleanData, null, 2)};\n`;
    fs.writeFileSync('./src/data/cargaHoraria.js', jsContent, 'utf8');
    
    console.log(`Extracted and processed ${cleanData.length} valid schedule rows.`);
}
run();
