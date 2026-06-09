import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(frontendDir, '..');
const distDir = path.join(frontendDir, 'dist');
const imagesDir = path.join(repoRoot, 'images');
const port = Number(process.env.E2E_BACKEND_PORT || 3100);

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.map': 'application/json; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function serveFile(req, reqPath, root, res) {
  const decoded = decodeURIComponent(reqPath);
  const target = path.resolve(root, decoded.replace(/^\/+/, ''));
  if (!isInside(path.resolve(root), target)) {
    send(res, 403, 'Forbidden');
    return;
  }
  fs.stat(target, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      send(res, 404, 'Not found');
      return;
    }
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Length': String(stats.size),
      'Content-Type': contentTypes[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    };
    if (req.method === 'HEAD') {
      send(res, 200, '', headers);
      return;
    }
    res.writeHead(200, headers);
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1:' + port);
  if (url.pathname === '/health') {
    send(res, 200, 'ok', { 'Content-Type': 'text/plain; charset=utf-8' });
    return;
  }
  if (url.pathname.startsWith('/api/w/')) {
    serveFile(req, url.pathname.slice('/api/w/'.length), distDir, res);
    return;
  }
  if (url.pathname.startsWith('/api/images/')) {
    serveFile(req, url.pathname.slice('/api/images/'.length), imagesDir, res);
    return;
  }
  if (url.pathname.startsWith('/images/')) {
    serveFile(req, url.pathname.slice('/images/'.length), imagesDir, res);
    return;
  }
  if (url.pathname === '/favicon.ico') {
    send(res, 204, '');
    return;
  }
  send(res, 404, 'Not found');
});

server.listen(port, '127.0.0.1', () => {
  console.log('E2E static server listening on http://127.0.0.1:' + port);
});
