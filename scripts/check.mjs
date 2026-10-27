/**
 * Re-runnable checks for the careers site. Does not submit an application
 * and does not print the Apps Script URL.
 *
 *   npm run check
 *
 * PDF text needs Python 3 and pypdf (`pip install pypdf`).
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const origin = 'https://careers.monoedge.in';
const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL  ${message}`);
}

function pass(message) {
  console.log(`PASS  ${message}`);
}

function note(message) {
  notes.push(message);
  console.log(`NOTE  ${message}`);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function roleSlugs() {
  const source = read(join(root, 'src/roles/slugs.ts'));
  return [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function htmlContains(html, text) {
  if (html.includes(text)) return true;
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html.includes(escaped);
}

function attr(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : '';
}

function jsonLdBlocks(html) {
  const blocks = [];
  const pattern = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  for (const match of html.matchAll(pattern)) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

function checkPages(slugs) {
  const indexPath = join(dist, 'index.html');
  if (!existsSync(indexPath)) {
    fail('dist/index.html is missing. Run npm run build first.');
    return;
  }

  const indexHtml = read(indexPath);
  checkHead(indexHtml, `${origin}/`, 'listing');
  const indexLd = jsonLdBlocks(indexHtml);
  const org = indexLd.find((block) => block['@type'] === 'Organization');
  if (!org) fail('listing page is missing Organization JSON-LD');
  else if (org.name !== 'Monoedge Systems Private Limited') {
    fail(`listing Organization name is ${JSON.stringify(org.name)}`);
  } else pass('listing Organization JSON-LD');
  if (indexLd.some((block) => block['@type'] === 'JobPosting')) {
    fail('listing page must not carry a JobPosting');
  }
  if (!indexHtml.includes('Eight roles. One plant floor at a time.')) {
    fail('listing HTML is missing the role-count line');
  } else pass('listing HTML contains the role-count line');

  for (const slug of slugs) {
    const file = join(dist, slug, 'index.html');
    if (!existsSync(file)) {
      fail(`missing prerendered page for ${slug}`);
      continue;
    }
    const html = read(file);
    const canonical = `${origin}/${slug}/`;
    checkHead(html, canonical, slug);
    if (!html.includes('src="../config.js"')) fail(`${slug} does not load ../config.js`);
    if (!html.includes('id="fullName"') || !html.includes('type="email"') || !html.includes('id="website"')) {
      fail(`${slug} apply form is missing name, email, or the honeypot`);
    }
    if (!html.includes('Apply for this role')) fail(`${slug} HTML is missing the apply heading`);

    const postings = jsonLdBlocks(html).filter((block) => block['@type'] === 'JobPosting');
    if (postings.length !== 1) {
      fail(`${slug} has ${postings.length} JobPosting blocks`);
      continue;
    }
    checkJobPosting(slug, postings[0], html, canonical);
  }
}

function checkHead(html, canonical, label) {
  const foundCanonical = attr(html, /rel="canonical" href="([^"]+)"/);
  const ogUrl = attr(html, /property="og:url" content="([^"]+)"/);
  const ogTitle = attr(html, /property="og:title" content="([^"]+)"/);
  const ogDescription = attr(html, /property="og:description" content="([^"]+)"/);
  if (foundCanonical !== canonical) fail(`${label} canonical is ${foundCanonical || 'missing'}`);
  if (ogUrl !== canonical) fail(`${label} og:url is ${ogUrl || 'missing'}`);
  if (!ogTitle) fail(`${label} is missing og:title`);
  if (!ogDescription) fail(`${label} is missing og:description`);
  if (foundCanonical === canonical && ogUrl === canonical && ogTitle && ogDescription) {
    pass(`${label} canonical and Open Graph tags`);
  }
}

/**
 * Google's JobPosting required properties: datePosted, description,
 * hiringOrganization, jobLocation (addressCountry), title.
 * validThrough is required only when the posting expires. baseSalary is
 * recommended. Role records contain neither, so those stay omitted.
 * datePosted is required and comes from the role record.
 */
