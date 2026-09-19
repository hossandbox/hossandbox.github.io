// Tiny static server for the HOS Sandbox PWA. Reachable only inside the container
// and over Tailscale (this VPS has no public IP besides the Hermes dashboard route).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('./dist/', import.meta.url).pathname;
const PORT = Number(process.env.PORT || 8776);
const HOST = process.env.HOST || '0.0.0.0';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.map': 'application/json' };

createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    let s; try { s = await stat(file); } catch { s = null; }
    if (!(s && s.isFile()) && extname(p)) { res.writeHead(404); return res.end('not found'); } // assets must exist
    const target = s && s.isFile() ? file : join(ROOT, 'index.html'); // SPA fallback for routes only
    const body = await readFile(target);
    const type = TYPES[extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': target.endsWith('index.html') || target.endsWith('sw.js') ? 'no-cache' : 'public, max-age=300' });
    res.end(body);
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(PORT, HOST, () => console.log(`HOS Sandbox on http://${HOST}:${PORT}`));
