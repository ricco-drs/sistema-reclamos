import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { respuestaDeCuerpoInvalido, MENSAJE_CUERPO_INVALIDO } from '../http/cuerpoInvalido.js';

const esperado = { codigo: 'CUERPO_INVALIDO', error: MENSAJE_CUERPO_INVALIDO };

test('cuerpo inválido: JSON roto y cuerpo demasiado grande son 400 CUERPO_INVALIDO', () => {
  assert.deepEqual(respuestaDeCuerpoInvalido({ type: 'entity.parse.failed' }), { status: 400, body: esperado });
  assert.deepEqual(respuestaDeCuerpoInvalido({ type: 'entity.too.large' }), { status: 400, body: esperado });
});

test('cuerpo inválido: cualquier otro error no es asunto suyo', () => {
  assert.equal(respuestaDeCuerpoInvalido(new Error('otra cosa')), null);
  assert.equal(respuestaDeCuerpoInvalido({ code: 'LIMIT_FILE_SIZE' }), null);
  assert.equal(respuestaDeCuerpoInvalido(undefined), null);
});

// Con express.json() de verdad, para comprobar que los tipos que mira son los
// que Express pone, y no solo los que la prueba de arriba supone.
test('cuerpo inválido: con express.json() real responde 400 en los dos casos y no toca la ruta', async () => {
  const app = express();
  app.use(express.json({ limit: '1kb' }));
  let llegoALaRuta = false;
  app.post('/eco', (req, res) => { llegoALaRuta = true; res.json(req.body); });
  app.use((err, req, res, next) => {
    const r = respuestaDeCuerpoInvalido(err);
    if (r) return res.status(r.status).json(r.body);
    return next(err);
  });

  const servidor = app.listen(0);
  const url = `http://127.0.0.1:${servidor.address().port}/eco`;
  const enviar = (cuerpo) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: cuerpo });
  try {
    const roto = await enviar('{"categoria":');
    assert.equal(roto.status, 400);
    assert.deepEqual(await roto.json(), esperado);

    const grande = await enviar(JSON.stringify({ descripcion: 'x'.repeat(2048) }));
    assert.equal(grande.status, 400);
    assert.deepEqual(await grande.json(), esperado);

    assert.equal(llegoALaRuta, false);

    const bien = await enviar('{"ok":true}');
    assert.equal(bien.status, 200);
  } finally {
    servidor.close();
  }
});
