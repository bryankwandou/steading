/**
 * Local preview of the hosted build.
 *
 * Serves public/ the way Vercel will, including the same security headers declared in
 * vercel.json, so what is verified here is what ships. It does not run the Python
 * functions -- /api/* answers 501 -- which is itself accurate: with no live backend the
 * app must stay fully usable in demo mode, and that is worth being able to test.
 *
 * Run: npm run dev
 */

import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { join, extname, resolve, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 4000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https: data:",
  "media-src 'self'",
  "connect-src 'self'",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "manifest-src 'self'",
].join('; ');

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (pathname.startsWith('/api/')) {
    const body = JSON.stringify({
      code: 'live_unreachable',
      error: 'The Python functions only run on Vercel; use demo mode here.',
      detail: null,
    });
    res.writeHead(501, { 'Content-Type': 'application/json; charset=utf-8' }).end(body);
    return;
  }

  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  if (relative.includes('\0') || relative.split(/[/\\]/).includes('..')) {
    res.writeHead(400).end('Bad request');
    return;
  }

  const base = resolve(PUBLIC_DIR);
  const target = resolve(join(base, relative));
  if (target !== base && !target.startsWith(base + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  let info;
  try {
    const real = await realpath(target);
    if (real !== base && !real.startsWith(base + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    info = await stat(real);
  } catch {
    // Unknown path with no extension -> the shell, so deep links work.
    if (!pathname.includes('.')) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Content-Security-Policy': CSP });
      createReadStream(join(base, 'index.html')).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
    return;
  }
  if (!info.isFile()) {
    res.writeHead(404).end('404');
    return;
  }

  const ext = extname(target).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': info.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  if (ext === '.html') {
    headers['Content-Security-Policy'] = CSP;
    headers['X-Frame-Options'] = 'DENY';
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(target).on('error', () => res.destroy()).pipe(res);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Steading (hosted build preview)  ·  Fast. Seamless. 100% Local.');
  console.log(`  http://127.0.0.1:${PORT}`);
  console.log('  /api/* returns 501 here -- demo mode is the path to exercise.');
  console.log('');
});
