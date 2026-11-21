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
import {
  ErrorDeReclamo, MOTIVO_NO_DISPONIBLE, MOTIVO_ENTRADA_INVALIDA, MOTIVO_NO_PERMITIDO, MOTIVO_CERRADO, CODIGO,
} from '../dominio/reclamo.js';
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
    esDocumentoPropio: (ref, email) => String(ref).startsWith(`${email}/`),
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
  assert.deepEqual(r, { id: 'REC-2026-0001', estado: 'PENDIENTE', creadoEn: AHORA.toISOString(), cursosDescartados: [] });
  assert.equal(reclamos.filas[0].created_at, AHORA.toISOString());
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
  assert.deepEqual(segundo, { id: primero.id, duplicado: true, creadoEn: primero.creadoEn });
  assert.equal(publicador.publicados.length, 1);
});

test('el reenvío devuelve la fecha de creación del reclamo original, no la del segundo envío', async () => {
  let ahora = new Date('2026-11-21T15:00:00.000Z');
  const reclamos = crearRepositorioReclamosMemoria({ reloj: () => ahora });
  const registrar = crearRegistrarReclamo({
    reclamos, publicador: crearPublicadorMemoria(), politica: abierta, catalogoCursos: CATALOGO,
    esEvidenciaPropia: () => true, reloj: () => ahora,
  });
  const primero = await registrar({ email: EMAIL, entrada: entrada() });
  ahora = new Date('2026-11-21T15:04:00.000Z');
  const segundo = await registrar({ email: EMAIL, entrada: entrada() });
  assert.equal(primero.creadoEn, '2026-11-21T15:00:00.000Z');
  assert.equal(segundo.duplicado, true);
  assert.equal(segundo.creadoEn, '2026-11-21T15:00:00.000Z');
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
  const casos = [
    [{}, CODIGO.DATOS_INCOMPLETOS],
    [{ categoria: 'x' }, CODIGO.DATOS_INCOMPLETOS],
    [{ descripcion: 'x' }, CODIGO.DATOS_INCOMPLETOS],
    [entrada({ evidencias: [{ ref: `${EMAIL}/a` }, { ref: `${EMAIL}/b` }] }), CODIGO.DEMASIADAS_PRUEBAS],
  ];
  for (const [mala, codigo] of casos) {
    await assert.rejects(registrar({ email: EMAIL, entrada: mala }), (e) => e.motivo === MOTIVO_ENTRADA_INVALIDA && e.codigo === codigo);
  }
});

test('una prueba ajena es NO_PERMITIDO', async () => {
  const { registrar, publicador } = armar();
  await assert.rejects(
    registrar({ email: EMAIL, entrada: entrada({ evidencias: [{ ref: 'otro@uni.pe/boleta.pdf' }] }) }),
    (e) => e.motivo === MOTIVO_NO_PERMITIDO && e.codigo === CODIGO.PRUEBA_AJENA,
  );
  assert.equal(publicador.publicados.length, 0);
});

test('la política cierra la recepción antes de validar el cuerpo: pausa 503, ciclo y ventana 409', async () => {
  const casos = [
    [CODIGO.SISTEMA_EN_PAUSA, MOTIVO_NO_DISPONIBLE],
    [CODIGO.CICLO_CERRADO, MOTIVO_CERRADO],
    [CODIGO.VENTANA_CERRADA, MOTIVO_CERRADO],
  ];
  for (const [codigo, motivo] of casos) {
    const { registrar } = armar({ politica: { motivoDeRechazo: async () => ({ codigo, mensaje: 'Cerrado' }) } });
    await assert.rejects(
      registrar({ email: EMAIL, entrada: {} }),
      (e) => e.motivo === motivo && e.codigo === codigo && e.message === 'Cerrado',
    );
  }
});

