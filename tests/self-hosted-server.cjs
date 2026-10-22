const assert = require('node:assert/strict');
const { once } = require('node:events');
const { server } = require('../server');

(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    assert.equal((await health.json()).service, 'ayn-control');
    assert.equal(health.headers.get('x-content-type-options'), 'nosniff');

    const home = await fetch(base + '/');
    assert.equal(home.status, 200);
    assert.match(home.headers.get('content-type'), /^text\/html/);

    const missing = await fetch(base + '/api/no-existe');
    assert.equal(missing.status, 404);

    const traversal = await fetch(base + '/..%2Fpackage.json');
    assert.equal(traversal.status, 404);

    console.log('AYN Self-hosted OK: salud, portada, API y protección de rutas verificadas.');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
