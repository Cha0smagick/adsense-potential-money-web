import { mkdir, writeFile } from 'node:fs/promises';

// Recolector del foro oficial de AdSense (Site Approvals) con paginación por token.
// Solo guarda id, título, URL del sitio y fuente. Sin nombres de usuario.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const BASE = 'https://support.google.com/adsense/threads?hl=en&thread_filter=%28category%3Asite_approvals%29';
const MAX_PAGES = 18;
const MAX_THREADS = 140;

const EXCLUDE = [
  'google.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com', 'withgoogle.com',
  'googleadservices.com', 'googlesyndication.com', 'google-analytics.com', 'doubleclick.net',
  'googletagmanager.com', 'googleoptimize.com', 'fundingchoicesmessages.google.com',
  'adservice.google.com', 'youtube.com', 'youtu.be', 'facebook.com', 'twitter.com', 'x.com',
  'linkedin.com', 'instagram.com', 'schema.org', 'w3.org', 'ggpht.com', 'ytimg.com',
  'support.google.com', 'sites.google.com', 'productexperts.withgoogle.com', 'chrome.google.com',
  'jsdelivr.net', 'bootstrapcdn.com', 'fontawesome.com', 'cloudflare.com', 'wp.com', 'gravatar.com',
  'w.org', 'amazonaws.com', 'cloudfront.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  'lumendatabase.org', 'safe-base-for-parsing.invalid', 'ontarioconstructionnews.com',
  'thetoymanswife.ca', 'example.com', 'domain.com', 'email.com', 'gmail.com',
];

const TLDS = new Set([
  'com', 'net', 'org', 'io', 'co', 'es', 'me', 'app', 'dev', 'xyz', 'info', 'online', 'site',
  'store', 'tech', 'ai', 'us', 'uk', 'de', 'fr', 'it', 'br', 'mx', 'ar', 'cl', 'pe', 'ec',
  've', 'uy', 'py', 'bo', 'cr', 'pa', 'do', 'gt', 'pt', 'nl', 'be', 'ch', 'at', 'se', 'no',
  'dk', 'fi', 'pl', 'cz', 'gr', 'tr', 'ru', 'ua', 'jp', 'kr', 'cn', 'in', 'id', 'ph', 'my',
  'sg', 'au', 'nz', 'ca', 'za', 'ie', 'blog', 'shop', 'pro', 'biz', 'tv', 'cc', 'ly', 'to',
  'gg', 'fm', 'is', 'name', 'digital', 'agency', 'studio', 'design', 'media', 'news', 'world',
  'life', 'live', 'space', 'website', 'press', 'rocks', 'today', 'tips', 'guide', 'review',
  'reviews', 'email', 'solutions', 'services', 'consulting', 'academy', 'school', 'travel',
  'tours', 'hotel', 'restaurant', 'cafe', 'bar', 'pizza', 'fitness', 'health', 'clinic',
  'dental', 'law', 'legal', 'finance', 'money', 'capital', 'invest', 'insurance', 'realestate',
  'properties', 'homes', 'land', 'farm', 'garden', 'art', 'photo', 'photography', 'video',
  'music', 'games', 'gaming', 'sports', 'football', 'soccer', 'basketball', 'tennis', 'golf',
  'yoga', 'beauty', 'fashion', 'style', 'shoes', 'jewelry', 'watches', 'cars', 'auto',
  'motorcycles', 'bike', 'tools', 'equipment', 'parts', 'supply', 'construction', 'plumbing',
  'electric', 'solar', 'energy', 'green', 'eco', 'water', 'food', 'recipes', 'kitchen',
  'coffee', 'tea', 'wine', 'beer', 'pets', 'dog', 'cat', 'baby', 'kids', 'toys', 'books',
  'ebooks', 'author', 'writing', 'magazine', 'journal',
]);

