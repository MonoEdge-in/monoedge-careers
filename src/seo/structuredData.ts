import type { Role } from '../roles';

const COMPANY = 'Monoedge Systems Private Limited';
const COMPANY_SITE = 'https://www.monoedge.in';

/**
 * Fields come from the role records. Salary, datePosted, and validThrough are
 * omitted: those records do not contain them.
 */
export function organizationLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: COMPANY,
    url: COMPANY_SITE,
    sameAs: COMPANY_SITE,
  };
}

export function jobDescription(role: Role): string {
  const parts: string[] = [role.summary];
  for (const section of role.sections) {
    parts.push(section.heading);
    if (section.kind === 'prose') {
      parts.push(...section.body);
    } else {
      for (const item of section.body) {
        parts.push(`${item.lead ? `${item.lead} ` : ''}${item.text}`.trim());
      }
    }
  }
  return parts.join('\n\n');
}

export function jobPostingLd(role: Role) {
  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: role.title,
    description: jobDescription(role),
    url: `https://careers.monoedge.in/${role.slug}/`,
    directApply: true,
    identifier: {
      '@type': 'PropertyValue',
      name: COMPANY,
      value: role.id,
    },
    hiringOrganization: {
      '@type': 'Organization',
      name: COMPANY,
      url: COMPANY_SITE,
      sameAs: COMPANY_SITE,
    },
  };

  if (role.employment.startsWith('Full-time')) posting.employmentType = 'FULL_TIME';

  if (role.location.includes('Pune')) {
    const address: Record<string, string> = {
      '@type': 'PostalAddress',
      addressLocality: 'Pune',
      addressCountry: 'IN',
    };
    if (role.location.includes('Maharashtra')) address.addressRegion = 'Maharashtra';
    posting.jobLocation = { '@type': 'Place', address };
  }

  return posting;
}

export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}