function checkJobPosting(slug, posting, html, canonical) {
  const title = typeof posting.title === 'string' ? posting.title : '';
  const description = typeof posting.description === 'string' ? posting.description : '';
  const orgName = posting.hiringOrganization?.name;
  const country = posting.jobLocation?.address?.addressCountry;

  if (!title) fail(`${slug} JobPosting is missing title`);
  else if (!htmlContains(html, title)) fail(`${slug} HTML does not contain the JobPosting title`);
  else pass(`${slug} HTML contains "${title}"`);

  if (!description.includes('\n')) fail(`${slug} JobPosting description has no paragraph break`);
  else if (description.length < 80) fail(`${slug} JobPosting description is too short`);
  else pass(`${slug} JobPosting description`);

  if (orgName !== 'Monoedge Systems Private Limited') {
    fail(`${slug} hiringOrganization.name is ${JSON.stringify(orgName)}`);
  } else pass(`${slug} hiringOrganization`);

  if (country !== 'IN') fail(`${slug} jobLocation.address.addressCountry is ${JSON.stringify(country)}`);
  else if (posting.jobLocation?.address?.addressLocality !== 'Pune') {
    fail(`${slug} jobLocation is not Pune`);
  } else pass(`${slug} jobLocation`);

  if (posting.url !== canonical) fail(`${slug} JobPosting url is ${posting.url || 'missing'}`);
  if (posting.directApply !== true) fail(`${slug} JobPosting directApply is not true`);

  if (posting.datePosted !== '2026-10-27') {
    fail(`${slug} JobPosting datePosted is ${JSON.stringify(posting.datePosted ?? null)}; expected "2026-10-27"`);
  } else pass(`${slug} JobPosting datePosted`);

  const invented = ['baseSalary', 'salaryCurrency', 'validThrough'].filter((key) =>
    Object.hasOwn(posting, key),
  );
  if (invented.length) fail(`${slug} JobPosting contains ${invented.join(', ')}, which the role records do not provide`);
}

function checkRobotsAndSitemap(slugs) {
  const robots = read(join(dist, 'robots.txt'));
  const sitemap = read(join(dist, 'sitemap.xml'));
  if (!robots.includes('Allow: /')) fail('robots.txt does not allow /');
  if (!robots.includes('Sitemap: https://careers.monoedge.in/sitemap.xml')) {
    fail('robots.txt sitemap URL is wrong');
  } else pass('robots.txt');

  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = [`${origin}/`, ...slugs.map((slug) => `${origin}/${slug}/`)];
  const missing = expected.filter((url) => !locs.includes(url));
  const extra = locs.filter((url) => !expected.includes(url));
  if (missing.length || extra.length || locs.length !== expected.length) {
    fail(`sitemap locs do not match the published pages (missing ${missing.length}, extra ${extra.length})`);
  } else pass(`sitemap matches ${expected.length} published URLs`);
}

function hostMatches(pattern, host) {
  const normalized = host.toLowerCase().replace(/:\d+$/, '');
  return new RegExp(`^${pattern}$`).test(normalized);
}

function checkRedirect() {
  const config = JSON.parse(read(join(root, 'vercel.json')));
  const redirects = config.redirects ?? [];
  if (redirects.length !== 1) {
    fail(`vercel.json has ${redirects.length} redirects; expected the one production-host rule`);
    return;
  }
  const rule = redirects[0];
  const host = rule.has?.find((item) => item.type === 'host')?.value;
  if (rule.source !== '/:path*' || rule.destination !== 'https://careers.monoedge.in/:path*' || rule.permanent !== true) {
    fail('vercel.json redirect source, destination, or permanence changed');
  }
  if (!host) {
    fail('vercel.json host redirect has no host condition');
    return;
  }
  const production = 'monoedge-careers.vercel.app';
  const others = [
    'monoedge-careers-git-seo-visibility-monoedge-org.vercel.app',
    'monoedge-careers-9gnet0vwv-monoedge-org.vercel.app',
    'careers.monoedge.in',
    'not-monoedge-careers.vercel.app',
    'monoedge-careers.vercel.app.evil.example',
    'preview-monoedge-careers.vercel.app',
    'www.monoedge-careers.vercel.app',
  ];
  if (!hostMatches(host, production) || !hostMatches(host, `${production}:443`)) {
    fail('production host monoedge-careers.vercel.app is not matched by the redirect');
  }
  const leaked = others.filter((item) => hostMatches(host, item));
  if (leaked.length) fail(`host redirect also matches ${leaked.join(', ')}`);
  if (hostMatches(host, production) && leaked.length === 0) {
    pass('host redirect matches only monoedge-careers.vercel.app');
  }
}

