import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { crearEnviadorCorreo, crearProveedorCorreoSimulado } from '../infraestructura/enviadorCorreo.js';
import { crearRegistrarReclamo } from '../aplicacion/registrarReclamo.js';
import { crearNotificadorDeReclamo } from '../aplicacion/consumidores/notificarReclamoRegistrado.js';
import { crearEnviadorDeExpediente } from '../aplicacion/consumidores/enviarExpedienteAM2.js';
import { crearRegistrarReclamoHandler } from '../presentacion/registrarReclamoHandler.js';
import { crearRepositorioReclamosMemoria } from '../infraestructura/repositorioReclamosMemoria.js';
import { crearPublicadorMemoria } from '../infraestructura/publicadorMemoria.js';
import { crearBusEnProceso } from '../infraestructura/busEnProceso.js';
import { crearClienteM2Http, crearClienteM2Memoria } from '../infraestructura/clienteM2.js';
import { RECLAMO_REGISTRADO } from '../dominio/eventos.js';

const CATALOGO = new Map([
  ['SW708', { nombre: 'Arquitectura de Software', secciones: ['U'] }],
]);

const correoPrueba = (n) => `estudiante-${String(n).padStart(3, '0')}@prueba.test`;

test('E5 normal: Brevo disponible acepta el envío sin llamar a Resend ni a Mailjet', async () => {
  const sim = crearProveedorCorreoSimulado({ Brevo: 'ok', Resend: 'ok', Mailjet: 'ok' });
  const sendEmail = crearEnviadorCorreo({
    fetchFn: sim.fetchFn,
    ...sim.credencialesFalsas,
    registrarError: () => {},
  });

  await sendEmail({ to: correoPrueba(1), subject: 'Código TEFIIS', html: '<p>1234</p>' });
  assert.deepEqual(sim.conteos, { Brevo: 1, Resend: 0, Mailjet: 0 });
  assert.equal(sim.enviados.length, 1);
  assert.equal(sim.enviados[0].proveedor, 'Brevo');
});

for (const modoFalla of ['401', '429']) {
  test(`E5 Brevo en modo ${modoFalla}: 100 envíos conmutan a Resend (100 Brevo, 100 Resend, 0 Mailjet)`, async () => {
    const sim = crearProveedorCorreoSimulado({ Brevo: modoFalla, Resend: 'ok', Mailjet: 'ok' });
    const sendEmail = crearEnviadorCorreo({
      fetchFn: sim.fetchFn,
      ...sim.credencialesFalsas,
      registrarError: () => {},
    });

    for (let i = 1; i <= 100; i++) {
      await sendEmail({
        to: correoPrueba(i),
        subject: `Reclamo registrado: REC-2026-${String(i).padStart(4, '0')}`,
        html: '<p>Confirmación</p>',
      });
    }

    assert.deepEqual(sim.conteos, { Brevo: 100, Resend: 100, Mailjet: 0 });
    assert.equal(sim.enviados.length, 100);
    assert.ok(sim.enviados.every((e) => e.proveedor === 'Resend'));
  });
}

