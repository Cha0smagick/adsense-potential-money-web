import { mkdir, writeFile } from 'node:fs/promises';

// Histórico del foro de AdSense: capturas Wayback del listado + hilos vivos.
// Solo guarda URL del sitio, resultado y fuente. Sin datos de usuarios.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const MAX_THREADS = 180;

const EXCLUDE = ['google.com','googleapis.com','gstatic.com','googleusercontent.com','withgoogle.com','googleadservices.com','googlesyndication.com','google-analytics.com','doubleclick.net','googletagmanager.com','googleoptimize.com','fundingchoicesmessages.google.com','adservice.google.com','youtube.com','youtu.be','facebook.com','twitter.com','x.com','linkedin.com','instagram.com','schema.org','w3.org','ggpht.com','ytimg.com','support.google.com','sites.google.com','productexperts.withgoogle.com','chrome.google.com','jsdelivr.net','bootstrapcdn.com','fontawesome.com','cloudflare.com','wp.com','gravatar.com','w.org','amazonaws.com','cloudfront.net','unpkg.com','cdnjs.cloudflare.com','lumendatabase.org','ontarioconstructionnews.com','thetoymanswife.ca','example.com','domain.com','object.is','array.is','number.is','a.my'];
const TLDS = new Set(['com','net','org','io','co','es','me','app','dev','xyz','info','online','site','store','tech','ai','us','uk','de','fr','it','br','mx','ar','cl','pe','ec','ve','uy','py','bo','cr','pa','do','gt','pt','nl','be','ch','at','se','no','dk','fi','pl','cz','gr','tr','ru','ua','jp','kr','cn','in','id','ph','my','sg','au','nz','ca','za','ie','blog','shop','pro','biz','tv','cc','ly','to','gg','fm','is','name','digital','agency','studio','design','media','news','world','life','live','space','website','press','rocks','today','tips','guide','review','reviews','email','solutions','services','consulting','academy','school','travel','tours','hotel','restaurant','cafe','bar','pizza','fitness','health','clinic','dental','law','legal','finance','money','capital','invest','insurance','realestate','properties','homes','land','farm','garden','art','photo','photography','video','music','games','gaming','sports','football','soccer','basketball','tennis','golf','yoga','beauty','fashion','style','shoes','jewelry','watches','cars','auto','motorcycles','bike','tools','equipment','parts','supply','construction','plumbing','electric','solar','energy','green','eco','water','food','recipes','kitchen','coffee','tea','wine','beer','pets','dog','cat','baby','kids','toys','books','ebooks','author','writing','magazine','journal']);

