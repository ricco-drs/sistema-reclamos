const fs = require('fs');

try {
    const rawData = fs.readFileSync('src/assets/CARGA HORARIA 2026-1  v3 csv.csv', 'latin1');
    const lines = rawData.split('\n');
    const records = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes(';')) {
            const parts = line.split(';');
            // Normalizar código: quitar espacios, guiones y convertir a mayúsculas
            const rawCode = (parts[0] || '').trim();
            const codigo = rawCode.replace(/-/g, '').toUpperCase();
            if (codigo && codigo.length >= 4 && codigo.length <= 8 && codigo.match(/^[A-Z0-9]+$/)) {
                if (codigo === 'CÓDIGO' || codigo === 'CODIGO') continue;

                records.push({
                    codigo: codigo,
                    nombre: parts[1].trim(),
                    seccion: parts[2].trim(),
                    sistemaEvaluacion: parts[3].trim(),
                    docente: parts[4].trim(),
                    tipo: parts[5].trim(),
                    aula: parts[6].trim(),
                    dia: parts[7].trim(),
                    horaInicio: parseInt(parts[8].trim(), 10),
                    horaFinal: parseInt(parts[9].trim(), 10),
                    dniDocente: parts[10].trim(),
                    vacantes: parseInt(parts[11].trim(), 10)
                });
            }
        }
    }

    fs.writeFileSync('src/data/carga_horaria_2026.json', JSON.stringify(records, null, 2));
    console.log(`Saved ${records.length} records to src/data/carga_horaria_2026.json`);
} catch (e) {
    console.error(e);
}