function checkEndpoint() {
  const config = read(join(root, 'public/config.js'));
  const match = config.match(/ENDPOINT:\s*'([^']*)'/);
  const endpoint = match?.[1] ?? '';
  const looksLikeScript = endpoint.startsWith('https://script.google.com/') && endpoint.endsWith('/exec');
  if (!looksLikeScript) fail('public/config.js ENDPOINT is missing or is not an Apps Script /exec URL');
  else pass('apply endpoint is set (URL not printed)');

}

function builtScriptPostsPlainText() {
  const assets = join(dist, 'assets');
  const files = readdirSync(assets).filter((name) => name.endsWith('.js'));
  const found = files.some((name) => read(join(assets, name)).includes('text/plain;charset=utf-8'));
  if (!found) fail('built JavaScript does not post the application as text/plain');
  else pass('built apply request uses text/plain');
}

const NEW_JDS = [
  {
    file: 'ai-engineer-rag-agentic',
    phrase: 'Retrieval-Augmented Generation',
  },
  {
    file: 'backend-data-platform-engineer',
    phrase: 'Observability',
  },
  {
    file: 'devops-engineer',
    phrase: 'End-to-End System Ownership',
  },
];

const JD_HEADINGS = [
  'About the role',
  'What you will do',
  'Who should apply',
  'Selection process',
  'How to apply',
  'Location',
  'Eligibility',
  'krishna@monoedge.in',
  'does not have a public application page yet',
];

const PAY = /₹|\bLPA\b|\bCTC\b|compensation|\bsalary\b|\bstipend\b|\blakhs?\b|pay range|per annum/i;