test('los cursos: corta en 30 y descarta los que no están en el catálogo, y dice cuáles y por qué', async () => {
  const { registrar, reclamos } = armar();
  const muchos = Array.from({ length: 40 }, () => ({ codigo: 'SW708', seccion: 'U' }));
  const r = await registrar({
    email: EMAIL,
    entrada: entrada({ cursos_retirar: [...muchos, { codigo: 'XX999', seccion: 'U' }], cursos_matricular: [{ codigo: 'SW708', seccion: 'Z' }, { codigo: 'SI101', seccion: 'A' }] }),
  });
  assert.equal(reclamos.filas[0].datos_estudiante.cursosRetirar.length, 30);
  assert.deepEqual(reclamos.filas[0].datos_estudiante.cursosMatricular, [{ codigo: 'SI101', nombre: 'Algoritmos', seccion: 'A' }]);
  // De cursos_retirar pasan del límite los 10 de más y XX999 (11); de cursos_matricular, una sección que no es del curso.
  assert.equal(r.cursosDescartados.length, 12);
  assert.equal(r.cursosDescartados.filter((d) => d.lista === 'retirar' && d.motivo === 'EXCEDE_LIMITE').length, 11);
  assert.deepEqual(r.cursosDescartados.at(-1), { lista: 'matricular', codigo: 'SW708', seccion: 'Z', motivo: 'SECCION_NO_PERTENECE' });
});

test('los cursos descartados traen lista, código, sección y motivo', async () => {
  const { registrar } = armar();
  const r = await registrar({
    email: EMAIL,
    entrada: entrada({
      cursos_retirar: [{ codigo: ' xx999 ', seccion: 'u' }, { codigo: 'SW708', seccion: 'Z' }, { codigo: 'SW708', seccion: 'U' }],
      cursos_matricular: [null, { codigo: 'SI101', seccion: 'A' }],
    }),
  });
  assert.deepEqual(r.cursosDescartados, [
    { lista: 'retirar', codigo: 'XX999', seccion: 'U', motivo: 'NO_EXISTE_EN_CATALOGO' },
    { lista: 'retirar', codigo: 'SW708', seccion: 'Z', motivo: 'SECCION_NO_PERTENECE' },
    { lista: 'matricular', codigo: '', seccion: '', motivo: 'NO_EXISTE_EN_CATALOGO' },
  ]);
});

test('un reintento no trae cursos descartados: no guarda nada del segundo envío', async () => {
  const { registrar } = armar();
  await registrar({ email: EMAIL, entrada: entrada({ cursos_retirar: [{ codigo: 'XX999', seccion: 'U' }] }) });
  const segundo = await registrar({ email: EMAIL, entrada: entrada({ cursos_retirar: [{ codigo: 'YY111', seccion: 'U' }] }) });
  assert.equal(segundo.duplicado, true);
  assert.equal('cursosDescartados' in segundo, false);
});

test('código UNI: acepta 7 u 8 dígitos y una letra, y rechaza lo demás con CODIGO_UNI_INVALIDO', async () => {
  const { registrar, reclamos } = armar();
  for (const bueno of ['20240001A', '2024001B', ' 20240001a ']) {
    await registrar({ email: EMAIL, entrada: entrada({ descripcion: `Reclamo ${bueno}`, codigo_estudiante: bueno }) });
  }
  assert.deepEqual(reclamos.filas.map((f) => f.codigo_estudiante), ['20240001A', '2024001B', '20240001A']);
  for (const malo of ['2024A', '202400001A', '20240001', '20240001AB', 'ABCDEFGHA', '2024 0001A']) {
    await assert.rejects(
      registrar({ email: EMAIL, entrada: entrada({ descripcion: `Malo ${malo}`, codigo_estudiante: malo }) }),
      (e) => e.motivo === MOTIVO_ENTRADA_INVALIDA && e.codigo === CODIGO.CODIGO_UNI_INVALIDO,
    );
  }
  assert.equal(reclamos.filas.length, 3);
});

test('descripción: 5 000 caracteres pasan y 5 001 se rechazan con 400', async () => {
  const { registrar, reclamos } = armar();
  await registrar({ email: EMAIL, entrada: entrada({ descripcion: 'a'.repeat(5000) }) });
  await assert.rejects(
    registrar({ email: EMAIL, entrada: entrada({ descripcion: 'a'.repeat(5001) }) }),
    (e) => e.motivo === MOTIVO_ENTRADA_INVALIDA && e.codigo === CODIGO.DESCRIPCION_DEMASIADO_LARGA,
  );
  assert.equal(reclamos.filas.length, 1);
});

