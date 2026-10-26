import { StrictMode, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { RolePage } from '../components/RolePage';
import { CareersPage } from '../components/CareersPage';
import { ROLES } from '../roles';
import type { RoleSlug } from '../roles';
import '../styles.css';

function render(node: ReactNode) {
  const container = document.getElementById('root');
  if (!container) throw new Error('Missing #root');
  const tree = <StrictMode>{node}</StrictMode>;
  // Build output already contains the page. Hydrate it so crawlers and
  // no-JavaScript visitors keep the same document the client takes over.
  if (container.childElementCount > 0) {
    hydrateRoot(container, tree);
    return;
  }
  createRoot(container).render(tree);
}

export function mount(slug: RoleSlug) {
  render(<RolePage role={ROLES[slug]} />);
}

export function mountCareers() {
  render(<CareersPage />);
}