test('E5 Brevo lento (ANTES vs DESPUÉS): sin timeout se bloquea en Brevo; con timeout corta y entrega por Resend', async () => {
  // ANTES (timeoutMs: 0 -> sin AbortSignal.timeout, igual que server.js original)
  const simAntes = crearProveedorCorreoSimulado({ Brevo: 'lento', Resend: 'ok', Mailjet: 'ok', demoraLentoMs: 80 });
  const sendEmailAntes = crearEnviadorCorreo({
    fetchFn: simAntes.fetchFn,
    timeoutMs: 0,
    ...simAntes.credencialesFalsas,
    registrarError: () => {},
  });

  const t0Antes = performance.now();
  await sendEmailAntes({ to: correoPrueba(1), subject: 'Sin timeout', html: '<p>x</p>' });
  const duracionAntes = performance.now() - t0Antes;

  // Sin timeout esperó toda la demora de Brevo y nunca conmutó a Resend
  assert.ok(duracionAntes >= 70, `Se esperaba bloqueo >= 70 ms, fue ${duracionAntes} ms`);
  assert.deepEqual(simAntes.conteos, { Brevo: 1, Resend: 0, Mailjet: 0 });
  assert.equal(simAntes.abortadosPorTimeout.Brevo, 0);

  // DESPUÉS (timeoutMs: 20 -> corta Brevo a los 20 ms y conmuta a Resend)
  const simDespues = crearProveedorCorreoSimulado({ Brevo: 'lento', Resend: 'ok', Mailjet: 'ok', demoraLentoMs: 300 });
  const errores = [];
  const sendEmailDespues = crearEnviadorCorreo({
    fetchFn: simDespues.fetchFn,
    timeoutMs: 20,
    ...simDespues.credencialesFalsas,
    registrarError: (prov, err) => errores.push([prov, err.message]),
  });

  const t0Despues = performance.now();
  await sendEmailDespues({ to: correoPrueba(1), subject: 'Con timeout', html: '<p>x</p>' });
  const duracionDespues = performance.now() - t0Despues;

  assert.ok(duracionDespues < 150, `Se esperaba corte rápido < 150 ms, fue ${duracionDespues} ms`);
  assert.deepEqual(simDespues.conteos, { Brevo: 1, Resend: 1, Mailjet: 0 });
  assert.equal(simDespues.abortadosPorTimeout.Brevo, 1);
  assert.equal(simDespues.enviados[0].proveedor, 'Resend');
  assert.match(errores[0][1], /Brevo excedió el tiempo límite de 20 ms/);
});

test('E5 cascada completa: si Brevo y Resend fallan, entrega por Mailjet; si fallan los tres, propaga error', async () => {
  const sim = crearProveedorCorreoSimulado({ Brevo: '401', Resend: '429', Mailjet: 'ok' });
  const sendEmail = crearEnviadorCorreo({
    fetchFn: sim.fetchFn,
    ...sim.credencialesFalsas,
    registrarError: () => {},
  });

  await sendEmail({ to: correoPrueba(1), subject: 'Prueba Mailjet', html: '<p>ok</p>' });
  assert.deepEqual(sim.conteos, { Brevo: 1, Resend: 1, Mailjet: 1 });
  assert.equal(sim.enviados[0].proveedor, 'Mailjet');

  const simCaido = crearProveedorCorreoSimulado({ Brevo: '401', Resend: '429', Mailjet: '500' });
  const sendEmailCaido = crearEnviadorCorreo({
    fetchFn: simCaido.fetchFn,
    ...simCaido.credencialesFalsas,
    registrarError: () => {},
  });

  await assert.rejects(
    sendEmailCaido({ to: correoPrueba(1), subject: 'Falla total', html: '<p>x</p>' }),
    /Mailjet 500/,
  );
  assert.equal(simCaido.enviados.length, 0);
});

