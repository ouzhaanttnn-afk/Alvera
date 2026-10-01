import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
process.env.ALPERA_LOCAL_STORAGE = '1';
const root = process.cwd();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.txt': 'text/plain' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.status = code => { res.statusCode = code; return res; };
    res.json = data => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    res.send = data => res.end(data);
    if (url.pathname.startsWith('/api/') || url.pathname === '/sitemap.xml') {
      const route = url.pathname === '/sitemap.xml' ? 'sitemap' : url.pathname.slice(5);
      if (!['manage', 'catalog', 'prices', 'sitemap'].includes(route)) { res.statusCode = 404; return res.end(); }
      req.query = Object.fromEntries(url.searchParams);
      let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 3500000) { res.statusCode = 413; return res.end(); } }
      if (body) { try { req.body = JSON.parse(body); } catch { res.statusCode = 400; return res.json({ error: 'Geçersiz JSON' }); } }
      return (await import('../api/' + route + '.js')).default(req, res);
    }
    let name = decodeURIComponent(url.pathname);
    if (name === '/') name = '/index.html';
    if (name === '/admin' || name === '/admin/') name = '/admin.html';
    const media = name.startsWith('/local-media/');
    const directory = media ? resolve(root, '.local-data', 'media') : root;
    const path = resolve(directory, '.' + (media ? name.slice('/local-media'.length) : name));
    if (!path.startsWith(directory + sep) || /(?:^|[\\/])(?:lib|scripts|node_modules|api|\.local-data|\.env)/.test(media ? '' : name)) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store'); res.end(await readFile(path));
  } catch { if (!res.headersSent) res.statusCode = 404; res.end(); }
}).listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('Alvera: http://localhost:' + (process.env.PORT || 4173)));
