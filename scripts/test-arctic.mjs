const BASE = 'https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=Adsense&limit=100&sort=desc';
const UA = 'AdeptusResearch/1.0 (contact: magiadelcaospractica@gmail.com)';

const r1 = await fetch(BASE, { headers: { 'user-agent': UA } });
const j1 = await r1.json();
const posts = j1.data ?? [];
console.log('page1', posts.length, posts[0]?.id, posts[0]?.created_utc, posts.at(-1)?.created_utc);
const oldest = Math.min(...posts.map((p) => p.created_utc));
await new Promise((r) => setTimeout(r, 3000));
const r2 = await fetch(`${BASE}&before=${oldest}`, { headers: { 'user-agent': UA } });
const j2 = await r2.json();
const posts2 = j2.data ?? [];
console.log('page2', posts2.length, posts2[0]?.id, posts2[0]?.created_utc, posts2.at(-1)?.created_utc);
console.log('overlap', posts2.filter((p) => posts.some((q) => q.id === p.id)).length);
console.log('sample titles:');
for (const p of posts.slice(0, 8)) console.log('-', p.title?.slice(0, 90), '| selftext', String(p.selftext).length);
