import test from 'node:test';
import assert from 'node:assert/strict';
import { crearRegistrarReclamo } from '../aplicacion/registrarReclamo.js';
import { crearNotificadorDeReclamo } from '../aplicacion/consumidores/notificarReclamoRegistrado.js';
import { crearEnviadorDeExpediente } from '../aplicacion/consumidores/enviarExpedienteAM2.js';
import { crearRegistrarReclamoHandler, statusDeErrorDeReclamo } from '../presentacion/registrarReclamoHandler.js';
import { crearRepositorioReclamosMemoria } from '../infraestructura/repositorioReclamosMemoria.js';
import { crearRepositorioReclamosSupabase } from '../infraestructura/repositorioReclamosSupabase.js';
import { crearPublicadorMemoria } from '../infraestructura/publicadorMemoria.js';
import { crearBusEnProceso } from '../infraestructura/busEnProceso.js';
import { crearClienteM2Http, crearClienteM2Memoria } from '../infraestructura/clienteM2.js';
import { crearPoliticaDeRecepcion } from '../infraestructura/politicaDeRecepcion.js';
import { ErrorDeReclamo, MOTIVO_NO_DISPONIBLE, MOTIVO_ENTRADA_INVALIDA, MOTIVO_NO_PERMITIDO } from '../dominio/reclamo.js';
import { crearReclamoRegistrado, RECLAMO_REGISTRADO } from '../dominio/eventos.js';

const CATALOGO = new Map([
  ['SW708', { nombre: 'Arquitectura de Software', secciones: ['U', 'V'] }],
  ['SI101', { nombre: 'Algoritmos', secciones: ['A'] }],
]);
const EMAIL = 'ana.perez@uni.pe';
const AHORA = new Date('2026-11-21T15:04:05.000Z');
const abierta = { motivoDeRechazo: async () => null };

function armar(opciones = {}) {
  const reclamos = opciones.reclamos ?? crearRepositorioReclamosMemoria({ reloj: () => AHORA });
  const publicador = opciones.publicador ?? crearPublicadorMemoria();
  const errores = [];
  const registrar = crearRegistrarReclamo({
    reclamos, publicador,
    politica: opciones.politica ?? abierta,
    catalogoCursos: CATALOGO,
    esEvidenciaPropia: (ref, email) => String(ref).startsWith(`${email}/`),
    reloj: () => AHORA,
    registrarError: (m) => errores.push(m),
    logActividad: opciones.logActividad,
  });
  return { registrar, reclamos, publicador, errores };
}

const entrada = (extra = {}) => ({ categoria: 'Cruce de horarios', descripcion: 'Me cruzan dos cursos', ...extra });

test('registra el reclamo y publica ReclamoRegistrado sin la descripción', async () => {
  const { registrar, reclamos, publicador } = armar();
  const r = await registrar({
    email: EMAIL,
    entrada: entrada({
      nombre: 'PEREZ, ANA', codigo_estudiante: '20240001A',
      cursos_matricular: [{ codigo: 'sw708', seccion: 'u', nombre: 'FALSO' }],
      evidencias: [{ ref: `${EMAIL}/boleta.pdf`, nombre: 'boleta.pdf', tipo: 'application/pdf', bytes: 10 }],
    }),
  });
  assert.deepEqual(r, { id: 'REC-2026-0001' });
  assert.equal(reclamos.filas[0].estado, 'PENDIENTE');
  assert.equal(reclamos.filas[0].datos_estudiante.cursosMatricular[0].nombre, 'Arquitectura de Software');
  assert.equal(publicador.publicados.length, 1);
  assert.deepEqual(publicador.publicados[0], {
    eventoId: 'REC-2026-0001:ReclamoRegistrado',
    tipo: 'ReclamoRegistrado',
    version: 1,
    ocurridoEn: '2026-11-21T15:04:05.000Z',
    reclamo: {
      id: 'REC-2026-0001', email: EMAIL, nombre: 'PEREZ, ANA', codigoEstudiante: '20240001A',
      categoria: 'Cruce de horarios', cursosRetirar: [],
      cursosMatricular: [{ codigo: 'SW708', seccion: 'U' }], tieneEvidencia: true,
    },
  });
  assert.equal(JSON.stringify(publicador.publicados[0]).includes('Me cruzan'), false);
});

