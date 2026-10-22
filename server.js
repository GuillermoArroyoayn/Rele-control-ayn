const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const PORT = number(process.env.PORT, 8080, 1, 65535);
const HOST = String(process.env.HOST || '0.0.0.0');
const BODY_LIMIT = number(process.env.BODY_LIMIT_BYTES, 1_048_576, 1024, 10_485_760);
const API_TIMEOUT = number(process.env.API_TIMEOUT_MS, 65_000, 1000, 120_000);

const MIME = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function number(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
}

function enhanceResponse(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = value => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
  };
  res.send = value => {
    if (Buffer.isBuffer(value) || typeof value === 'string') return res.end(value);
    return res.json(value);
  };
  return res;
}

async function readBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return undefined;
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > BODY_LIMIT) {
      const error = new Error('Solicitud demasiado grande.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw); }
  catch {
    const error = new Error('JSON inválido.');
    error.status = 400;
    throw error;
  }
}

function apiFile(pathname) {
  if (!/^\/api\/[a-z0-9-]+$/.test(pathname)) return null;
  const file = path.join(ROOT, pathname + '.js');
  return file.startsWith(path.join(ROOT, 'api') + path.sep) && fs.existsSync(file) ? file : null;
}

async function serveApi(req, res, pathname) {
  const file = apiFile(pathname);
  if (!file) return res.status(404).json({ error: 'API no encontrada.' });
  req.body = await readBody(req);
  const timer = setTimeout(() => {
    if (!res.writableEnded) res.status(504).json({ error: 'La operación excedió el tiempo permitido.' });
  }, API_TIMEOUT);
  timer.unref();
  try {
    const handler = require(file);
    await handler(req, res);
  } finally {
    clearTimeout(timer);
  }
}

function staticFile(pathname) {
  let requested = pathname === '/' ? '/index.html' : pathname;
  try { requested = decodeURIComponent(requested); } catch { return null; }
  const relative = requested.replace(/^\/+/, '');
  if (!relative || relative.includes('\0') || relative.split('/').includes('..')) return null;
  const file = path.resolve(ROOT, relative);
  if (file === __filename || !file.startsWith(ROOT + path.sep)) return null;
  return file;
}

function serveStatic(req, res, pathname) {
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).json({ error: 'Método no permitido.' });
  const file = staticFile(pathname);
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.status(404).json({ error: 'Archivo no encontrado.' });
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', /\.(?:html|webmanifest)$/.test(file) ? 'no-cache' : 'public, max-age=3600');
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.status(500).end()).pipe(res);
}

const server = http.createServer(async (req, rawRes) => {
  const res = enhanceResponse(rawRes);
  securityHeaders(res);
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch { return res.status(400).json({ error: 'Dirección inválida.' }); }

  try {
    if (pathname === '/healthz') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, service: 'ayn-control', time: new Date().toISOString() });
    }
    if (pathname.startsWith('/api/')) return await serveApi(req, res, pathname);
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error('Error de servidor:', error);
    if (!res.headersSent) return res.status(error.status || 500).json({ error: error.message || 'Error interno.' });
    if (!res.writableEnded) res.end();
  }
});

if (require.main === module) {
  server.listen(PORT, HOST, () => console.log(`AYN Control escuchando en http://${HOST}:${PORT}`));
}

module.exports = { server };
