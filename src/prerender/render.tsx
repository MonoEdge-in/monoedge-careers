import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { CareersPage } from '../components/CareersPage';
import { RolePage } from '../components/RolePage';
import { ROLES, ROLE_SLUGS, type RoleSlug } from '../roles';

const CANONICAL_ORIGIN = 'https://careers.monoedge.in';

/** Listing page, then each published role URL. */
export function canonicalUrls(): string[] {
  return [CANONICAL_ORIGIN + '/', ...ROLE_SLUGS.map((slug) => `${CANONICAL_ORIGIN}/${slug}/`)];
}

export type PrerenderPage =
  | { kind: 'index' }
  | { kind: 'role'; slug: RoleSlug };

/** Map a source or dist `index.html` path to the page it builds. */
export function pageFor(filename: string): PrerenderPage {
  const normalized = filename.replace(/\\/g, '/');
  for (const slug of ROLE_SLUGS) {
    if (normalized.endsWith(`/${slug}/index.html`)) return { kind: 'role', slug };
  }
  if (normalized.endsWith('/index.html')) return { kind: 'index' };
  throw new Error(`No careers page for ${filename}`);
}

/** Static markup for `#root`. Same components the browser hydrates. */
export function renderBody(filename: string): string {
  const page = pageFor(filename);
  const tree =
    page.kind === 'index' ? (
      <CareersPage />
    ) : (
      <RolePage role={ROLES[page.slug]} />
    );
  return renderToString(<StrictMode>{tree}</StrictMode>);
}
