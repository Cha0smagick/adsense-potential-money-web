import { mkdir, writeFile } from 'node:fs/promises';

// Recolector de casos públicos del foro de AdSense. Solo extrae URL del sitio,
// resultado, fecha y enlace a la fuente. No guarda nombres de usuario.

const IDS = [
  422489879, 354663776, 297177296, 352637211, 449905027, 125202531, 438420721, 224284369,
  454368122, 474546329, 429406274, 477013876, 342971349, 370628281, 476912019, 367528535,
  356204531, 26046916, 218764156, 84338409, 332127158, 110904984, 466181250, 477752497,
  402527406, 303284084, 216111749, 422317187, 478073817, 478270391, 362387136, 381161882,
  286160474, 257152258, 157658865, 124333836, 31781154, 150505546,
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const EXCLUDE = [
  'google.com', 'googleapis.com', 'gstatic.com', 'googleusercontent.com', 'withgoogle.com',
  'googleadservices.com', 'googlesyndication.com', 'google-analytics.com', 'doubleclick.net',
  'googletagmanager.com', 'googleoptimize.com', 'fundingchoicesmessages.google.com',
  'adservice.google.com', 'youtube.com', 'youtu.be', 'facebook.com', 'twitter.com', 'x.com',
  'linkedin.com', 'instagram.com', 'schema.org', 'w3.org', 'ggpht.com', 'ytimg.com',
  'support.google.com', 'sites.google.com', 'productexperts.withgoogle.com', 'chrome.google.com',
  'jsdelivr.net', 'bootstrapcdn.com', 'fontawesome.com', 'cloudflare.com', 'wp.com', 'gravatar.com',
  'w.org', 'amazonaws.com', 'cloudfront.net', 'unpkg.com', 'cdnjs.cloudflare.com',
];

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

function decodeHtml(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function outcomeOf(title) {
  const t = title.toLowerCase();
  if (/getting ready|under review|pending|waiting|how long|when will/.test(t)) return 'pending';
  if (/not (been )?approved|rejected|rejection|disapproved|denied|low[- ]value|policy violation|needs attention|isn't ready|not being/.test(t)) return 'rejected';
  if (/approved|approval|ready to show ads|site is ready/.test(t)) return 'approved';
  return 'unknown';
}

function siteUrls(decoded) {
  const out = [];
  for (const m of decoded.matchAll(/https?:\/\/[^\s"'<>\\]+/g)) {
    let url = m[0].replace(/[),.;]+$/g, '');
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (host.includes('google') || host.includes('gstatic') || host.includes('googleapis')) continue;
      if (EXCLUDE.some((d) => host === d || host.endsWith(`.${d}`))) continue;
      if (!/\./.test(host)) continue;
      if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico)$/i.test(url)) continue;
      out.push(url.replace(/\/$/, ''));
    } catch {
      /* no es URL */
    }
  }
  return Array.from(new Set(out)).slice(0, 5);
}

function dateOf(decoded, id) {
  const direct = new RegExp(`\\[${id},"(\\d{14,16})"`).exec(decoded);
  const raw = direct?.[1];
  if (!raw) return null;
  const seconds = Number(raw.slice(0, 10));
  if (!Number.isFinite(seconds) || seconds < 1_500_000_000 || seconds > 2_000_000_000) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

const cases = [];
for (const id of IDS) {
  const url = `https://support.google.com/adsense/thread/${id}?hl=en`;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'en' } });
    const html = await res.text();
    const decoded = decode(html);
    const title = (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '').replace(/\s*-\s*Google AdSense Community\s*$/, '').trim();
    const sites = siteUrls(decoded);
    const outcome = outcomeOf(title);
    const date = dateOf(decoded, id);
    const firstDiv = decoded.indexOf('<div>');
    const text = firstDiv >= 0 ? decodeHtml(decoded.slice(firstDiv, firstDiv + 6000)) : '';
    cases.push({ id, url, title, date, outcome, sites, snippet: text.slice(0, 300) });
    console.log(`${id} | ${outcome} | ${date ?? '—'} | ${sites[0] ?? '—'} | ${title.slice(0, 70)}`);
  } catch (error) {
    console.log(`${id} | ERROR | ${error instanceof Error ? error.message : error}`);
  }
  await new Promise((r) => setTimeout(r, 250));
}

await mkdir('data', { recursive: true });
await writeFile('data/approval-cases.raw.json', JSON.stringify(cases, null, 2), 'utf8');
console.log(`\nCasos guardados: ${cases.length}`);
