/**
 * Injects the listing and each role into the built HTML so a crawler that
 * does not run JavaScript still receives the job content.
 *
 * Vite's root is `pages/`, which cannot SSR-load `src/` cleanly. esbuild
 * bundles the renderer for Node, then this script writes into `dist/`.
 */
import { build } from 'esbuild';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const outfile = join(root, 'node_modules/.prerender/render.js');

mkdirSync(dirname(outfile), { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ['src/prerender/render.tsx'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  outfile,
  // Keep React's own packages external so the server renderer and the
  // client bundle share one implementation.
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  logLevel: 'warning',
});

const { renderBody } = await import(pathToFileURL(outfile).href);

function htmlFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (name === 'index.html') found.push(path);
  }
  return found;
}

const files = htmlFiles(dist);
if (files.length === 0) {
  throw new Error('prerender: dist has no index.html files. Run vite build first.');
}

for (const file of files) {
  const html = readFileSync(file, 'utf8');
  if (!html.includes('<div id="root"></div>')) {
    throw new Error(`prerender: expected an empty #root in ${file}`);
  }
  const body = renderBody(file);
  if (!body.trim()) throw new Error(`prerender: empty render for ${file}`);
  // Function replacer so role text cannot be read as a $ replacement.
  const next = html.replace(/<div id="root"><\/div>/, () => `<div id="root">${body}</div>`);
  writeFileSync(file, next);
  console.log(`prerendered ${file.slice(dist.length)}`);
}
