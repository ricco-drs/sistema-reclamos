// Experimento de resiliencia antes y después (Lab11 / Escenario E5 y flujo ReclamoRegistrado).
//
// Ejecuta localmente las corridas de 100 envíos y 100 registros de reclamos usando los
// adaptadores falsos en memoria (crearProveedorCorreoSimulado, crearClienteM2Memoria,
// crearPublicadorMemoria, crearRepositorioReclamosMemoria y crearBusEnProceso).
//
// Uso, desde sistema-reclamos/:
//   node pruebas/experimento-resiliencia.js

import { performance } from 'node:perf_hooks';
import { crearEnviadorCorreo, crearProveedorCorreoSimulado } from '../backend/infraestructura/enviadorCorreo.js';
import { crearRegistrarReclamo } from '../backend/aplicacion/registrarReclamo.js';
import { crearNotificadorDeReclamo } from '../backend/aplicacion/consumidores/notificarReclamoRegistrado.js';
import { crearEnviadorDeExpediente } from '../backend/aplicacion/consumidores/enviarExpedienteAM2.js';
import { crearRegistrarReclamoHandler } from '../backend/presentacion/registrarReclamoHandler.js';
import { crearRepositorioReclamosMemoria } from '../backend/infraestructura/repositorioReclamosMemoria.js';
import { crearPublicadorMemoria } from '../backend/infraestructura/publicadorMemoria.js';
import { crearBusEnProceso } from '../backend/infraestructura/busEnProceso.js';
import { crearClienteM2Http, crearClienteM2Memoria } from '../backend/infraestructura/clienteM2.js';
import { RECLAMO_REGISTRADO } from '../backend/dominio/eventos.js';

const TOTAL = 100;
const correoEstudiante = (n) => `estudiante-${String(n).padStart(3, '0')}@prueba.test`;

const CATALOGO = new Map([
  ['SW708', { nombre: 'Arquitectura de Soluciones de Software', secciones: ['U'] }],
]);

async function correrExperimentoCorreo({ titulo, modoBrevo, modoResend = 'ok', modoMailjet = 'ok', timeoutMs, demoraLentoMs = 50 }) {
  const sim = crearProveedorCorreoSimulado({
    Brevo: modoBrevo,
    Resend: modoResend,
    Mailjet: modoMailjet,
    demoraLentoMs,
  });
  const sendEmail = crearEnviadorCorreo({
    fetchFn: sim.fetchFn,
    timeoutMs,
    ...sim.credencialesFalsas,
    registrarError: () => {},
  });

  const t0 = performance.now();
  let entregadosDentroDeUmbral = 0;
  let conmutadosAResend = 0;

  for (let i = 1; i <= TOTAL; i++) {
    const tEnvio = performance.now();
    await sendEmail({
      to: correoEstudiante(i),
      subject: `Reclamo registrado: REC-2026-${String(i).padStart(4, '0')} — TEFIIS`,
      html: '<p>Tu reclamo fue registrado.</p>',
    });
    const duracionEnvio = performance.now() - tEnvio;
    if (duracionEnvio < demoraLentoMs * 0.8) entregadosDentroDeUmbral++;
  }
  const duracionTotalMs = Math.round(performance.now() - t0);
  conmutadosAResend = sim.enviados.filter((e) => e.proveedor === 'Resend').length;

  return {
    titulo,
    modoBrevo,
    timeoutMs: timeoutMs || 'Sin timeout',
    intentosBrevo: sim.conteos.Brevo,
    intentosResend: sim.conteos.Resend,
    intentosMailjet: sim.conteos.Mailjet,
    abortadosTimeout: sim.abortadosPorTimeout.Brevo,
    aceptadosTotal: sim.enviados.length,
    conmutadosAResend,
    entregadosDentroDeUmbral,
    duracionTotalMs,
  };
}

