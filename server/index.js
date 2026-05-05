import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateConflictError, createStateStore } from './storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES || 5 * 1024 * 1024);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(response) {
  response.writeHead(204, { 'cache-control': 'no-store' });
  response.end();
}

function sendState(response, envelope) {
  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    etag: `"${envelope.revision}"`,
  });
  response.end(JSON.stringify(envelope.state));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : null);
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const requestedPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^([/\\])+/, '');
  let filePath = path.resolve(distDir, safePath || 'index.html');
  if (filePath !== distDir && !filePath.startsWith(`${distDir}${path.sep}`)) {
    sendJson(response, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(distDir, 'index.html');
  }

  const extension = path.extname(filePath);
  response.writeHead(200, {
    'content-type': contentTypes.get(extension) || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
}

const store = await createStateStore();

function isValidStatePayload(state) {
  return Boolean(
    state &&
    typeof state === 'object' &&
    Array.isArray(state.players) &&
    Array.isArray(state.characters) &&
    Array.isArray(state.definitions) &&
    Array.isArray(state.affinityDefinitions) &&
    Array.isArray(state.currencyDefinitions) &&
    Array.isArray(state.skillDefinitions) &&
    Array.isArray(state.itemDefinitions),
  );
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

    if (url.pathname === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === '/api/state' && request.method === 'GET') {
      const envelope = await store.getState();
      envelope ? sendState(response, envelope) : sendNoContent(response);
      return;
    }

    if (url.pathname === '/api/state' && request.method === 'PUT') {
      const state = await readJsonBody(request);
      if (!isValidStatePayload(state)) {
        sendJson(response, 400, { error: 'State payload must include all Evolution RPG state arrays.' });
        return;
      }
      const expectedRevision = Number(String(request.headers['if-match'] ?? 0).replaceAll('"', ''));
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        sendJson(response, 400, { error: 'If-Match must be a non-negative integer revision.' });
        return;
      }
      const revision = await store.saveState(state, expectedRevision);
      sendJson(response, 200, { ok: true, revision });
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    if (error instanceof StateConflictError) {
      sendJson(response, 409, { error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Unexpected server error.';
    sendJson(response, 500, { error: message });
  }
});

async function shutdown() {
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

server.listen(port, host, () => {
  console.log(`Evolution RPG server listening on http://${host}:${port}`);
});
