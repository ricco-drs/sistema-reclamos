// El bus es técnico: no conoce ningún evento en particular. Por eso estas pruebas usan
// eventos sueltos y no importan el evento de reclamos (compartido no importa módulos).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBusEnProceso } from '../eventos/busEnProceso.js';

const TIPO = 'AlgoPasó';
const evento = (id) => Object.freeze({ tipo: TIPO, eventoId: `${id}:${TIPO}` });

test('bus: cada consumidor recibe el evento y la falla de uno no afecta a los demás', async () => {
  const fallas = [];
  const bus = crearBusEnProceso({ alFallar: (ev, nombre, err) => fallas.push([ev.eventoId, nombre, err.message]) });
  const recibidos = [];
  bus.suscribir(TIPO, async () => { throw new Error('correo caído'); }, 'correo');
  bus.suscribir(TIPO, async (ev) => { recibidos.push(ev.eventoId); }, 'm2');
  await bus.publicar(evento('R1'));
  await bus.vaciar();
  assert.deepEqual(recibidos, [`R1:${TIPO}`]);
  assert.deepEqual(fallas, [[`R1:${TIPO}`, 'correo', 'correo caído']]);
});

test('bus: publicar no espera a un consumidor lento', async () => {
  const bus = crearBusEnProceso();
  let terminó = false;
  bus.suscribir(TIPO, () => new Promise((ok) => setTimeout(() => { terminó = true; ok(); }, 30)));
  await bus.publicar(evento('R2'));
  assert.equal(terminó, false);
  await bus.vaciar();
  assert.equal(terminó, true);
});

test('bus: un evento de otro tipo no llega a los suscritos', async () => {
  const bus = crearBusEnProceso();
  const recibidos = [];
  bus.suscribir(TIPO, async (ev) => { recibidos.push(ev.eventoId); });
  await bus.publicar({ tipo: 'OtraCosa', eventoId: 'X' });
  await bus.vaciar();
  assert.deepEqual(recibidos, []);
});