async function correrExperimentoRegistroEventos() {
  // ANTES: flujo acoplado donde la petición espera el envío de confirmación (con Brevo lento sin timeout)
  // y llama directamente a M2 (que falla o tarda).
  const simCorreoAntes = crearProveedorCorreoSimulado({ Brevo: 'lento', Resend: 'ok', demoraLentoMs: 40 });
  const sendEmailAntes = crearEnviadorCorreo({
    fetchFn: simCorreoAntes.fetchFn,
    timeoutMs: 0,
    ...simCorreoAntes.credencialesFalsas,
    registrarError: () => {},
  });

  const t0Antes = performance.now();
  let respuestas200Antes = 0;
  let expedientesM2Antes = 0;
  for (let i = 1; i <= TOTAL; i++) {
    await sendEmailAntes({ to: correoEstudiante(i), subject: 'Confirmación', html: '<p>x</p>' });
    // M2 caído (502): en useReclamos.ts solo hacía console.warn y se perdía sin registro en el backend
    respuestas200Antes++;
  }
  const tiempoRespuestaAntesMs = Math.round(performance.now() - t0Antes);

  // DESPUÉS: flujo por eventos ReclamoRegistrado con busEnProceso, crearEnviadorCorreo (timeout 10 ms -> Resend)
  // y consumidor de M2 con crearClienteM2Memoria / falla controlada en el bus.
  const reclamos = crearRepositorioReclamosMemoria();
  const publicadorMemoria = crearPublicadorMemoria();
  const m2Memoria = crearClienteM2Memoria();
  const erroresRegistradosEnBus = [];
  const bus = crearBusEnProceso({
    alFallar: (ev, quien, err) => erroresRegistradosEnBus.push({ eventoId: ev.eventoId, quien, mensaje: err.message }),
  });

  const simCorreoDespues = crearProveedorCorreoSimulado({ Brevo: 'lento', Resend: 'ok', demoraLentoMs: 40 });
  const sendEmailDespues = crearEnviadorCorreo({
    fetchFn: simCorreoDespues.fetchFn,
    timeoutMs: 10,
    ...simCorreoDespues.credencialesFalsas,
    registrarError: () => {},
  });

  bus.suscribir(RECLAMO_REGISTRADO, crearNotificadorDeReclamo({
    componerCorreo: ({ id, categoria }) => ({ subject: `Reclamo registrado: ${id}`, html: `<p>${categoria}</p>` }),
    enviarCorreo: sendEmailDespues,
  }), 'correo');

  bus.suscribir(RECLAMO_REGISTRADO, crearEnviadorDeExpediente({
    reclamos,
    m2: m2Memoria,
  }), 'm2');

  const registrar = crearRegistrarReclamo({
    reclamos,
    publicador: {
      async publicar(ev) {
        await publicadorMemoria.publicar(ev);
        await bus.publicar(ev);
      },
    },
    politica: { motivoDeRechazo: async () => null },
    catalogoCursos: CATALOGO,
    esEvidenciaPropia: (ref, email) => String(ref).startsWith(`${email}/`),
  });
  const handler = crearRegistrarReclamoHandler(registrar);

  const t0Despues = performance.now();
  let respuestas200Despues = 0;
  for (let i = 1; i <= TOTAL; i++) {
    const email = correoEstudiante(i);
    const res = {
      codigo: 200,
      status(n) { this.codigo = n; return this; },
      json(b) { this.body = b; return this; },
    };
    await handler({
      studentEmail: email,
      body: {
        nombre: `ESTUDIANTE PRUEBA ${i}`,
        codigo_estudiante: `2024${String(i).padStart(4, '0')}A`,
        categoria: 'Matrícula',
        descripcion: `Solicitud de matrícula del estudiante ${i}`,
        cursos_matricular: [{ codigo: 'SW708', seccion: 'U' }],
      },
    }, res);
    if (res.codigo === 200 && res.body?.success) respuestas200Despues++;
  }
  const tiempoRespuestaEstudianteDespuesMs = Math.round(performance.now() - t0Despues);
  await bus.vaciar();
  const tiempoTotalConConsumidoresMs = Math.round(performance.now() - t0Despues);

  // Corrida adicional con M2 caído (502) para demostrar aislamiento de fallas entre consumidores
  const reclamosM2Caido = crearRepositorioReclamosMemoria();
  const simCorreoM2Caido = crearProveedorCorreoSimulado({ Brevo: '429', Resend: 'ok' });
  const fallasM2 = [];
  const busM2Caido = crearBusEnProceso({
    alFallar: (ev, quien, err) => fallasM2.push({ eventoId: ev.eventoId, quien, mensaje: err.message }),
  });
  busM2Caido.suscribir(RECLAMO_REGISTRADO, crearNotificadorDeReclamo({
    componerCorreo: ({ id }) => ({ subject: `Reclamo registrado: ${id}`, html: '<p>ok</p>' }),
    enviarCorreo: crearEnviadorCorreo({
      fetchFn: simCorreoM2Caido.fetchFn,
      ...simCorreoM2Caido.credencialesFalsas,
      registrarError: () => {},
    }),
  }), 'correo');
  busM2Caido.suscribir(RECLAMO_REGISTRADO, crearEnviadorDeExpediente({
    reclamos: reclamosM2Caido,
    m2: crearClienteM2Http({
      url: 'http://m2.simulado.local/api/v1/m2/expedientes',
      fetchFn: async () => ({ ok: false, status: 502 }),
    }),
  }), 'm2');

  const handlerM2Caido = crearRegistrarReclamoHandler(crearRegistrarReclamo({
    reclamos: reclamosM2Caido,
    publicador: busM2Caido,
    politica: { motivoDeRechazo: async () => null },
    catalogoCursos: CATALOGO,
    esEvidenciaPropia: () => true,
  }));

  let respuestas200ConM2Caido = 0;
  for (let i = 1; i <= TOTAL; i++) {
    const res = { codigo: 200, status(n) { this.codigo = n; return this; }, json(b) { this.body = b; return this; } };
    await handlerM2Caido({
      studentEmail: correoEstudiante(i),
      body: { categoria: 'Matrícula', descripcion: `Reclamo con M2 caído ${i}` },
    }, res);
    if (res.codigo === 200) respuestas200ConM2Caido++;
  }
  await busM2Caido.vaciar();

  return {
    antes: {
      respuestas200: respuestas200Antes,
      tiempoRespuestaEstudianteMs: tiempoRespuestaAntesMs,
      conmutadosAResend: simCorreoAntes.enviados.filter((e) => e.proveedor === 'Resend').length,
      expedientesM2: expedientesM2Antes,
    },
    despues: {
      respuestas200: respuestas200Despues,
      eventosPublicados: publicadorMemoria.publicados.length,
      tiempoRespuestaEstudianteMs: tiempoRespuestaEstudianteDespuesMs,
      tiempoTotalConConsumidoresMs,
      conmutadosAResend: simCorreoDespues.enviados.filter((e) => e.proveedor === 'Resend').length,
      expedientesM2: m2Memoria.expedientes.length,
    },
    aislamientoM2Caido: {
      respuestas200Estudiante: respuestas200ConM2Caido,
      correosEntregadosPorResend: simCorreoM2Caido.enviados.length,
      fallasM2RegistradasEnBus: fallasM2.length,
    },
  };
}

