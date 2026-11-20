import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOMINIO_PRUEBA,
  correoEstudiantePrueba,
  generarFilasReclamos,
} from '../../scripts/sembrar-reclamos.js';

test('sembrar-reclamos: genera 1 500 filas con ids únicos, 200 correos @prueba.test y los 6 estados', () => {
  const filas = generarFilasReclamos({ cantidad: 1500, estudiantes: 200, desdeNumero: 1001, anio: 2026 });
  assert.equal(filas.length, 1500);
  assert.equal(filas[0].id, 'REC-2026-1001');
  assert.equal(filas.at(-1).id, 'REC-2026-2500');

  const idsUnicos = new Set(filas.map((f) => f.id));
  assert.equal(idsUnicos.size, 1500);

  const correosUnicos = new Set(filas.map((f) => f.email));
  assert.equal(correosUnicos.size, 200);
  assert.ok(correosUnicos.has(correoEstudiantePrueba(1, 200)));
  assert.ok(correosUnicos.has(correoEstudiantePrueba(200, 200)));
  assert.ok([...correosUnicos].every((c) => c.endsWith(`@${DOMINIO_PRUEBA}`)));

  const estadosUnicos = new Set(filas.map((f) => f.estado));
  assert.deepEqual(
    [...estadosUnicos].sort(),
    ['ACEPTADO', 'ACEPTADO_PARCIALMENTE', 'EN_REVISION', 'MATRICULADO', 'PENDIENTE', 'RECHAZADO'],
  );
});
