import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { ROLE_SLUGS } from './src/roles/slugs';

/**
 * Vite's default app type is `spa`, so a direct load of `/<slug>` (no trailing
 * slash) falls through to the careers index. Vercel serves `dist/<slug>/index.html`
 * for that URL. Rewrite the known role paths before the static handler so dev
 * and `vite preview` do the same, and use `appType: 'mpa'` so unknown paths 404.
 */
function roleDirectoryUrls(): Plugin {
  const slugs = new Set<string>(ROLE_SLUGS);
  const rewrite = (req: IncomingMessage, _res: ServerResponse, next: () => void) => {
    const raw = req.url ?? '/';
    const queryAt = raw.indexOf('?');
    const path = queryAt === -1 ? raw : raw.slice(0, queryAt);
    const search = queryAt === -1 ? '' : raw.slice(queryAt);
    if (slugs.has(path.slice(1))) req.url = `${path}/${search}`;
    next();
  };
  return {
    name: 'role-directory-urls',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

// `root: pages/` makes each role build to dist/<slug>/index.html with no extra
// path segment. `base: './'` keeps every asset reference relative, so a page
// works at any depth — /hiring/<slug>/ on Pages, or opened straight off disk.
export default defineConfig({
  root: resolve(__dirname, 'pages'),
  base: './',
  appType: 'mpa',
  publicDir: resolve(__dirname, 'public'),
  plugins: [react(), tailwindcss(), roleDirectoryUrls()],
  server: {
    fs: { allow: [resolve(__dirname)] },
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // The careers index, which links out to each role.
        index: resolve(__dirname, 'pages/index.html'),
        ...Object.fromEntries(
          ROLE_SLUGS.map((slug) => [slug, resolve(__dirname, `pages/${slug}/index.html`)]),
        ),
      },
    },
  },
});