function decode(s){return s.replace(/\\x22/g,'"').replace(/\\x27/g,"'").replace(/\\x3d/g,'=').replace(/\\x3c/g,'<').replace(/\\x3e/g,'>').replace(/\\x26/g,'&').replace(/\\u003c/g,'<').replace(/\\u003e/g,'>').replace(/\\u0026/g,'&').replace(/\\\//g,'/').replace(/\\\\/g,'\\')}
function outcomeOf(title){const t=title.toLowerCase();if(/getting ready|under review|pending|waiting|how long|when will/.test(t))return 'pending';if(/not (been |getting )?approved|rejected|rejection|disapproved|denied|low[- ]value|policy violation|needs attention|isn't ready|not being/.test(t))return 'rejected';if(/approved|approval|ready to show ads|site is ready/.test(t))return 'approved';return 'unknown'}
function isSiteTitle(title){const t=title.toLowerCase();if(/youtube|channel|shorts|payment|pin|tax|address|bank|identity|verification|adsense account/.test(t))return false;return /site|website|blog|domain|url|approved|rejected|approval|disapprov|low[- ]value|policy|adsense/.test(t)}
function hostOf(url){try{return new URL(url).hostname.toLowerCase()}catch{return ''}}
function keepHost(host){if(!host||!host.includes('.'))return false;const tld=host.split('.').pop()??'';if(!TLDS.has(tld))return false;if(host.includes('google')||host.includes('gstatic'))return false;if(host==='a.my')return false;return !EXCLUDE.some(d=>host===d||host.endsWith('.'+d))}
function siteUrls(text){const out=[];for(const m of text.matchAll(/https?:\/\/[^\s"'<>\\]+/g)){const url=m[0].replace(/[),.;]+$/g,'');const host=hostOf(url);if(!keepHost(host))continue;if(/[*{}^$]/.test(url))continue;if(/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico)$/i.test(url))continue;out.push(url.replace(/\/$/,''))}for(const m of text.matchAll(/\b((?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,})\b/gi)){const host=m[1].toLowerCase();if(!keepHost(host))continue;out.push('https://'+host)}return Array.from(new Set(out)).slice(0,4)}

async function get(url, ms = 12000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, { signal: c.signal, headers: { 'user-agent': UA, 'accept-language': 'en', 'accept-encoding': 'gzip, deflate, br' } });
    return await res.text();
  } finally {
    clearTimeout(t);
  }
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

const cdx = await (await fetch('https://web.archive.org/cdx/search/cdx?url=support.google.com/adsense/threads&matchType=prefix&output=json&fl=timestamp,original&collapse=digest&limit=400', { headers: { 'user-agent': UA } })).json();
const rows = cdx.slice(1).filter((r) => /\/adsense\/threads/.test(r[1]) && r[0] >= '20230101');
const snapshots = Array.from(new Map(rows.map((r) => [r[0], r[1]])).entries()).slice(-30);
console.log(`capturas recientes: ${snapshots.length}`);

const listing = new Map();
for (const [ts] of snapshots) {
  try {
    const html = await get(`https://web.archive.org/web/${ts}id_/https://support.google.com/adsense/threads`, 15000);
    const blocks = html.split('<a ').filter((b) => b.includes('/adsense/thread/'));
    let added = 0;
    for (const block of blocks) {
      const id = /\/adsense\/thread\/(\d+)/.exec(block)?.[1];
      const title = /title="([^"]*)"/.exec(block)?.[1] ?? /\/adsense\/thread\/\d+\/([^"?]+)/.exec(block)?.[1]?.replace(/-/g, ' ');
      if (!id || !title) continue;
      if (listing.has(id)) continue;
      listing.set(id, { id, title: title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim(), snapshot: ts });
      added++;
    }
    console.log(`${ts}: +${added} (total ${listing.size})`);
    await writeFile('data/raw/wayback-listing.json', JSON.stringify(Array.from(listing.values()), null, 2), 'utf8');
  } catch (error) {
    console.log(`${ts}: ERROR ${error instanceof Error ? error.message : error}`);
  }
}

const all = Array.from(listing.values());
const selected = all.filter((t) => isSiteTitle(t.title) && outcomeOf(t.title) !== 'unknown').slice(0, MAX_THREADS);
console.log(`hilos: ${all.length}; seleccionados: ${selected.length}`);

const cases = [];
let done = 0;
await pool(selected, 8, async (t) => {
  const url = `https://support.google.com/adsense/thread/${t.id}?hl=en`;
  try {
    const html = await get(url, 12000);
    const title = (/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? t.title).replace(/\s*-\s*Google AdSense Community\s*$/, '').trim();
    const sites = siteUrls(decode(html));
    if (sites.length) {
      cases.push({ id: t.id, url, title, snapshot: t.snapshot, date: null, outcome: outcomeOf(title), sites });
    }
  } catch {
    /* hilo no accesible */
  }
  done++;
  if (done % 10 === 0) {
    console.log(`hilos ${done}/${selected.length}, con URL ${cases.length}`);
    await writeFile('data/raw/wayback-cases.json', JSON.stringify(cases, null, 2), 'utf8');
  }
});

await writeFile('data/raw/wayback-cases.json', JSON.stringify(cases, null, 2), 'utf8');
console.log(`FIN: casos con URL ${cases.length}/${selected.length}`);
