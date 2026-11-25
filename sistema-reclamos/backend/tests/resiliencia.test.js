import test from 'node:test';
import assert from 'node:assert/strict';
import { crearEnviadorCorreo, crearPublicadorMemoria, crearBusEnProceso } from '@tefiis/compartido';
import {
  crearRegistrarReclamo, crearRegistrarReclamoHandler, crearRepositorioReclamosMemoria, RECLAMO_REGISTRADO,
} from '@tefiis/reclamos';
import {
  crearNotificadorDeReclamo, crearEnviadorDeExpediente, crearClienteM2Http, crearClienteM2Memoria,
} from '@tefiis/notificaciones';
import { crearProveedorCorreoSimulado } from '../../pruebas/proveedorCorreoSimulado.js';

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
  test(`E5 Brevo en modo ${modoFalla} (sin circuit breaker): 100 envíos conmutan a Resend (100 Brevo, 100 Resend, 0 Mailjet)`, async () => {
    const sim = crearProveedorCorreoSimulado({ Brevo: modoFalla, Resend: 'ok', Mailjet: 'ok' });
    const sendEmail = crearEnviadorCorreo({
      fetchFn: sim.fetchFn,
      circuitBreaker: false,
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

test('Circuit Breaker (opossum): abre el circuito tras fallos en Brevo, evita llamadas redundantes y recupera en halfOpen', async () => {
  const sim = crearProveedorCorreoSimulado({ Brevo: 'colgado', Resend: 'ok', Mailjet: 'ok' });
  const transiciones = [];
  const sendEmail = crearEnviadorCorreo({
    fetchFn: sim.fetchFn,
    timeoutMs: 15,
    circuitBreaker: {
      habilitado: true,
      volumeThreshold: 3,
      errorThresholdPercentage: 50,
      resetTimeout: 60,
    },
    ...sim.credencialesFalsas,
    registrarError: () => {},
    registrarEstadoCircuito: (prov, estado) => transiciones.push(`${prov}:${estado}`),
  });

  try {
    for (let i = 1; i <= 20; i++) {
      await sendEmail({
        to: correoPrueba(i),
        subject: `Reclamo CB #${i}`,
        html: '<p>Confirmación</p>',
      });
    }

    // Solo los primeros 3 intentos tocan Brevo antes de abrir el circuito; los 17 restantes van directo a Resend.
    assert.equal(sim.conteos.Brevo, 3);
    assert.equal(sim.conteos.Resend, 20);
    assert.equal(sim.conteos.Mailjet, 0);
    assert.equal(sim.enviados.length, 20);
    assert.equal(sendEmail.estadoCircuitos().Brevo, 'open');
    assert.ok(transiciones.includes('Brevo:open'));

    // Recuperamos Brevo y esperamos el resetTimeout para comprobar la transición halfOpen -> closed.
    sim.modos.Brevo = 'ok';
    await new Promise((r) => setTimeout(r, 90));
    await sendEmail({ to: correoPrueba(21), subject: 'Recuperación Brevo', html: '<p>ok</p>' });

    assert.equal(sim.conteos.Brevo, 4);
    assert.equal(sim.enviados[20].proveedor, 'Brevo');
    assert.equal(sendEmail.estadoCircuitos().Brevo, 'closed');
    assert.ok(transiciones.includes('Brevo:halfOpen'));
    assert.ok(transiciones.includes('Brevo:close'));
  } finally {
    sendEmail.cerrar();
  }
});

test('Circuit Breaker (errorFilter): errores 400 y 422 por una dirección inválida no abren los circuitos ni bloquean envíos válidos', async () => {
  const llamadas = { Brevo: 0, Resend: 0, Mailjet: 0 };
  const fetchSimulado = async (url, init = {}) => {
    const cuerpo = init.body ? JSON.parse(init.body) : {};
    const destinatario =
      cuerpo?.to?.[0]?.email ||
      cuerpo?.to?.[0] ||
      cuerpo?.Messages?.[0]?.To?.[0]?.Email ||
      '';
    const proveedor = url.includes('brevo') ? 'Brevo' : (url.includes('resend') ? 'Resend' : 'Mailjet');
    llamadas[proveedor]++;

    if (destinatario.startsWith('invalido')) {
      const status = destinatario.includes('422') ? 422 : 400;
      return {
        ok: false,
        status,
        async json() {
          return { message: `Dirección rechazada (${status})`, ErrorMessage: `Dirección rechazada (${status})` };
        },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() { return { id: 'ok' }; },
    };
  };

  const sendEmail = crearEnviadorCorreo({
    fetchFn: fetchSimulado,
    fromEmail: 'tefiis@prueba.test',
    brevo: { apiKey: 'k-brevo', url: 'http://correo.simulado.local/brevo' },
    resend: { apiKey: 'k-resend', url: 'http://correo.simulado.local/resend' },
    mailjet: { apiKey: 'k-mj', secretKey: 's-mj', url: 'http://correo.simulado.local/mailjet' },
    circuitBreaker: {
      habilitado: true,
      volumeThreshold: 3,
      errorThresholdPercentage: 50,
      resetTimeout: 30_000,
    },
    registrarError: () => {},
    registrarEstadoCircuito: () => {},
  });

  try {
    for (const correoRechazado of ['invalido1@uni.pe', 'invalido2@uni.pe', 'invalido-422@uni.pe']) {
      await assert.rejects(
        sendEmail({ to: correoRechazado, subject: 'Código', html: '<p>1234</p>' }),
        /Dirección rechazada/,
      );
    }

    // Los tres circuitos permanecen cerrados porque 400 y 422 son errores del destinatario/petición.
    assert.deepEqual(sendEmail.estadoCircuitos(), {
      Brevo: 'closed',
      Resend: 'closed',
      Mailjet: 'closed',
    });

    // El siguiente envío a una dirección válida sale en el primer intento por Brevo.
    const resValido = await sendEmail({ to: 'valido@uni.pe', subject: 'Código', html: '<p>1234</p>' });
    assert.equal(resValido.proveedor, 'Brevo');
    assert.equal(llamadas.Brevo, 4);
    assert.equal(llamadas.Resend, 3);
    assert.equal(llamadas.Mailjet, 3);
  } finally {
    sendEmail.cerrar();
  }
});

test('Circuit Breaker (rollingCountTimeout): con ventana amplia abre ante tráfico espaciado; con ventana corta expira antes de alcanzar volumeThreshold', async () => {
  // 1. Con ventana muy corta (30 ms) y envíos cada 25 ms, en 30 ms nunca coinciden 3 fallos -> no abre.
  const simVentanaCorta = crearProveedorCorreoSimulado({ Brevo: '500', Resend: 'ok', Mailjet: 'ok' });
  const sendVentanaCorta = crearEnviadorCorreo({
    fetchFn: simVentanaCorta.fetchFn,
    circuitBreaker: {
      habilitado: true,
      volumeThreshold: 3,
      errorThresholdPercentage: 50,
      rollingCountTimeout: 30,
      rollingCountBuckets: 3,
      resetTimeout: 30_000,
    },
    ...simVentanaCorta.credencialesFalsas,
    registrarError: () => {},
    registrarEstadoCircuito: () => {},
  });

  // 2. Con ventana por defecto (60 000 ms) y el mismo espaciado, los 3 primeros fallos caen dentro de la ventana y abre al 3.º.
  const simVentanaAmplia = crearProveedorCorreoSimulado({ Brevo: '500', Resend: 'ok', Mailjet: 'ok' });
  const sendVentanaAmplia = crearEnviadorCorreo({
    fetchFn: simVentanaAmplia.fetchFn,
    circuitBreaker: {
      habilitado: true,
      volumeThreshold: 3,
      errorThresholdPercentage: 50,
      rollingCountTimeout: 60_000,
      resetTimeout: 30_000,
    },
    ...simVentanaAmplia.credencialesFalsas,
    registrarError: () => {},
    registrarEstadoCircuito: () => {},
  });

  try {
    for (let i = 1; i <= 5; i++) {
      await sendVentanaCorta({ to: correoPrueba(i), subject: `Corta #${i}`, html: '<p>x</p>' });
      await sendVentanaAmplia({ to: correoPrueba(i), subject: `Amplia #${i}`, html: '<p>x</p>' });
      if (i < 5) await new Promise((r) => setTimeout(r, 25));
    }

    assert.equal(sendVentanaCorta.estadoCircuitos().Brevo, 'closed');
    assert.equal(simVentanaCorta.conteos.Brevo, 5);

    assert.equal(sendVentanaAmplia.estadoCircuitos().Brevo, 'open');
    assert.equal(simVentanaAmplia.conteos.Brevo, 3);
    assert.equal(simVentanaAmplia.conteos.Resend, 5);
  } finally {
    sendVentanaCorta.cerrar();
    sendVentanaAmplia.cerrar();
  }
});

test('E5 Brevo lento y colgado (ANTES vs DESPUÉS): sin timeout espera o se cuelga en Brevo; con timeout corta y entrega por Resend', async () => {
  // 1. Modo lento sin timeout (timeoutMs: 0): Brevo tarda pero termina aceptando sin conmutar a Resend
  const simLentoAntes = crearProveedorCorreoSimulado({ Brevo: 'lento', Resend: 'ok', Mailjet: 'ok', demoraLentoMs: 50 });
  const sendEmailLentoAntes = crearEnviadorCorreo({
    fetchFn: simLentoAntes.fetchFn,
    timeoutMs: 0,
    ...simLentoAntes.credencialesFalsas,
    registrarError: () => {},
  });
  await sendEmailLentoAntes({ to: correoPrueba(1), subject: 'Lento sin timeout', html: '<p>x</p>' });
  assert.deepEqual(simLentoAntes.conteos, { Brevo: 1, Resend: 0, Mailjet: 0 });
  assert.equal(simLentoAntes.abortadosPorTimeout.Brevo, 0);
  assert.equal(simLentoAntes.enviados[0].proveedor, 'Brevo');

  // 2. Modo colgado sin timeout (timeoutMs: 0): la promesa nunca resuelve y no llega a Resend
  const simColgadoAntes = crearProveedorCorreoSimulado({ Brevo: 'colgado', Resend: 'ok', Mailjet: 'ok' });
  const sendEmailColgadoAntes = crearEnviadorCorreo({
    fetchFn: simColgadoAntes.fetchFn,
    timeoutMs: 0,
    ...simColgadoAntes.credencialesFalsas,
    registrarError: () => {},
  });
  const resultadoColgado = await Promise.race([
    sendEmailColgadoAntes({ to: correoPrueba(1), subject: 'Colgado sin timeout', html: '<p>x</p>' }),
    new Promise((resolve) => setTimeout(() => resolve('COLGADO_SIN_RESPUESTA'), 40)),
  ]);
  simColgadoAntes.cerrarPendientes();
  assert.equal(resultadoColgado, 'COLGADO_SIN_RESPUESTA');
  assert.deepEqual(simColgadoAntes.conteos, { Brevo: 1, Resend: 0, Mailjet: 0 });
  assert.equal(simColgadoAntes.enviados.length, 0);

  // 3. Modo colgado CON timeout (timeoutMs: 15): AbortSignal.timeout corta Brevo y entrega por Resend
  const simColgadoDespues = crearProveedorCorreoSimulado({ Brevo: 'colgado', Resend: 'ok', Mailjet: 'ok' });
  const errores = [];
  const sendEmailColgadoDespues = crearEnviadorCorreo({
    fetchFn: simColgadoDespues.fetchFn,
    timeoutMs: 15,
    ...simColgadoDespues.credencialesFalsas,
    registrarError: (prov, err) => errores.push([prov, err.message]),
  });
  await sendEmailColgadoDespues({ to: correoPrueba(1), subject: 'Colgado con timeout', html: '<p>x</p>' });
  assert.deepEqual(simColgadoDespues.conteos, { Brevo: 1, Resend: 1, Mailjet: 0 });
  assert.equal(simColgadoDespues.abortadosPorTimeout.Brevo, 1);
  assert.equal(simColgadoDespues.enviados[0].proveedor, 'Resend');
  assert.match(errores[0][1], /Brevo excedió el tiempo límite de 15 ms/);
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

test('Resiliencia por eventos (ReclamoRegistrado en proceso): fallas o bloqueo en correo y M2 no afectan la respuesta 200 al estudiante', async () => {
  const reclamos = crearRepositorioReclamosMemoria();
  const publicadorEspia = crearPublicadorMemoria();
  const m2Memoria = crearClienteM2Memoria();
  const fallasBus = [];
  const bus = crearBusEnProceso({
    alFallar: (ev, quien, err) => fallasBus.push({ eventoId: ev.eventoId, quien, error: err.message }),
  });

  const simCorreo = crearProveedorCorreoSimulado({ Brevo: 'colgado', Resend: 'ok', Mailjet: 'ok' });
  const sendEmail = crearEnviadorCorreo({
    fetchFn: simCorreo.fetchFn,
    timeoutMs: 15,
    circuitBreaker: false,
    ...simCorreo.credencialesFalsas,
    registrarError: () => {},
  });

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
    fuente: reclamos,
    m2: m2ConFallaParcial,
  }), 'm2');

  const registrar = crearRegistrarReclamo({
    reclamos,
    publicador: {
      async publicar(ev) {
        await publicadorEspia.publicar(ev);
        await bus.publicar(ev);
      },
    },
    politica: { motivoDeRechazo: async () => null },
    catalogoCursos: CATALOGO,
    esEvidenciaPropia: (ref, email) => String(ref).startsWith(`${email}/`),
  });
  const handler = crearRegistrarReclamoHandler(registrar);

  for (let i = 1; i <= 10; i++) {
    const email = correoPrueba(i);
    const res = {
      codigo: 200,
      set() { return this; },
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
    assert.equal(res.codigo, 201);
    assert.equal(res.body.success, true);
  }

  // En este punto los 10 estudiantes ya recibieron su 200 OK aunque los consumidores siguen en curso
  assert.equal(reclamos.filas.length, 10);
  assert.equal(publicadorEspia.publicados.length, 10);

  await bus.vaciar();

  assert.deepEqual(simCorreo.conteos, { Brevo: 10, Resend: 10, Mailjet: 0 });
  assert.equal(simCorreo.abortadosPorTimeout.Brevo, 10);
  assert.equal(simCorreo.enviados.length, 10);
  assert.equal(m2Memoria.expedientes.length, 5);
  assert.equal(fallasBus.length, 5);
  assert.ok(fallasBus.every((f) => f.quien === 'm2' && f.error.includes('M2 respondió 502')));
});
