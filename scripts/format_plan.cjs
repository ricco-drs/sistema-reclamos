const fs = require('fs');

const raw = `FB101	Geometría Analítica	3	2	2	4	G	NINGUNO	obligatorio	1
BMA01	Cálculo Diferencial	5	4	2	6	G	NINGUNO	obligatorio	1
BQU01	Química I	5	4	2	6	F	NINGUNO	obligatorio	1
BRC01	Redacción y Comunicación	2	1	2	3	D	NINGUNO	obligatorio	1
SW101	Introducción a la Ingeniería de Software	3	2	2	4	F	NINGUNO	obligatorio	1
BIC01	Introducción a la computación	2	1	2	3	F	NINGUNO	obligatorio	1
HU102	Desarrollo Personal	2	0	4	4	D	NINGUNO	obligatorio	1

BMA03	Álgebra lineal	4	3	2	5	G	FB101	obligatorio	2
BMA02	Cálculo Integral	5	4	2	6	G	BMA01	obligatorio	2
FB301	Matemática discreta	3	2	2	4	G	BMA03	obligatorio	2
BFI01	Física I	5	4	2	6	F	NINGUNO	obligatorio	2
TE205	Dibujo y Geometría Descriptiva	2	0	4	4	D	FB101	obligatorio	2
SI205	Algoritmia y Estructura de Datos	3	2	2	4	F	BIC01 AND SW101	obligatorio	2

FB303	Cálculo Multivariable	5	4	2	6	G	BMA03 AND BMA02	obligatorio	3
FB305	Estadística y Probabilidades	3	2	2	4	G	BMA02	obligatorio	3
FB401	Física II	5	2	2	4	G	BFI01	obligatorio	3
SW305	Algoritmia y Estructura de Datos Avanzada	3	2	2	4	F	SI205	obligatorio	3
SW301	Arquitectura de Computadoras I	2	1	2	3	G	FB301	obligatorio	3
SW303	Lenguajes de Programación I	4	2	4	6	F	SI205	obligatorio	3

FB403	Ecuaciones Diferenciales	5	4	2	6	G	FB303	obligatorio	4
BEF01	Ética y Filosofía Política	2	1	2	3	D	NINGUNO	obligatorio	4
SI405	Modelado Conceptual de Datos	4	3	2	5	F	SW305	obligatorio	4
SW405	Ingeniería de Requerimientos I	3	2	2	4	F	SW303	obligatorio	4
SW407	Sistemas Operativos	3	2	2	4	G	SW301	obligatorio	4
SW403	Programación II (POO)	4	2	4	6	F	SW303	obligatorio	4

BEG01	Economía General	3	2	2	4	F	NINGUNO	obligatorio	5
BRN01	Realidad Nacional y Derechos Humanos	3	2	2	4	D	NINGUNO	obligatorio	5
SW501	Arquitectura de Computadoras II	3	2	2	4	G	SW301	obligatorio	5
SW503	Modelamiento de Comportamiento	4	2	4	6	F	SW403	obligatorio	5
SW505	Construcción de Software I	4	2	4	6	D	SI405 AND SW405	obligatorio	5
SW507	Redes y Comunicaciones	3	2	2	4	G	SW407 OR SW403	obligatorio	5
HU501	Taller de Efectividad Personal	2	0	4	4	D	HU102	obligatorio	5
SI505	Diseño de Base de Datos	3	2	2	4	F	SI405	obligatorio	5

SW608	Lenguajes de Dominio Específico	4	2	4	6	F	SW503 AND SW501	obligatorio	6
SW609	Sistemas de Gestión de BD	4	2	4	6	G	SI505	obligatorio	6
FB405	Estadística Aplicada	3	2	2	4	G	FB305	obligatorio	6
SI501	Investigación de Operaciones I	3	2	2	4	F	FB305	obligatorio	6
SW603	Diseño de Software	3	2	2	4	D	SW503	obligatorio	6
SW605	Requerimientos II	3	2	2	4	F	SW405	obligatorio	6

SW701	Gestión de Configuración	3	2	2	4	G	SW603 AND SW609	obligatorio	7
SW705	Taller de Software I	2	0	4	4	D	SW605	obligatorio	7
SW707	Construcción de Software II	3	2	2	4	F	SW505	obligatorio	7
SW708	Arquitectura de Software	3	2	2	4	F	SW505	obligatorio	7
SW709	Verificación y Validación	3	2	2	4	G	SW603	obligatorio	7
SW703	Sistemas Embebidos	3	2	2	4	G	SW501 OR SW507	obligatorio	7

SW803	Machine Learning I	4	3	2	5	F	FB405 AND SW505	obligatorio	8
SW805	Ingeniería Económica	3	2	2	4	F	BEG01	obligatorio	8
SW809	Calidad de Software	3	2	2	4	G	SW709	obligatorio	8
SW807	Procesos de Software	3	2	2	4	G	SW707	obligatorio	8
GS804	Gestión de Empresas Software	3	2	2	4	G	BEG01	obligatorio	8
HU801	Taller Profesional	2	0	4	4	D	HU501	obligatorio	8

SW901	Machine Learning II	4	3	2	5	F	SW803	obligatorio	9
SW902	Tesis I	2	0	4	4	D	SW807	obligatorio	9
SW903	Innovación Tecnológica	3	1	4	5	G	SW805 AND SW803	obligatorio	9
SW904	Seguridad de Software	3	2	2	4	G	SW807	obligatorio	9
SW907	Metodologías Ágiles	2	0	4	4	D	SW809	obligatorio	9
SW905	Taller Software II	2	0	4	4	D	SW705	obligatorio	9

SW001	Tesis II	2	0	4	4	D	SW902	obligatorio	10
SW002	Tópicos Especiales	3	2	2	4	F	SW809	obligatorio	10
SW003	Gestión de Servicios Software	3	2	2	4	F	SW907	obligatorio	10
SW004	Gestión de Proyectos	3	2	2	4	G	SW905	obligatorio	10
SW005	Emprendimiento Software	2	0	4	4	D	SW903	obligatorio	10`;

const lines = raw.split('\n').filter(l => l.trim().length > 0);
const jsonArray = lines.map(line => {
    const parts = line.split('\t');
    if (parts.length >= 10) {
        return {
            codigo: parts[0].trim(),
            nombre: parts[1].trim(),
            creditos: parseInt(parts[2].trim(), 10),
            horasTeoria: parseInt(parts[3].trim(), 10),
            horasPracticaLab: parseInt(parts[4].trim(), 10),
            totalHoras: parseInt(parts[5].trim(), 10),
            sistemaEvaluacion: parts[6].trim(),
            preRequisitos: parts[7].trim() === 'NINGUNO' ? [] : parts[7].trim().split(' AND ').flatMap(req => req.split(' OR ').map(r => r.trim())),
            preRequisitosRaw: parts[7].trim() === 'NINGUNO' ? '' : parts[7].trim(),
            tipo: parts[8].trim(),
            ciclo: parseInt(parts[9].trim(), 10)
        };
    }
    return null;
}).filter(Boolean);

fs.writeFileSync('src/data/plan_software_2026.json', JSON.stringify(jsonArray, null, 2));
console.log('Saved to src/data/plan_software_2026.json');
