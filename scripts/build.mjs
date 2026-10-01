import { mkdir, cp, readdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const name of await readdir('.')) {
  if (/\.(html|css|js|txt|ico)$/.test(name) && !['bootstrap.js'].includes(name)) await cp(name, 'dist/' + name);
}
for (const name of ['assets', 'vendor']) {
  try { await cp(name, 'dist/' + name, { recursive: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
console.log('Alvera public files built. Server files and credentials are excluded.');
