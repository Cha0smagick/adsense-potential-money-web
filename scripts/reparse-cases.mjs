import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const EXCLUDE = ['google.com','googleapis.com','gstatic.com','googleusercontent.com','withgoogle.com','googleadservices.com','googlesyndication.com','google-analytics.com','doubleclick.net','googletagmanager.com','googleoptimize.com','fundingchoicesmessages.google.com','adservice.google.com','youtube.com','youtu.be','facebook.com','twitter.com','x.com','linkedin.com','instagram.com','schema.org','w3.org','ggpht.com','ytimg.com','support.google.com','sites.google.com','productexperts.withgoogle.com','chrome.google.com','jsdelivr.net','bootstrapcdn.com','fontawesome.com','cloudflare.com','wp.com','gravatar.com','w.org','amazonaws.com','cloudfront.net','unpkg.com','cdnjs.cloudflare.com','lumendatabase.org','ontarioconstructionnews.com','thetoymanswife.ca','example.com','domain.com','object.is','array.is','number.is'];
const TLDS = new Set(['com','net','org','io','co','es','me','app','dev','xyz','info','online','site','store','tech','ai','us','uk','de','fr','it','br','mx','ar','cl','pe','ec','ve','uy','py','bo','cr','pa','do','gt','pt','nl','be','ch','at','se','no','dk','fi','pl','cz','gr','tr','ru','ua','jp','kr','cn','in','id','ph','my','sg','au','nz','ca','za','ie','blog','shop','pro','biz','tv','cc','ly','to','gg','fm','is','name','digital','agency','studio','design','media','news','world','life','live','space','website','press','rocks','today','tips','guide','review','reviews','email','solutions','services','consulting','academy','school','travel','tours','hotel','restaurant','cafe','bar','pizza','fitness','health','clinic','dental','law','legal','finance','money','capital','invest','insurance','realestate','properties','homes','land','farm','garden','art','photo','photography','video','music','games','gaming','sports','football','soccer','basketball','tennis','golf','yoga','beauty','fashion','style','shoes','jewelry','watches','cars','auto','motorcycles','bike','tools','equipment','parts','supply','construction','plumbing','electric','solar','energy','green','eco','water','food','recipes','kitchen','coffee','tea','wine','beer','pets','dog','cat','baby','kids','toys','books','ebooks','author','writing','magazine','journal']);

function decode(s){return s.replace(/\\x22/g,'"').replace(/\\x27/g,"'").replace(/\\x3d/g,'=').replace(/\\x3c/g,'<').replace(/\\x3e/g,'>').replace(/\\x26/g,'&').replace(/\\u003c/g,'<').replace(/\\u003e/g,'>').replace(/\\u0026/g,'&').replace(/\\\//g,'/').replace(/\\\\/g,'\\')}
function outcomeOf(title){const t=title.toLowerCase();if(/getting ready|under review|pending|waiting|how long|when will/.test(t))return 'pending';if(/not (been )?approved|rejected|rejection|disapproved|denied|low[- ]value|policy violation|needs attention|isn't ready|not being/.test(t))return 'rejected';if(/approved|approval|ready to show ads|site is ready/.test(t))return 'approved';return 'unknown'}
function hostOf(url){try{return new URL(url).hostname.toLowerCase()}catch{return ''}}
function keepHost(host){if(!host||!host.includes('.'))return false;const tld=host.split('.').pop()??'';if(!TLDS.has(tld))return false;if(host.includes('google')||host.includes('gstatic'))return false;return !EXCLUDE.some(d=>host===d||host.endsWith('.'+d))}
function siteUrls(text){const out=[];for(const m of text.matchAll(/https?:\/\/[^\s"'<>\\]+/g)){const url=m[0].replace(/[),.;]+$/g,'');const host=hostOf(url);if(!keepHost(host))continue;if(/[*{}^$]/.test(url))continue;if(/\.(jpg|jpeg|png|gif|webp|svg|css|js|ico)$/i.test(url))continue;out.push(url.replace(/\/$/,''))}for(const m of text.matchAll(/\b((?:[a-z0-9][a-z0-9-]*\.)+[a-z]{2,})\b/gi)){const host=m[1].toLowerCase();if(!keepHost(host))continue;out.push('https://'+host)}return Array.from(new Set(out)).slice(0,4)}

const raw = JSON.parse(await readFile('data/approval-cases.raw.json', 'utf8'));
const out = [];
for (const c of raw) {
  try {
    const res = await fetch(`https://support.google.com/adsense/thread/${c.id}?hl=en`, { headers: { 'user-agent': UA, 'accept-language': 'en' } });
    const html = await res.text();
    const d = decode(html);
    const idx = d.indexOf(String(c.id));
    const sites = siteUrls(d);
    out.push({ id: c.id, title: c.title, outcome: c.outcome, sites });
    console.log(`${c.id} | ${c.outcome} | ${sites[0] ?? 'â€”'} | ${c.title.slice(0, 58)}`);
  } catch (e) {
    out.push({ id: c.id, title: c.title, outcome: c.outcome, sites: [], error: String(e) });
  }
  await new Promise((r) => setTimeout(r, 150));
}
await writeFile('data/raw/forum-cases-38.json', JSON.stringify(out, null, 2), 'utf8');
console.log(`con URL: ${out.filter((x) => x.sites.length).length}/${out.length}`);