function pdfText(label, pdfPath) {
  const extracted = spawnSync(
    'python3',
    [
      '-c',
      [
        'import sys',
        'from pypdf import PdfReader',
        'reader = PdfReader(sys.argv[1])',
        'if len(reader.pages) < 1: raise SystemExit("PDF has no pages")',
        'print("\\n".join((page.extract_text() or "") for page in reader.pages))',
      ].join('\n'),
      pdfPath,
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  if (extracted.status !== 0) {
    fail(`${label} did not open (${extracted.stderr.trim() || 'pypdf error'})`);
    return null;
  }
  if (!extracted.stdout.trim()) {
    fail(`${label} opened but no text could be extracted`);
    return null;
  }
  return extracted.stdout;
}

function checkJobDescriptions() {
  const python = spawnSync('python3', ['-c', 'import pypdf'], { encoding: 'utf8' });
  if (python.status !== 0) {
    fail('Python pypdf is not installed (pip install pypdf). PDF text was not checked.');
    return;
  }

  const jdDir = join(root, 'jd');
  const markdownNames = readdirSync(jdDir).filter((name) => name.endsWith('.md')).sort();
  const pdfNames = readdirSync(join(jdDir, 'pdf')).filter((name) => name.endsWith('.pdf')).sort();
  if (markdownNames.length === 0 || pdfNames.length === 0) {
    fail('jd/ has no markdown or PDF job descriptions to scan for pay text');
  }

  for (const jd of NEW_JDS) {
    const markdown = read(join(jdDir, `${jd.file}.md`));
    checkJdText(`${jd.file}.md`, markdown, jd.phrase);
    const text = pdfText(`${jd.file}.pdf`, join(jdDir, 'pdf', `${jd.file}.pdf`));
    if (text === null) continue;
    checkJdText(`${jd.file}.pdf`, text, jd.phrase);
    pass(`${jd.file}.pdf opens (${text.length} chars)`);
  }

  const covered = new Set(NEW_JDS.flatMap((jd) => [`${jd.file}.md`, `${jd.file}.pdf`]));
  for (const name of markdownNames) {
    if (covered.has(name)) continue;
    assertNoPay(`jd/${name}`, read(join(jdDir, name)));
  }
  for (const name of pdfNames) {
    if (covered.has(name)) continue;
    const text = pdfText(`jd/pdf/${name}`, join(jdDir, 'pdf', name));
    if (text === null) continue;
    assertNoPay(`jd/pdf/${name}`, text);
  }
}

function assertNoPay(label, text) {
  const pay = flat(text).match(PAY);
  if (pay) fail(`${label} contains pay text (${pay[0]})`);
  else pass(`${label} has no pay text`);
}

function flat(text) {
  return text.replace(/\s+/g, ' ');
}

function checkJdText(label, text, phrase) {
  const normalized = flat(text);
  const missing = JD_HEADINGS.filter((heading) => !normalized.includes(heading));
  if (missing.length) fail(`${label} is missing ${missing.join(', ')}`);
  if (!normalized.includes(phrase)) fail(`${label} is missing "${phrase}"`);
  const pay = normalized.match(PAY);
  if (pay) fail(`${label} contains pay text (${pay[0]})`);
  if (/https?:\/\//.test(normalized)) fail(`${label} contains an http link`);
  if (!missing.length && normalized.includes(phrase) && !pay && !/https?:\/\//.test(normalized)) {
    pass(`${label} has no pay text`);
  }
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

function fetchUrl(url) {
  return new Promise((resolveResponse, reject) => {
    const request = http.get(url, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolveResponse({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    request.setTimeout(8000, () => {
      request.destroy(new Error(`timed out fetching ${url}`));
    });
    request.on('error', reject);
  });
}

async function waitForServer(port) {
  const deadline = Date.now() + 20000;
  let lastError = 'server did not start';
  while (Date.now() < deadline) {
    try {
      const response = await fetchUrl(`http://127.0.0.1:${port}/`);
      if (response.status === 200) return;
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(lastError);
}

function pageTitle(html) {
  return attr(html, /<title>([^<]*)<\/title>/);
}

async function checkPreview(slugs) {
  const port = await freePort();
  const viteBin = join(root, 'node_modules/vite/bin/vite.js');
  const child = spawn(process.execPath, [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  try {
    await waitForServer(port);
    const base = `http://127.0.0.1:${port}`;
    const index = await fetchUrl(`${base}/`);
    const indexTitle = pageTitle(index.body);
    if (index.status !== 200 || indexTitle !== 'Careers · MonoEdge') {
      fail(`preview / returned ${index.status} ${indexTitle || 'without the listing title'}`);
    } else pass('preview / is the listing');

    for (const slug of slugs) {
      const expected = pageTitle(read(join(dist, slug, 'index.html')));
      for (const path of [`/${slug}/`, `/${slug}`, `/${slug}?check=1`]) {
        const response = await fetchUrl(`${base}${path}`);
        const title = pageTitle(response.body);
        if (response.status !== 200 || title !== expected || title === indexTitle) {
          fail(`preview ${path} returned ${response.status} ${title || 'without a title'}`);
        }
      }
      pass(`preview /${slug} and /${slug}/ serve ${expected}`);
    }

    for (const path of ['/nope', '/nope/']) {
      const response = await fetchUrl(`${base}${path}`);
      if (response.status !== 404) fail(`preview ${path} returned ${response.status}, expected 404`);
      else pass(`preview ${path} is 404`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`vite preview did not serve the build (${message})`);
    if (logs.trim()) console.error(logs.trim().slice(0, 800));
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolveWait) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolveWait();
      }, 2000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolveWait();
      });
    });
  }
}

const slugs = roleSlugs();
if (slugs.length !== 8) fail(`expected 8 role slugs, found ${slugs.length}`);

checkPages(slugs);
note('validThrough is omitted on every role. Google requires it only when a posting expires, and these records have none.');
checkRobotsAndSitemap(slugs);
checkRedirect();
checkEndpoint();
builtScriptPostsPlainText();
checkJobDescriptions();
await checkPreview(slugs);

console.log('');
if (failures.length) {
  console.error(`${failures.length} failed.`);
  process.exit(1);
}
console.log('All checks passed.');