test('un reintento devuelve el reclamo existente y no publica otro evento', async () => {
  const { registrar, publicador } = armar();
  const primero = await registrar({ email: EMAIL, entrada: entrada() });
  const segundo = await registrar({ email: EMAIL, entrada: entrada({ descripcion: '  Me cruzan dos cursos ' }) });
  assert.deepEqual(segundo, { id: primero.id, duplicado: true });
  assert.equal(publicador.publicados.length, 1);
});

test('el mismo estudiante puede mandar dos reclamos distintos', async () => {
  const { registrar } = armar();
  const a = await registrar({ email: EMAIL, entrada: entrada() });
  const b = await registrar({ email: EMAIL, entrada: entrada({ descripcion: 'Otro problema' }) });
  assert.notEqual(a.id, b.id);
});

test('valida categoría, descripción y número de pruebas antes de tocar la base', async () => {
  const reclamos = { ...crearRepositorioReclamosMemoria(), buscarDuplicado: () => assert.fail('No consultar') };
  const { registrar } = armar({ reclamos });
  for (const mala of [{}, { categoria: 'x' }, { descripcion: 'x' }, entrada({ evidencias: [{ ref: `${EMAIL}/a` }, { ref: `${EMAIL}/b` }] })]) {
    await assert.rejects(registrar({ email: EMAIL, entrada: mala }), (e) => e.motivo === MOTIVO_ENTRADA_INVALIDA);
  }
});

test('una prueba ajena es NO_PERMITIDO', async () => {
  const { registrar, publicador } = armar();
  await assert.rejects(
    registrar({ email: EMAIL, entrada: entrada({ evidencias: [{ ref: 'otro@uni.pe/boleta.pdf' }] }) }),
    (e) => e.motivo === MOTIVO_NO_PERMITIDO,
  );
  assert.equal(publicador.publicados.length, 0);
});

test('la política cierra la recepción con 503 antes de validar el cuerpo', async () => {
  const politica = { motivoDeRechazo: async () => 'Ventana cerrada' };
  const { registrar } = armar({ politica });
  await assert.rejects(registrar({ email: EMAIL, entrada: {} }), (e) => e.motivo === MOTIVO_NO_DISPONIBLE && e.message === 'Ventana cerrada');
});

test('los cursos: corta en 30 y descarta sin avisar los que no están en el catálogo', async () => {
  const { registrar, reclamos } = armar();
  const muchos = Array.from({ length: 40 }, () => ({ codigo: 'SW708', seccion: 'U' }));
  await registrar({
    email: EMAIL,
    entrada: entrada({ cursos_retirar: [...muchos, { codigo: 'XX999', seccion: 'U' }], cursos_matricular: [{ codigo: 'SW708', seccion: 'Z' }, { codigo: 'SI101', seccion: 'A' }] }),
  });
  assert.equal(reclamos.filas[0].datos_estudiante.cursosRetirar.length, 30);
  assert.deepEqual(reclamos.filas[0].datos_estudiante.cursosMatricular, [{ codigo: 'SI101', nombre: 'Algoritmos', seccion: 'A' }]);
});

test('numeración: reintenta tras choques de id y sigue', async () => {
  const { registrar } = armar({ reclamos: crearRepositorioReclamosMemoria({ colisiones: 3 }) });
  const r = await registrar({ email: EMAIL, entrada: entrada() });
  assert.equal(r.id, 'REC-2026-0004');
});

