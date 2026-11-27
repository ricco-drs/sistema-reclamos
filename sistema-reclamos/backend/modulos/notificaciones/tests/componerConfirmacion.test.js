import test from 'node:test';
import assert from 'node:assert/strict';
import { componerConfirmacion } from '../presentacion/componerConfirmacion.js';
import { crearNotificadorDeReclamo } from '../aplicacion/notificarReclamoRegistrado.js';

const base = { id: 'REC-2026-0042', categoria: 'Matrícula' };

test('asunto y contenido: lleva el id del caso y la categoría', () => {
  const { subject, html } = componerConfirmacion({ ...base, nombre: 'PUERTA RAMOS, ANA LUCIA' });
  assert.equal(subject, 'Reclamo registrado: REC-2026-0042 — TEFIIS');
  assert.match(html, /REC-2026-0042/);
  assert.match(html, /Categoría: Matrícula/);
  assert.match(html, /Tu reclamo fue registrado/);
});

test('saludo: toma el primer nombre después de la coma y lo deja con inicial mayúscula', () => {
  assert.match(componerConfirmacion({ ...base, nombre: 'PUERTA RAMOS, ANA LUCIA' }).html, /Hola <strong>Ana<\/strong>/);
  assert.match(componerConfirmacion({ ...base, nombre: 'PUERTA RAMOS,   LUIS' }).html, /Hola <strong>Luis<\/strong>/);
});

test('saludo: sin coma usa la parte del correo antes del primer punto', () => {
  const { html } = componerConfirmacion({ ...base, nombre: 'Ana Puerta', email: 'roy.puris.r@uni.pe' });
  assert.match(html, /Hola <strong>Roy<\/strong>/);
});

test('saludo: sin nombre usable ni correo cae a "Estudiante"', () => {
  assert.match(componerConfirmacion({ ...base, nombre: null }).html, /Hola <strong>Estudiante<\/strong>/);
  assert.match(componerConfirmacion({ ...base, nombre: 'SIN COMA' }).html, /Hola <strong>Estudiante<\/strong>/);
});

test('escapa lo que escribió el estudiante en nombre, categoría e id', () => {
  const { html } = componerConfirmacion({
    id: 'REC-<1>', nombre: 'X, <script>alert(1)</script>', categoria: 'A & "B" <i>',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<i>'));
  assert.match(html, /REC-&lt;1&gt;/);
  assert.match(html, /A &amp; &quot;B&quot; &lt;i&gt;/);
});

test('el consumidor de ReclamoRegistrado envía este mismo correo al email del reclamo', async () => {
  const enviados = [];
  const notificar = crearNotificadorDeReclamo({
    componerCorreo: componerConfirmacion,
    enviarCorreo: async (correo) => { enviados.push(correo); },
  });
  // Solo los cuatro campos que el consumidor lee del evento (dominio/puertos.js). Que el
  // evento de reclamos los traiga lo prueba backend/tests/flujoReclamoRegistrado.test.js.
  const evento = {
    reclamo: { id: 'REC-2026-0042', email: 'estudiante@uni.pe', nombre: 'PUERTA RAMOS, ANA', categoria: 'Matrícula' },
  };

  await notificar(evento);

  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].to, 'estudiante@uni.pe');
  assert.deepEqual(
    { subject: enviados[0].subject, html: enviados[0].html },
    componerConfirmacion({ id: 'REC-2026-0042', nombre: 'PUERTA RAMOS, ANA', categoria: 'Matrícula', email: 'estudiante@uni.pe' }),
  );
});
