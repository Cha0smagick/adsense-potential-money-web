import { readFile, writeFile } from 'node:fs/promises';

// Reprocesa los posts ya descargados de Arctic Shift: limpia URLs, afina la
// etiqueta y deduplica por host. Sin red.

const EXCLUDE = ['reddit.com','redd.it','redditmedia.com','redditstatic.com','imgur.com','i.imgur.com','preview.redd.it','youtube.com','youtu.be','google.com','googleapis.com','gstatic.com','googleusercontent.com','facebook.com','twitter.com','x.com','linkedin.com','instagram.com','tiktok.com','discord.gg','discord.com','medium.com','github.com','w3.org','schema.org','gmail.com','example.com','domain.com'];
const TLDS = new Set(['com','net','org','io','co','es','me','app','dev','xyz','info','online','site','store','tech','ai','us','uk','de','fr','it','br','mx','ar','cl','pe','ec','ve','uy','py','bo','cr','pa','do','gt','pt','nl','be','ch','at','se','no','dk','fi','pl','cz','gr','tr','ru','ua','jp','kr','cn','in','id','ph','my','sg','au','nz','ca','za','ie','blog','shop','pro','biz','tv','cc','ly','to','gg','fm','is','name','digital','agency','studio','design','media','news','world','life','live','space','website','press','rocks','today','tips','guide','review','reviews','email','solutions','services','consulting','academy','school','travel','tours','hotel','restaurant','cafe','bar','pizza','fitness','health','clinic','dental','law','legal','finance','money','capital','invest','insurance','realestate','properties','homes','land','farm','garden','art','photo','photography','video','music','games','gaming','sports','football','soccer','basketball','tennis','golf','yoga','beauty','fashion','style','shoes','jewelry','watches','cars','auto','motorcycles','bike','tools','equipment','parts','supply','construction','plumbing','electric','solar','energy','green','eco','water','food','recipes','kitchen','coffee','tea','wine','beer','pets','dog','cat','baby','kids','toys','books','ebooks','author','writing','magazine','journal']);

function keepHost(host){if(!host||!host.includes('.'))return false;const tld=host.split('.').pop()??'';if(!TLDS.has(tld))return false;if(host.includes('google')||host.includes('gstatic'))return false;return !EXCLUDE.some(d=>host===d||host.endsWith('.'+d))}

function cleanUrl(raw) {
  let u = raw.split('](')[0].split(']')[0].replace(/[),.;]+$/g, '');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const url = new URL(u);
    url.hash = '';
    url.search = '';
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, '')}`;
  } catch {
    return '';
  }
}

function sitesOf(title, selftext, url) {
  const text = `${title}\n${selftext}\n${url ?? ''}`;
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)"'<>\\]+/g)) {
    const u = cleanUrl(m[0]);
    if (!u) continue;
    try { if (keepHost(new URL(u).hostname.toLowerCase())) out.push(u); } catch {}
  }
  for (const m of text.matchAll(/\b((?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,})\b/gi)) {
    const u = cleanUrl(m[1]);
    if (!u) continue;
    try { if (keepHost(new URL(u).hostname.toLowerCase())) out.push(u); } catch {}
  }
  return Array.from(new Set(out)).slice(0, 3);
}

function outcomeOf(title, selftext) {
  const tt = title.toLowerCase().trim();
  const text = String(selftext).slice(0, 1800).toLowerCase();
  const rejection = /reject|not approved|disapproved|denied|low[- ]value|low[- ]quality|policy violation|needs attention/.test(tt);
  const approval = /(got|was|is|been|finally|just|now|officially|site is|website is|we are|i am)\s+approved|approved (after|in|today|yesterday|finally|my site)|approval (received|granted|email|notification)|ready to show ads|^approved\b/.test(tt);
  if (rejection && !/approved after|finally approved|got approved|now approved|approved today|was approved/.test(tt)) return 'rejected';
  if (approval) return 'approved';
  const question = /^(can|will|how|why|is|does|should|any|what|when|where|do|did|not sure)\b/.test(tt) || /\?$/.test(tt);
  if (question) return 'pending';
  if (/reject|not approved|disapproved|denied|low[- ]value|low[- ]quality|policy violation/.test(text)) return 'rejected';
  if (/(got|was|is|been|finally|just|now)\s+approved|approved (after|in|today|yesterday)|approval (received|granted)|ready to show ads/.test(text)) return 'approved';
  return 'unknown';
}

const posts = JSON.parse(await readFile('data/raw/reddit-posts.json', 'utf8'));
const byHost = new Map();
for (const p of posts) {
  if (!p?.title) continue;
  const outcome = outcomeOf(p.title, p.selftext);
  if (outcome !== 'approved' && outcome !== 'rejected') continue;
  const sites = sitesOf(p.title, p.selftext, p.url);
  if (!sites.length) continue;
  for (const site of sites) {
    let host;
    try { host = new URL(site).hostname.toLowerCase().replace(/^www\./, ''); } catch { continue; }
    if (!keepHost(host)) continue;
    const prev = byHost.get(host);
    if (!prev || (p.created ?? 0) > (prev.created ?? 0)) {
      byHost.set(host, {
        id: p.id,
        site,
        host,
        title: p.title,
        created: p.created,
        outcome,
        source: p.permalink ? `https://www.reddit.com${p.permalink}` : '',
        conflict: prev && prev.outcome !== outcome ? true : Boolean(prev?.conflict),
      });
    } else if (prev && prev.outcome !== outcome) {
      prev.conflict = true;
    }
  }
}

const cases = Array.from(byHost.values()).filter((c) => !c.conflict);
const counts = cases.reduce((acc, c) => ({ ...acc, [c.outcome]: (acc[c.outcome] ?? 0) + 1 }), {});
console.log(`casos únicos sin conflicto: ${cases.length}`, counts);
console.log(cases.slice(0, 20).map((c) => `${c.outcome} | ${c.site} | ${c.title.slice(0, 65)}`).join('\n'));
await writeFile('data/raw/reddit-cases.json', JSON.stringify(cases, null, 2), 'utf8');