test('numeración: 10 choques seguidos dan 503 y no publican', async () => {
  const { registrar, publicador, errores } = armar({ reclamos: crearRepositorioReclamosMemoria({ colisiones: 10 }) });
  await assert.rejects(registrar({ email: EMAIL, entrada: entrada() }), (e) => e.motivo === MOTIVO_NO_DISPONIBLE);
  assert.equal(publicador.publicados.length, 0);
  assert.equal(errores.length, 1);
});

test('numeración: si la secuencia no responde usa el método anterior', async () => {
  const reclamos = crearRepositorioReclamosMemoria({ sinSecuencia: true });
  await reclamos.insertar({ id: 'REC-2026-0007', email: 'otra@uni.pe', descripcion: 'x' });
  const { registrar } = armar({ reclamos });
  const r = await registrar({ email: EMAIL, entrada: entrada() });
  assert.equal(r.id, 'REC-2026-0008');
});

test('un error real de la base no es colisión: se propaga y no publica', async () => {
  const { registrar, publicador } = armar({ reclamos: crearRepositorioReclamosMemoria({ falloInsercion: 'permiso denegado' }) });
  await assert.rejects(registrar({ email: EMAIL, entrada: entrada() }), /permiso denegado/);
  assert.equal(publicador.publicados.length, 0);
});

test('si publicar falla, el reclamo igual queda registrado', async () => {
  const publicador = { publicar: async () => { throw new Error('bus caído'); } };
  const { registrar, reclamos, errores } = armar({ publicador });
  const r = await registrar({ email: EMAIL, entrada: entrada() });
  assert.equal(r.id, 'REC-2026-0001');
  assert.equal(reclamos.filas.length, 1);
  assert.match(errores[0], /No se pudo publicar REC-2026-0001:ReclamoRegistrado/);
});

test('registra la actividad con el correo autenticado', async () => {
  let log;
  const { registrar } = armar({ logActividad: (e) => { log = e; } });
  await registrar({ email: EMAIL, entrada: entrada() });
  assert.deepEqual(log, { actorEmail: EMAIL, actorType: 'estudiante', accion: 'reclamo_creado', detalle: { caseId: 'REC-2026-0001', categoria: 'Cruce de horarios', evidencias: 0 } });
});

// ---------- adaptador HTTP ----------

function respuesta() {
  return { codigo: 200, status(n) { this.codigo = n; return this; }, json(body) { this.body = body; return this; } };
}

test('HTTP: 200 con id; duplicado lo marca', async () => {
  const { registrar } = armar();
  const handler = crearRegistrarReclamoHandler(registrar);
  const a = respuesta(); await handler({ studentEmail: EMAIL, body: entrada() }, a);
  assert.deepEqual(a.body, { success: true, id: 'REC-2026-0001' });
  const b = respuesta(); await handler({ studentEmail: EMAIL, body: entrada() }, b);
  assert.deepEqual(b.body, { success: true, id: 'REC-2026-0001', duplicado: true });
});

test('HTTP: traduce 400, 403, 503 y todo lo demás a 500', async () => {
  const casos = [
    [new ErrorDeReclamo('a', MOTIVO_ENTRADA_INVALIDA), 400],
    [new ErrorDeReclamo('b', MOTIVO_NO_PERMITIDO), 403],
    [new ErrorDeReclamo('c', MOTIVO_NO_DISPONIBLE), 503],
    [new Error('Supabase cayó'), 500],
  ];
  for (const [error, esperado] of casos) {
    assert.equal(statusDeErrorDeReclamo(error), esperado);
    const res = respuesta();
    await crearRegistrarReclamoHandler(async () => { throw error; })({ studentEmail: EMAIL, body: {} }, res);
    assert.equal(res.codigo, esperado);
    assert.deepEqual(res.body, { error: error.message });
  }
});

// ---------- eventos y consumidores ----------