test('documentos ajenos: se rechazan con 403 DOCUMENTO_AJENO y no se guarda nada', async () => {
  const { registrar, reclamos, publicador } = armar();
  const propios = { ficha: `${EMAIL}/ficha.pdf`, avance: `${EMAIL}/avance.pdf`, boleta: '' };
  await registrar({ email: EMAIL, entrada: entrada({ documentos: propios }) });
  for (const ajeno of [{ ficha: 'otro@uni.pe/ficha.pdf' }, { ...propios, avance: 'otro@uni.pe/avance.pdf' }]) {
    await assert.rejects(
      registrar({ email: EMAIL, entrada: entrada({ descripcion: 'Otro', documentos: ajeno }) }),
      (e) => e.motivo === MOTIVO_NO_PERMITIDO && e.codigo === CODIGO.DOCUMENTO_AJENO,
    );
  }
  assert.equal(reclamos.filas.length, 1);
  assert.equal(publicador.publicados.length, 1);
});

test('documentos: sin un verificador de propiedad no se acepta ninguna referencia', async () => {
  const reclamos = crearRepositorioReclamosMemoria({ reloj: () => AHORA });
  const registrar = crearRegistrarReclamo({
    reclamos, publicador: crearPublicadorMemoria(), politica: abierta, catalogoCursos: CATALOGO,
    esEvidenciaPropia: () => true, reloj: () => AHORA,
  });
  await registrar({ email: EMAIL, entrada: entrada({ documentos: {} }) });
  await assert.rejects(
    registrar({ email: EMAIL, entrada: entrada({ descripcion: 'Con ficha', documentos: { ficha: `${EMAIL}/ficha.pdf` } }) }),
    (e) => e.codigo === CODIGO.DOCUMENTO_AJENO,
  );
});

test('documentos: una `evidencias` que el cliente pone dentro de documentos no se guarda', async () => {
  const { registrar, reclamos } = armar();
  await registrar({
    email: EMAIL,
    entrada: entrada({ documentos: { ficha: `${EMAIL}/ficha.pdf`, evidencias: [{ ref: 'otro@uni.pe/secreto.pdf' }] } }),
  });
  assert.equal('evidencias' in reclamos.filas[0].documentos, false);
  assert.equal(reclamos.filas[0].documentos.ficha, `${EMAIL}/ficha.pdf`);
});

test('orden de las comprobaciones: la política va antes que los campos, y los campos en un orden fijo', async () => {
  const todoMal = entrada({
    descripcion: 'a'.repeat(5001), codigo_estudiante: 'malo',
    evidencias: [{ ref: 'otro@uni.pe/a' }, { ref: 'otro@uni.pe/b' }], documentos: { ficha: 'otro@uni.pe/f' },
  });
  const cerrada = armar({ politica: { motivoDeRechazo: async () => ({ codigo: CODIGO.VENTANA_CERRADA, mensaje: 'x' }) } });
  await assert.rejects(cerrada.registrar({ email: EMAIL, entrada: todoMal }), (e) => e.codigo === CODIGO.VENTANA_CERRADA);

  const { registrar } = armar();
  const orden = [];
  let actual = todoMal;
  const probar = async () => { await registrar({ email: EMAIL, entrada: actual }).catch((e) => orden.push(e.codigo)); };
  await probar();                                                                   // descripción demasiado larga
  actual = { ...actual, descripcion: 'ok' }; await probar();                        // código UNI
  actual = { ...actual, codigo_estudiante: '20240001A' }; await probar();           // demasiadas pruebas
  actual = { ...actual, evidencias: [{ ref: 'otro@uni.pe/a' }] }; await probar();   // prueba ajena
  actual = { ...actual, evidencias: [] }; await probar();                           // documento ajeno
  assert.deepEqual(orden, [
    CODIGO.DESCRIPCION_DEMASIADO_LARGA, CODIGO.CODIGO_UNI_INVALIDO, CODIGO.DEMASIADAS_PRUEBAS,
    CODIGO.PRUEBA_AJENA, CODIGO.DOCUMENTO_AJENO,
  ]);
});

test('numeración: reintenta tras choques de id y sigue', async () => {
  const { registrar } = armar({ reclamos: crearRepositorioReclamosMemoria({ colisiones: 3 }) });
  const r = await registrar({ email: EMAIL, entrada: entrada() });
  assert.equal(r.id, 'REC-2026-0004');
});