test('Resiliencia por eventos (ReclamoRegistrado): fallas o lentitud en correo y M2 no afectan la respuesta 200 al estudiante', async () => {
  const reclamos = crearRepositorioReclamosMemoria();
  const publicadorEspia = crearPublicadorMemoria();
  const m2Memoria = crearClienteM2Memoria();
  const fallasBus = [];
  const bus = crearBusEnProceso({
    alFallar: (ev, quien, err) => fallasBus.push({ eventoId: ev.eventoId, quien, error: err.message }),
  });

  // Simulamos Brevo lento (150 ms) con timeout de 15 ms -> conmuta a Resend
  const simCorreo = crearProveedorCorreoSimulado({ Brevo: 'lento', Resend: 'ok', Mailjet: 'ok', demoraLentoMs: 150 });
  const sendEmail = crearEnviadorCorreo({
    fetchFn: simCorreo.fetchFn,
    timeoutMs: 15,
    ...simCorreo.credencialesFalsas,
    registrarError: () => {},
  });

  // Simulamos que para los reclamos pares M2 falla con 502, y para los impares guarda en crearClienteM2Memoria
  let contadorM2 = 0;
  const m2ConFallaParcial = {
    async registrarExpediente(exp) {
      contadorM2++;
      if (contadorM2 % 2 === 0) {
        const clienteFalla = crearClienteM2Http({
          url: 'http://m2.simulado.local/api/v1/m2/expedientes',
          fetchFn: async () => ({ ok: false, status: 502 }),
        });
        return clienteFalla.registrarExpediente(exp);
      }
      return m2Memoria.registrarExpediente(exp);
    },
  };

  bus.suscribir(RECLAMO_REGISTRADO, crearNotificadorDeReclamo({
    componerCorreo: ({ id, categoria }) => ({ subject: `Reclamo registrado: ${id}`, html: `<p>${categoria}</p>` }),
    enviarCorreo: sendEmail,
  }), 'correo');

  bus.suscribir(RECLAMO_REGISTRADO, crearEnviadorDeExpediente({
    reclamos,
    m2: m2ConFallaParcial,
  }), 'm2');

  const publicadorCompuesto = {
    async publicar(ev) {
      await publicadorEspia.publicar(ev);
      await bus.publicar(ev);
    },
  };

  const registrar = crearRegistrarReclamo({
    reclamos,
    publicador: publicadorCompuesto,
    politica: { motivoDeRechazo: async () => null },
    catalogoCursos: CATALOGO,
    esEvidenciaPropia: (ref, email) => String(ref).startsWith(`${email}/`),
  });
  const handler = crearRegistrarReclamoHandler(registrar);

  // 10 estudiantes registran su reclamo; la respuesta HTTP debe ser 200 inmediata sin esperar los timeouts
  const t0 = performance.now();
  for (let i = 1; i <= 10; i++) {
    const email = correoPrueba(i);
    const res = {
      codigo: 200,
      status(n) { this.codigo = n; return this; },
      json(b) { this.body = b; return this; },
    };
    await handler({
      studentEmail: email,
      body: {
        nombre: `ESTUDIANTE ${i}`,
        codigo_estudiante: `2024${String(i).padStart(4, '0')}A`,
        categoria: 'Matrícula',
        descripcion: `Problema de matrícula del estudiante ${i}`,
        cursos_matricular: [{ codigo: 'SW708', seccion: 'U' }],
      },
    }, res);
    assert.equal(res.codigo, 200);
    assert.equal(res.body.success, true);
  }
  const tiempoRespuestaEstudiantesMs = performance.now() - t0;

  // Las 10 respuestas HTTP terminan antes de que siquiera venza el primer timeout de 15 ms de cada correo en serie
  assert.ok(tiempoRespuestaEstudiantesMs < 50, `Las 10 respuestas HTTP tardaron ${tiempoRespuestaEstudiantesMs} ms`);
  assert.equal(reclamos.filas.length, 10);
  assert.equal(publicadorEspia.publicados.length, 10);

  // Esperamos a que terminen los consumidores en segundo plano
  await bus.vaciar();

  // Los 10 correos salieron por Resend tras abortar Brevo por timeout
  assert.deepEqual(simCorreo.conteos, { Brevo: 10, Resend: 10, Mailjet: 0 });
  assert.equal(simCorreo.enviados.length, 10);

  // Los 5 impares quedaron en crearClienteM2Memoria y los 5 pares registraron su falla en el bus sin afectar al correo
  assert.equal(m2Memoria.expedientes.length, 5);
  assert.equal(fallasBus.length, 5);
  assert.ok(fallasBus.every((f) => f.quien === 'm2' && f.error.includes('M2 respondió 502')));
});