function decode(s) {
  return s
    .replace(/\\x22/g, '"')
    .replace(/\\x27/g, "'")
    .replace(/\\x3d/g, '=')
    .replace(/\\x3c/g, '<')
    .replace(/\\x3e/g, '>')
    .replace(/\\x26/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/')
    .replace(/\\\\/g, '\\');
}

function outcomeOf(title) {
  const t = title.toLowerCase();
  if (/getting ready|under review|pending|waiting|how long|when will/.test(t)) return 'pending';
  if (/not (been )?approved|rejected|rejection|disapproved|denied|low[- ]value|policy violation|needs attention|isn't ready|not being/.test(t)) return 'rejected';
  if (/approved|approval|ready to show ads|site is ready/.test(t)) return 'approved';
  return 'unknown';
}

function isSiteTitle(title) {
  const t = title.toLowerCase();
  if (/youtube|channel|shorts|payment|pin|tax|address|bank|identity|verification|adsense account/.test(t)) return false;
  return /site|website|blog|domain|url|approved|rejected|approval|disapprov|low[- ]value|policy|adsense/.test(t);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function keepHost(host) {
  if (!host || !host.includes('.')) return false;
  const tld = host.split('.').pop() ?? '';
  if (!TLDS.has(tld)) return false;
  if (host.includes('google') || host.includes('gstatic')) return false;
  if (host.includes('getelementbyid') || host.includes('capturestacktrace')) return false;
  return !EXCLUDE.some((d) => host === d || host.endsWith(`.${d}`));
}

function siteUrls(text) {
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>\\]+/g)) {
    const url = m[0].replace(/[),.;]+$/g, '');
    const host = hostOf(url);
    if (!keepHost(host)) continue;
    if (/[*{}^$]/.test(url)) continue;
    if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico)$/i.test(url)) continue;
    out.push(url.replace(/\/$/, ''));
  }
  for (const m of text.matchAll(/\b((?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,})\b/gi)) {
    const host = m[1].toLowerCase();
    if (!keepHost(host)) continue;
    out.push(`https://${host}`);
  }
  return Array.from(new Set(out)).slice(0, 4);
}

async function pool(items, concurrency, worker) {
  const out = [];
  let index = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const i = index++;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

await mkdir('data/raw', { recursive: true });

// 1) Listado paginado por token
const listing = new Map();
let url = BASE;
for (let page = 0; page < MAX_PAGES; page++) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en' } });
  const html = await res.text();
  const blocks = html.split('<a ').filter((b) => b.includes('/adsense/thread/'));
  let added = 0;
  for (const block of blocks) {
    const id = /\/adsense\/thread\/(\d+)/.exec(block)?.[1];
    const title = /title="([^"]*)"/.exec(block)?.[1];
    if (!id || !title) continue;
    if (listing.has(id)) continue;
    listing.set(id, { id, title: title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() });
    added++;
  }
  const token = /data-thread-list-pagination-token="([^"]+)"/.exec(html)?.[1];
  console.log(`page ${page + 1}: +${added} (total ${listing.size}) token=${token ? 'sí' : 'no'}`);
  if (!token || !added) break;
  url = `${BASE}&paginationToken=${token}`;
  await new Promise((r) => setTimeout(r, 250));
}

const all = Array.from(listing.values());
const selected = all.filter((t) => isSiteTitle(t.title) && outcomeOf(t.title) !== 'unknown').slice(0, MAX_THREADS);
console.log(`Hilos listados: ${all.length}; seleccionados: ${selected.length}`);

// 2) Detalle
const cases = await pool(selected, 4, async (t) => {
  const threadUrl = `https://support.google.com/adsense/thread/${t.id}?hl=en`;
  try {
    const res = await fetch(threadUrl, { headers: { 'user-agent': UA, 'accept-language': 'en' } });
    const html = await res.text();
    const decoded = decode(html);
    const title = (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? t.title).replace(/\s*-\s*Google AdSense Community\s*$/, '').trim();
    const idIndex = decoded.indexOf(String(t.id));
    const slice = idIndex >= 0 ? decoded.slice(idIndex, idIndex + 14000) : decoded;
    const sites = siteUrls(slice).length ? siteUrls(slice) : siteUrls(title);
    return { id: t.id, url: threadUrl, title, date: null, outcome: outcomeOf(title), sites };
  } catch (error) {
    return { id: t.id, url: threadUrl, title: t.title, date: null, outcome: outcomeOf(t.title), sites: [], error: String(error) };
  }
});

const withSites = cases.filter((c) => c.sites.length > 0);
await writeFile('data/raw/forum-listing.json', JSON.stringify(all, null, 2), 'utf8');
await writeFile('data/raw/forum-cases.json', JSON.stringify(withSites, null, 2), 'utf8');
console.log(`Casos con URL: ${withSites.length} / ${cases.length}`);
console.log(withSites.slice(0, 40).map((c) => `${c.outcome} | ${c.sites[0]} | ${c.title.slice(0, 60)}`).join('\n'));
