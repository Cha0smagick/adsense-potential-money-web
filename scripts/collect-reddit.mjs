import { mkdir, writeFile } from 'node:fs/promises';

// Archivo público de Reddit (Arctic Shift) para r/Adsense. Sin login ni scraping
// de la web de Reddit. Guarda solo título, fecha, texto y URL del sitio; sin autores.

const BASE = 'https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=Adsense&limit=100&sort=desc';
const UA = 'AdeptusResearch/1.0 (contact: magiadelcaospractica@gmail.com)';
const PAGES = 60;

const EXCLUDE = ['reddit.com','redd.it','redditmedia.com','redditstatic.com','imgur.com','i.imgur.com','preview.redd.it','youtube.com','youtu.be','google.com','googleapis.com','gstatic.com','googleusercontent.com','facebook.com','twitter.com','x.com','linkedin.com','instagram.com','tiktok.com','discord.gg','discord.com','medium.com','github.com','w3.org','schema.org','gmail.com','example.com','domain.com'];
const TLDS = new Set(['com','net','org','io','co','es','me','app','dev','xyz','info','online','site','store','tech','ai','us','uk','de','fr','it','br','mx','ar','cl','pe','ec','ve','uy','py','bo','cr','pa','do','gt','pt','nl','be','ch','at','se','no','dk','fi','pl','cz','gr','tr','ru','ua','jp','kr','cn','in','id','ph','my','sg','au','nz','ca','za','ie','blog','shop','pro','biz','tv','cc','ly','to','gg','fm','is','name','digital','agency','studio','design','media','news','world','life','live','space','website','press','rocks','today','tips','guide','review','reviews','email','solutions','services','consulting','academy','school','travel','tours','hotel','restaurant','cafe','bar','pizza','fitness','health','clinic','dental','law','legal','finance','money','capital','invest','insurance','realestate','properties','homes','land','farm','garden','art','photo','photography','video','music','games','gaming','sports','football','soccer','basketball','tennis','golf','yoga','beauty','fashion','style','shoes','jewelry','watches','cars','auto','motorcycles','bike','tools','equipment','parts','supply','construction','plumbing','electric','solar','energy','green','eco','water','food','recipes','kitchen','coffee','tea','wine','beer','pets','dog','cat','baby','kids','toys','books','ebooks','author','writing','magazine','journal']);

function keepHost(host){if(!host||!host.includes('.'))return false;const tld=host.split('.').pop()??'';if(!TLDS.has(tld))return false;if(host.includes('google')||host.includes('gstatic'))return false;return !EXCLUDE.some(d=>host===d||host.endsWith('.'+d))}
function sitesOf(title, selftext, url) {
  const text = `${title}\n${selftext}\n${url ?? ''}`;
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)"'<>\\]+/g)) {
    const u = m[0].replace(/[),.;]+$/g, '');
    try { const h = new URL(u).hostname.toLowerCase(); if (keepHost(h)) out.push(u.replace(/\/$/,'')); } catch {}
  }
  for (const m of text.matchAll(/\b((?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,})\b/gi)) {
    const h = m[1].toLowerCase(); if (keepHost(h)) out.push(`https://${h}`);
  }
  return Array.from(new Set(out)).slice(0, 4);
}

function outcomeOf(title, selftext) {
  const t = `${title} ${String(selftext).slice(0, 1200)}`.toLowerCase();
  const approvedFinal = /(finally|just|got|been|was|is)\s+approved|approval (was )?(granted|received)|approved after|approved in \d+/.test(t);
  if (/not approved|rejected|rejection|disapproved|denied|refused|declined|low[- ]value|policy violation|needs attention/.test(t)) {
    if (approvedFinal && /(but|then|after|finally|now)\b/.test(t)) return 'approved';
    return 'rejected';
  }
  if (/approved|approval|accepted|ready to show ads|site is ready/.test(t)) return 'approved';
  if (/waiting|under review|getting ready|pending|how long|when will|chances/.test(t)) return 'pending';
  return 'unknown';
}

function relevant(title, selftext) {
  const t = `${title} ${String(selftext).slice(0, 500)}`.toLowerCase();
  if (/youtube|channel|shorts|payment|pin|tax|bank|identity verification|adsense account/.test(t)) return false;
  return /site|website|blog|domain|url|approved|rejected|approval|disapprov|low[- ]value|policy|adsense/.test(t);
}

await mkdir('data/raw', { recursive: true });

const all = [];
const cases = [];
const seen = new Set();
let url = BASE;
for (let page = 0; page < PAGES; page++) {
  let data = null;
  for (let attempt = 0; attempt < 3 && !data; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      data = json.data;
    } catch (error) {
      console.log(`page ${page + 1}: retry ${attempt + 1} (${error instanceof Error ? error.message : error})`);
      await new Promise((r) => setTimeout(r, 8000));
    }
  }
  if (!data || !data.length) break;
  let added = 0;
  for (const p of data) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const rec = { id: p.id, title: p.title ?? '', created: p.created_utc ?? null, selftext: String(p.selftext ?? '').slice(0, 6000), url: p.url ?? '', permalink: p.permalink ?? '' };
    all.push(rec);
    if (!relevant(rec.title, rec.selftext)) continue;
    const outcome = outcomeOf(rec.title, rec.selftext);
    if (outcome === 'unknown') continue;
    const sites = sitesOf(rec.title, rec.selftext, rec.url);
    if (!sites.length) continue;
    cases.push({ ...rec, outcome, sites, source: rec.permalink ? `https://www.reddit.com${rec.permalink}` : '' });
    added++;
  }
  const oldest = Math.min(...data.map((p) => p.created_utc).filter(Boolean));
  console.log(`page ${page + 1}: posts=${data.length} nuevos=${added} total=${all.length} casos=${cases.length} oldest=${oldest}`);
  await writeFile('data/raw/reddit-posts.json', JSON.stringify(all, null, 2), 'utf8');
  await writeFile('data/raw/reddit-cases.json', JSON.stringify(cases, null, 2), 'utf8');
  if (!Number.isFinite(oldest)) break;
  url = `${BASE}&before=${oldest}`;
  await new Promise((r) => setTimeout(r, 2000));
}

console.log(`FIN posts=${all.length} casos=${cases.length}`);
const byOutcome = cases.reduce((acc, c) => ({ ...acc, [c.outcome]: (acc[c.outcome] ?? 0) + 1 }), {});
console.log(byOutcome);
console.log(cases.slice(0, 15).map((c) => `${c.outcome} | ${c.sites[0]} | ${c.title.slice(0, 70)}`).join('\n'));