test('evento: es inmutable y su id sirve para descartar repetidos', () => {
  const e = crearReclamoRegistrado({ id: 'REC-2026-0009', email: EMAIL, categoria: 'x', cursosRetirar: [], cursosMatricular: [] }, 'f');
  assert.equal(e.eventoId, 'REC-2026-0009:ReclamoRegistrado');
  assert.equal(e.tipo, RECLAMO_REGISTRADO);
  assert.throws(() => { 'use strict'; e.tipo = 'otro'; }, TypeError);
});

test('bus: cada consumidor recibe el evento y la falla de uno no afecta a los demás', async () => {
  const fallas = [];
  const bus = crearBusEnProceso({ alFallar: (ev, nombre, err) => fallas.push([ev.eventoId, nombre, err.message]) });
  const recibidos = [];
  bus.suscribir(RECLAMO_REGISTRADO, async () => { throw new Error('correo caído'); }, 'correo');
  bus.suscribir(RECLAMO_REGISTRADO, async (ev) => { recibidos.push(ev.eventoId); }, 'm2');
  await bus.publicar(crearReclamoRegistrado({ id: 'R1', email: EMAIL, categoria: 'x', cursosRetirar: [], cursosMatricular: [] }, 'f'));
  await bus.vaciar();
  assert.deepEqual(recibidos, ['R1:ReclamoRegistrado']);
  assert.deepEqual(fallas, [['R1:ReclamoRegistrado', 'correo', 'correo caído']]);
});

test('bus: publicar no espera a un consumidor lento', async () => {
  const bus = crearBusEnProceso();
  let terminó = false;
  bus.suscribir(RECLAMO_REGISTRADO, () => new Promise((ok) => setTimeout(() => { terminó = true; ok(); }, 30)));
  await bus.publicar(crearReclamoRegistrado({ id: 'R2', email: EMAIL, categoria: 'x', cursosRetirar: [], cursosMatricular: [] }, 'f'));
  assert.equal(terminó, false);
  await bus.vaciar();
  assert.equal(terminó, true);
});

test('flujo completo en memoria: un POST produce el correo y el expediente de M2', async () => {
  const reclamos = crearRepositorioReclamosMemoria();
  const correos = [];
  const m2 = crearClienteM2Memoria();
  const bus = crearBusEnProceso();
  bus.suscribir(RECLAMO_REGISTRADO, crearNotificadorDeReclamo({
    componerCorreo: ({ id, categoria }) => ({ subject: `Reclamo registrado: ${id}`, html: `<p>${categoria}</p>` }),
    enviarCorreo: async (c) => { correos.push(c); },
  }), 'correo');
  bus.suscribir(RECLAMO_REGISTRADO, crearEnviadorDeExpediente({ reclamos, m2 }), 'm2');

  const { registrar } = armar({ reclamos, publicador: bus });
  const res = respuesta();
  await crearRegistrarReclamoHandler(registrar)({
    studentEmail: EMAIL,
    body: entrada({ nombre: 'PEREZ, ANA', codigo_estudiante: '20240001A', descripcion: 'Texto formal del reclamo' }),
  }, res);
  await bus.vaciar();

  assert.deepEqual(correos, [{ to: EMAIL, subject: 'Reclamo registrado: REC-2026-0001', html: '<p>Cruce de horarios</p>' }]);
  assert.deepEqual(m2.expedientes, [{
    id: 'REC-2026-0001', codigoEstudiante: '20240001A', email: EMAIL, nombre: 'PEREZ, ANA',
    motivoReclamo: 'Cruce de horarios', descripcion: 'Texto formal del reclamo',
  }]);
});

test('consumidor de M2: si el reclamo no existe, falla en vez de enviar vacío', async () => {
  const m2 = crearClienteM2Memoria();
  const consumir = crearEnviadorDeExpediente({ reclamos: crearRepositorioReclamosMemoria(), m2 });
  await assert.rejects(consumir({ reclamo: { id: 'REC-2026-9999' } }), /no existe/);
  assert.equal(m2.expedientes.length, 0);
});