const resultadosCorreo = [
  await correrExperimentoCorreo({ titulo: '1. Brevo 401 (Antes: sin timeout)', modoBrevo: '401', timeoutMs: 0 }),
  await correrExperimentoCorreo({ titulo: '2. Brevo 401 (Después: timeout 10 ms)', modoBrevo: '401', timeoutMs: 10 }),
  await correrExperimentoCorreo({ titulo: '3. Brevo 429 (Antes: sin timeout)', modoBrevo: '429', timeoutMs: 0 }),
  await correrExperimentoCorreo({ titulo: '4. Brevo 429 (Después: timeout 10 ms)', modoBrevo: '429', timeoutMs: 10 }),
  await correrExperimentoCorreo({ titulo: '5. Brevo lento 50 ms (Antes: sin timeout)', modoBrevo: 'lento', timeoutMs: 0, demoraLentoMs: 50 }),
  await correrExperimentoCorreo({ titulo: '6. Brevo lento 50 ms (Después: timeout 10 ms)', modoBrevo: 'lento', timeoutMs: 10, demoraLentoMs: 50 }),
];

const resultadoEventos = await correrExperimentoRegistroEventos();

console.log('\n=== PARTE 1: Experimento E5 (100 envíos de correo con proveedor simulado) ===');
console.table(resultadosCorreo);

console.log('\n=== PARTE 2: Registro de 100 reclamos por eventos (ReclamoRegistrado + M2 + Correo) ===');
console.log(JSON.stringify(resultadoEventos, null, 2));