test('numeración: 10 choques seguidos dan 503 y no publican', async () => {
  const { registrar, publicador, errores } = armar({ reclamos: crearRepositorioReclamosMemoria({ colisiones: 10 }) });
  await assert.rejects(
    registrar({ email: EMAIL, entrada: entrada() }),
    (e) => e.motivo === MOTIVO_NO_DISPONIBLE && e.codigo === CODIGO.SIN_NUMERO_DISPONIBLE,
  );
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
  return {
    codigo: 200,
    cabeceras: {},
    set(nombre, valor) { this.cabeceras[nombre] = valor; return this; },
    status(n) { this.codigo = n; return this; },
    json(body) { this.body = body; return this; },
  };
}

test('HTTP: 201 con Location y cursos_descartados al crear; 200 con Location y duplicado en el reenvío', async () => {
  const { registrar } = armar();
  const handler = crearRegistrarReclamoHandler(registrar);
  const a = respuesta();
  await handler({ studentEmail: EMAIL, body: entrada({ cursos_retirar: [{ codigo: 'XX999', seccion: 'U' }] }) }, a);
  assert.equal(a.codigo, 201);
  assert.equal(a.cabeceras.Location, '/api/reclamos/mine/REC-2026-0001');
  assert.deepEqual(a.body, {
    success: true, id: 'REC-2026-0001', estado: 'PENDIENTE', creado_en: AHORA.toISOString(),
    cursos_descartados: [{ lista: 'retirar', codigo: 'XX999', seccion: 'U', motivo: 'NO_EXISTE_EN_CATALOGO' }],
  });
  const b = respuesta(); await handler({ studentEmail: EMAIL, body: entrada() }, b);
  assert.equal(b.codigo, 200);
  assert.equal(b.cabeceras.Location, '/api/reclamos/mine/REC-2026-0001');
  assert.deepEqual(b.body, { success: true, id: 'REC-2026-0001', duplicado: true, creado_en: AHORA.toISOString() });
});

test('HTTP: sin cursos descartados el 201 trae la lista vacía', async () => {
  const { registrar } = armar();
  const res = respuesta();
  await crearRegistrarReclamoHandler(registrar)({ studentEmail: EMAIL, body: entrada() }, res);
  assert.equal(res.codigo, 201);
  assert.deepEqual(res.body.cursos_descartados, []);
});

test('HTTP: traduce 400, 403, 409, 503 y todo lo demás a 500, siempre con su código', async () => {
  const casos = [
    [new ErrorDeReclamo('a', MOTIVO_ENTRADA_INVALIDA, CODIGO.DATOS_INCOMPLETOS), 400, 'DATOS_INCOMPLETOS'],
    [new ErrorDeReclamo('b', MOTIVO_NO_PERMITIDO, CODIGO.PRUEBA_AJENA), 403, 'PRUEBA_AJENA'],
    [new ErrorDeReclamo('c', MOTIVO_CERRADO, CODIGO.VENTANA_CERRADA), 409, 'VENTANA_CERRADA'],
    [new ErrorDeReclamo('d', MOTIVO_CERRADO, CODIGO.CICLO_CERRADO), 409, 'CICLO_CERRADO'],
    [new ErrorDeReclamo('e', MOTIVO_NO_DISPONIBLE, CODIGO.SISTEMA_EN_PAUSA), 503, 'SISTEMA_EN_PAUSA'],
    [new ErrorDeReclamo('f', MOTIVO_NO_DISPONIBLE, CODIGO.SIN_NUMERO_DISPONIBLE), 503, 'SIN_NUMERO_DISPONIBLE'],
    [new Error('Supabase cayó'), 500, 'ERROR_INTERNO'],
    [new ErrorDeReclamo('sin código'), 400, 'ERROR_INTERNO'],
  ];
  for (const [error, esperado, codigo] of casos) {
    assert.equal(statusDeErrorDeReclamo(error), esperado);
    const res = respuesta();
    await crearRegistrarReclamoHandler(async () => { throw error; })({ studentEmail: EMAIL, body: {} }, res);
    assert.equal(res.codigo, esperado);
    assert.deepEqual(res.body, { error: error.message, codigo });
  }
});

test('HTTP: Retry-After solo en SIN_NUMERO_DISPONIBLE, no en la pausa ni en los cierres', async () => {
  const conRetry = [];
  for (const codigo of [CODIGO.SIN_NUMERO_DISPONIBLE, CODIGO.SISTEMA_EN_PAUSA, CODIGO.CICLO_CERRADO, CODIGO.VENTANA_CERRADA, CODIGO.ERROR_INTERNO]) {
    const motivo = { SIN_NUMERO_DISPONIBLE: MOTIVO_NO_DISPONIBLE, SISTEMA_EN_PAUSA: MOTIVO_NO_DISPONIBLE, ERROR_INTERNO: MOTIVO_NO_DISPONIBLE }[codigo] ?? MOTIVO_CERRADO;
    const res = respuesta();
    await crearRegistrarReclamoHandler(async () => { throw new ErrorDeReclamo('x', motivo, codigo); })({ studentEmail: EMAIL, body: {} }, res);
    if ('Retry-After' in res.cabeceras) conRetry.push([codigo, res.cabeceras['Retry-After']]);
  }
  assert.deepEqual(conRetry, [[CODIGO.SIN_NUMERO_DISPONIBLE, '5']]);
});

test('HTTP: la política cerrada responde 503 en pausa y 409 en ciclo y ventana, con el orden pausa, ciclo, ventana', async () => {
  const dep = { tefiDurmiendoActivo: async () => true, despedidaActivaPara: async () => true, puedeEnviarReclamo: async () => false };
  const casos = [
    [dep, 503, 'SISTEMA_EN_PAUSA'],
    [{ ...dep, tefiDurmiendoActivo: async () => false }, 409, 'CICLO_CERRADO'],
    [{ ...dep, tefiDurmiendoActivo: async () => false, despedidaActivaPara: async () => false }, 409, 'VENTANA_CERRADA'],
  ];
  for (const [d, status, codigo] of casos) {
    const { registrar } = armar({ politica: crearPoliticaDeRecepcion(d) });
    const res = respuesta();
    await crearRegistrarReclamoHandler(registrar)({ studentEmail: EMAIL, body: {} }, res);
    assert.equal(res.codigo, status);
    assert.equal(res.body.codigo, codigo);
    assert.equal('Retry-After' in res.cabeceras, false);
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

test('política: respeta el orden y los mensajes de la ruta actual, y da el código de cada rechazo', async () => {
  const dep = { tefiDurmiendoActivo: async () => false, despedidaActivaPara: async () => false, puedeEnviarReclamo: async () => true };
  assert.equal(await crearPoliticaDeRecepcion(dep).motivoDeRechazo(EMAIL), null);
  const pausa = await crearPoliticaDeRecepcion({ ...dep, tefiDurmiendoActivo: async () => true, despedidaActivaPara: async () => true }).motivoDeRechazo(EMAIL);
  assert.equal(pausa.codigo, CODIGO.SISTEMA_EN_PAUSA);
  assert.match(pausa.mensaje, /Tefi está durmiendo/);
  const ciclo = await crearPoliticaDeRecepcion({ ...dep, despedidaActivaPara: async () => true }).motivoDeRechazo(EMAIL);
  assert.equal(ciclo.codigo, CODIGO.CICLO_CERRADO);
  assert.match(ciclo.mensaje, /matrícula ha terminado/);
  const ventana = await crearPoliticaDeRecepcion({ ...dep, puedeEnviarReclamo: async () => false }).motivoDeRechazo(EMAIL);
  assert.equal(ventana.codigo, CODIGO.VENTANA_CERRADA);
  assert.match(ventana.mensaje, /ventana de reclamos está cerrada/);
});

// ---------- adaptador PostgREST ----------

test('adaptador Supabase: duplicado, secuencia, último id e insert conservan el contrato PostgREST', async () => {
  const llamadas = [];
  const respuestas = [
    { ok: true, json: async () => [{ id: 'REC-2026-0003', descripcion: ' texto ', created_at: '2026-11-21T14:58:00.123456+00:00' }] },
    { ok: true, json: async () => 12 },
    { ok: true, json: async () => [{ id: 'REC-2026-0011' }] },
    { ok: false, status: 409, text: async () => 'duplicate key' },
    { ok: false, status: 400, text: async () => 'columna inexistente' },
  ];
  const repo = crearRepositorioReclamosSupabase(async (url, op) => { llamadas.push({ url, op }); return respuestas.shift(); });
  assert.deepEqual(await repo.buscarDuplicado('a@uni.pe', 'texto', '2026-11-21T00:00:00Z'), { id: 'REC-2026-0003', creadoEn: '2026-11-21T14:58:00.123456+00:00' });
  assert.ok(llamadas[0].url.includes('select=id,descripcion,created_at'));
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