test('cliente M2 HTTP: manda el contrato actual y falla con error si M2 responde mal', async () => {
  const llamadas = [];
  const ok = crearClienteM2Http({ url: 'http://m2.test/api/v1/m2/expedientes', fetchFn: async (u, o) => { llamadas.push([u, o]); return { ok: true }; } });
  await ok.registrarExpediente({ id: 'R1', descripcion: 'd' });
  assert.equal(llamadas[0][0], 'http://m2.test/api/v1/m2/expedientes');
  assert.equal(llamadas[0][1].method, 'POST');
  assert.equal(llamadas[0][1].headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(llamadas[0][1].body), { id: 'R1', descripcion: 'd' });
  const mal = crearClienteM2Http({ url: 'http://m2.test', fetchFn: async () => ({ ok: false, status: 502 }) });
  await assert.rejects(mal.registrarExpediente({ id: 'R1' }), /M2 respondió 502/);
});

test('política: respeta el orden y los mensajes de la ruta actual', async () => {
  const dep = { tefiDurmiendoActivo: async () => false, despedidaActivaPara: async () => false, puedeEnviarReclamo: async () => true };
  assert.equal(await crearPoliticaDeRecepcion(dep).motivoDeRechazo(EMAIL), null);
  assert.match(await crearPoliticaDeRecepcion({ ...dep, tefiDurmiendoActivo: async () => true, despedidaActivaPara: async () => true }).motivoDeRechazo(EMAIL), /Tefi está durmiendo/);
  assert.match(await crearPoliticaDeRecepcion({ ...dep, despedidaActivaPara: async () => true }).motivoDeRechazo(EMAIL), /matrícula ha terminado/);
  assert.match(await crearPoliticaDeRecepcion({ ...dep, puedeEnviarReclamo: async () => false }).motivoDeRechazo(EMAIL), /ventana de reclamos está cerrada/);
});

// ---------- adaptador PostgREST ----------

test('adaptador Supabase: duplicado, secuencia, último id e insert conservan el contrato PostgREST', async () => {
  const llamadas = [];
  const respuestas = [
    { ok: true, json: async () => [{ id: 'REC-2026-0003', descripcion: ' texto ' }] },
    { ok: true, json: async () => 12 },
    { ok: true, json: async () => [{ id: 'REC-2026-0011' }] },
    { ok: false, status: 409, text: async () => 'duplicate key' },
    { ok: false, status: 400, text: async () => 'columna inexistente' },
  ];
  const repo = crearRepositorioReclamosSupabase(async (url, op) => { llamadas.push({ url, op }); return respuestas.shift(); });
  assert.equal(await repo.buscarDuplicado('a@uni.pe', 'texto', '2026-11-21T00:00:00Z'), 'REC-2026-0003');
  assert.ok(llamadas[0].url.includes('email=eq.a%40uni.pe'));
  assert.equal(await repo.siguienteNumero(), 12);
  assert.equal(llamadas[1].url, '/rpc/siguiente_id_reclamo');
  assert.equal(await repo.ultimoIdDelAnio(2026), 'REC-2026-0011');
  assert.deepEqual(await repo.insertar({ id: 'X' }), { ok: false, colision: true, detalle: 'duplicate key' });
  assert.deepEqual(await repo.insertar({ id: 'X' }), { ok: false, colision: false, detalle: 'columna inexistente' });
  assert.equal(llamadas[3].op.headers.Prefer, 'return=minimal');
});

test('adaptador Supabase: una secuencia ausente o rota devuelve null en vez de fallar', async () => {
  assert.equal(await crearRepositorioReclamosSupabase(async () => ({ ok: false })).siguienteNumero(), null);
  assert.equal(await crearRepositorioReclamosSupabase(async () => { throw new Error('red'); }).siguienteNumero(), null);
  assert.equal(await crearRepositorioReclamosSupabase(async () => ({ ok: true, json: async () => 'no es número' })).siguienteNumero(), null);
});
