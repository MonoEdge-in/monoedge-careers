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

const { renderBody, canonicalUrls, canonicalFor, requiredVisibleText, structuredDataScript } =
  await import(pathToFileURL(outfile).href);

const sitemap = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
const robots = readFileSync(join(root, 'public/robots.txt'), 'utf8');
if (!robots.includes('Sitemap: https://careers.monoedge.in/sitemap.xml')) {
  throw new Error('robots.txt is missing the careers sitemap URL');
}
for (const url of canonicalUrls()) {
  if (!sitemap.includes(`<loc>${url}</loc>`)) {
    throw new Error(`sitemap.xml is missing ${url}`);
  }
}

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
  const ld = structuredDataScript(file);
  if (/baseSalary|validThrough|salaryCurrency/.test(ld)) {
    throw new Error(`prerender: structured data invented a pay or expiry field for ${file}`);
  }
  // Function replacer so role text cannot be read as a $ replacement.
  let next = html.replace(/<div id="root"><\/div>/, () => `<div id="root">${body}</div>`);
  next = next.replace('</head>', () => `    ${ld}\n  </head>`);
  const canonical = canonicalFor(file);
  if (!next.includes(`rel="canonical" href="${canonical}"`)) {
    throw new Error(`prerender: missing canonical ${canonical} in ${file}`);
  }
  if (!next.includes(`property="og:url" content="${canonical}"`)) {
    throw new Error(`prerender: missing og:url ${canonical} in ${file}`);
  }
  if (!next.includes('property="og:title"') || !next.includes('property="og:description"')) {
    throw new Error(`prerender: missing Open Graph title or description in ${file}`);
  }
  for (const text of requiredVisibleText(file)) {
    if (!next.includes(text)) throw new Error(`prerender: "${text}" missing from ${file}`);
  }
  const isIndex = file.endsWith('/index.html') && canonical.endsWith('careers.monoedge.in/');
  if (isIndex) {
    if (!ld.includes('"@type":"Organization"')) throw new Error('listing page is missing Organization JSON-LD');
    if (ld.includes('JobPosting')) throw new Error('listing page must not carry a JobPosting');
  } else if (!ld.includes('"@type":"JobPosting"') || !ld.includes('Monoedge Systems Private Limited')) {
    throw new Error(`prerender: role page missing JobPosting JSON-LD in ${file}`);
  } else if (!/"datePosted":"\d{4}-\d{2}-\d{2}"/.test(ld)) {
    throw new Error(`prerender: role page missing datePosted in ${file}`);
  }
  writeFileSync(file, next);
  console.log(`prerendered ${file.slice(dist.length)}`);
}
