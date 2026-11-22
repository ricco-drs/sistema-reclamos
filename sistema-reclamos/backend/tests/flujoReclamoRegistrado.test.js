// ReclamoRegistrado cruza dos módulos: lo publica reclamos y lo consume notificaciones.
// Ninguno importa al otro, así que el contrato entre los dos se prueba aquí, fuera de
// ambos y solo con lo que exporta cada paquete (Lab10, paso 6; docs/api/eventos.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBusEnProceso, crearPublicadorMemoria } from '@tefiis/compartido';
import {
  RECLAMO_REGISTRADO, crearRegistrarReclamo, crearRegistrarReclamoHandler, crearRepositorioReclamosMemoria,
} from '@tefiis/reclamos';
import { crearConsumidoresDeReclamoRegistrado, crearClienteM2Memoria, componerConfirmacion } from '@tefiis/notificaciones';

const EMAIL = 'ana.perez@uni.pe';
const AHORA = new Date('2026-11-21T15:04:05.000Z');

function registrador({ reclamos, publicador }) {
  return crearRegistrarReclamo({
    reclamos,
    publicador,
    politica: { motivoDeRechazo: async () => null },
    catalogoCursos: new Map(),
    esEvidenciaPropia: () => true,
    esDocumentoPropio: () => true,
    reloj: () => AHORA,
  });
}

const entrada = (extra = {}) => ({ categoria: 'Cruce de horarios', descripcion: 'Texto formal del reclamo', ...extra });

test('contrato: el evento de reclamos trae los cuatro campos que lee notificaciones, en la versión 1', async () => {
  const publicador = crearPublicadorMemoria();
  const registrar = registrador({ reclamos: crearRepositorioReclamosMemoria({ reloj: () => AHORA }), publicador });
  await registrar({ email: EMAIL, entrada: entrada({ nombre: 'PEREZ, ANA' }) });
  await registrar({ email: 'luis@uni.pe', entrada: entrada() });

  const [conNombre, sinNombre] = publicador.publicados;
  for (const evento of [conNombre, sinNombre]) {
    assert.equal(evento.tipo, RECLAMO_REGISTRADO);
    assert.equal(evento.version, 1);
    assert.equal(typeof evento.reclamo.id, 'string');
    assert.equal(typeof evento.reclamo.email, 'string');
    assert.equal(typeof evento.reclamo.categoria, 'string');
    assert.ok(evento.reclamo.nombre === null || typeof evento.reclamo.nombre === 'string');
  }
  assert.deepEqual(
    { id: conNombre.reclamo.id, email: conNombre.reclamo.email, nombre: conNombre.reclamo.nombre, categoria: conNombre.reclamo.categoria },
    { id: 'REC-2026-0001', email: EMAIL, nombre: 'PEREZ, ANA', categoria: 'Cruce de horarios' },
  );
  assert.equal(sinNombre.reclamo.nombre, null);
  // La descripción no viaja en el evento (versión 1): el consumidor de M2 la lee por la fuente.
  assert.equal(JSON.stringify(conNombre).includes('Texto formal'), false);
});

test('contrato: el repositorio de reclamos cumple la fuente de expedientes que pide notificaciones', async () => {
  const reclamos = crearRepositorioReclamosMemoria({ reloj: () => AHORA });
  const registrar = registrador({ reclamos, publicador: crearPublicadorMemoria() });
  const { id } = await registrar({ email: EMAIL, entrada: entrada({ nombre: 'PEREZ, ANA', codigo_estudiante: '20240001A' }) });
  const m2 = crearClienteM2Memoria();
  const { m2: consumirM2 } = crearConsumidoresDeReclamoRegistrado({ enviarCorreo: async () => {}, fuenteDeExpedientes: reclamos, m2 });
  await consumirM2({ reclamo: { id } });
  assert.deepEqual(m2.expedientes, [{
    id, codigoEstudiante: '20240001A', email: EMAIL, nombre: 'PEREZ, ANA',
    motivoReclamo: 'Cruce de horarios', descripcion: 'Texto formal del reclamo',
  }]);
});

test('de extremo a extremo: un POST produce un solo correo de confirmación y un solo expediente en M2', async () => {
  const reclamos = crearRepositorioReclamosMemoria({ reloj: () => AHORA });
  const correos = [];
  const m2 = crearClienteM2Memoria();
  const bus = crearBusEnProceso();
  const consumidores = crearConsumidoresDeReclamoRegistrado({
    enviarCorreo: async (c) => { correos.push(c); },
    fuenteDeExpedientes: reclamos,
    m2,
  });
  bus.suscribir(RECLAMO_REGISTRADO, consumidores.correo, 'correo');
  bus.suscribir(RECLAMO_REGISTRADO, consumidores.m2, 'm2');

  const manejar = crearRegistrarReclamoHandler(registrador({ reclamos, publicador: bus }));
  const res = { status(n) { this.codigo = n; return this; }, set() { return this; }, json(b) { this.body = b; return this; } };
  const cuerpo = entrada({ nombre: 'PEREZ, ANA', codigo_estudiante: '20240001A', avisos: 'api' });
  await manejar({ studentEmail: EMAIL, body: cuerpo }, res);
  await manejar({ studentEmail: EMAIL, body: cuerpo }, res); // reenvío: no publica otra vez
  await bus.vaciar();

  assert.equal(correos.length, 1);
  assert.equal(correos[0].to, EMAIL);
  assert.deepEqual(
    { subject: correos[0].subject, html: correos[0].html },
    componerConfirmacion({ id: 'REC-2026-0001', nombre: 'PEREZ, ANA', categoria: 'Cruce de horarios', email: EMAIL }),
  );
  assert.deepEqual(m2.expedientes, [{
    id: 'REC-2026-0001', codigoEstudiante: '20240001A', email: EMAIL, nombre: 'PEREZ, ANA',
    motivoReclamo: 'Cruce de horarios', descripcion: 'Texto formal del reclamo',
  }]);
});
