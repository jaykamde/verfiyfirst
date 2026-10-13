'use strict';
// Local server that mimics Vercel: serves /public and routes /api/* to the handlers.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Minimal .env loader (no dependency).
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.status = (c) => ((res.statusCode = c), res);
    res.json = (o) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(o));
    };

    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
      const file = path.join(__dirname, 'api', name + '.js');
      if (!fs.existsSync(file)) return res.status(404).json({ error: 'not_found' });
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        return res.status(400).json({ error: 'bad_json' });
      }
      req.query = Object.fromEntries(url.searchParams);
      return require(file)(req, res);
    }

    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!path.extname(p)) p += '.html';
    const full = path.join(__dirname, 'public', path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!full.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(full)) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    res.setHeader('Content-Type', MIME[path.extname(full)] || 'application/octet-stream');
    fs.createReadStream(full).pipe(res);
  });
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createServer().listen(port, () => console.log(`Verify First running at http://localhost:${port}`));
}
module.exports = { createServer };
