import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { CareersPage } from '../components/CareersPage';
import { RolePage } from '../components/RolePage';
import { ROLES, ROLE_SLUGS, type RoleSlug } from '../roles';
import { jobPostingLd, jsonLdScript, organizationLd } from '../seo/structuredData';

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

export function canonicalFor(filename: string): string {
  const page = pageFor(filename);
  return page.kind === 'index' ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}/${page.slug}/`;
}

/** Text that must survive in the raw HTML for this page. */
export function requiredVisibleText(filename: string): string[] {
  const page = pageFor(filename);
  if (page.kind === 'index') return ['Eight roles. One plant floor at a time.'];
  const role = ROLES[page.slug];
  return [role.title, role.sections[0]?.heading ?? role.summary];
}

export function structuredDataScript(filename: string): string {
  const page = pageFor(filename);
  if (page.kind === 'index') return jsonLdScript(organizationLd());
  return jsonLdScript(jobPostingLd(ROLES[page.slug]));
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
