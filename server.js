/*
 * Local static server for the POS. No dependencies.
 *   node server.js            -> http://localhost:6767
 *   PORT=8080 node server.js  -> http://localhost:8080
 *   node server.js 8080       -> same
 * Set HOST=0.0.0.0 to reach it from other devices on the network (e.g. a kitchen tablet).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 6767);
const HOST = process.env.HOST || 'localhost';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch (e) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT + path.sep) || path.basename(file) === 'server.js') {
    res.writeHead(404).end('Not found');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.error('Port ' + PORT + ' is already in use. Try: node server.js 8080');
  else console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('Hill Street Café POS running at http://' + (HOST === '0.0.0.0' ? 'localhost' : HOST) + ':' + PORT);
});
