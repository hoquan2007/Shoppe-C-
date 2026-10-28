// Compare sequential legacy reads with one session bootstrap on the SAME source.
// GETs only after temporary login; never modifies a cart, address, order or payment.
import https from 'node:https';
import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
const { values } = parseArgs({ options: {
  base: { type: 'string', default: 'https://shoppec.vercel.app' },
  credentials: { type: 'string', default: '.env.admin.local' },
  samples: { type: 'string', default: '30' },
  output: { type: 'string', default: 'artifacts/readiness-probe.json' },
} });
const base = new URL(values.base), samples = Number(values.samples);
if (base.username || base.password || base.pathname !== '/' || base.search || base.hash ||
    !(base.origin === 'https://shoppec.vercel.app' || (['localhost','127.0.0.1'].includes(base.hostname) && ['http:','https:'].includes(base.protocol))))
  throw new Error('Only existing Production origin or localhost fixture is allowed');
if (!Number.isInteger(samples) || samples < 1 || samples > 30) throw new Error('Samples must be 1..30');
const transport = base.protocol === 'https:' ? https : http;
const agent = new transport.Agent({ keepAlive: true, maxSockets: 1 });
let cookie = '', csrf = '', loggedIn = false, failure = null;
const rows = [], setup = [];
const elapsed = start => +(performance.now() - start).toFixed(3);
async function request(path, method = 'GET', body) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    const req = transport.request(new URL(path, base), { agent, method, headers: {
      'Accept-Encoding': 'identity', ...(cookie ? { Cookie: cookie } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json', Origin: base.origin }),
    } }, res => {
      const ttfbMs = elapsed(start), chunks = [];
      res.on('error', reject); res.on('data', b => chunks.push(b));
      res.on('end', () => {
        const bytes = Buffer.concat(chunks);
        let data; try { data = JSON.parse(bytes); } catch { reject(new Error('invalid_json')); return; }
        if (res.headers['set-cookie']?.length) cookie = res.headers['set-cookie'][0].split(';')[0];
        if (data.csrf) csrf = data.csrf;
        resolve({ data, timing: { path, status: res.statusCode, totalMs: elapsed(start), ttfbMs, bytes: bytes.length,
          requestId: res.headers['x-request-id'], platformRequest: res.headers['x-vercel-id'],
          instance: res.headers['x-app-instance'], instanceAgeMs: res.headers['x-app-age-ms'],
          serverTiming: res.headers['server-timing'], cacheControl: res.headers['cache-control'] } });
      });
    });
    const deadline = setTimeout(() => req.destroy(new Error('deadline')), 20000);
    req.on('close', () => clearTimeout(deadline)); req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
const scenarios = {
  'cart-legacy': ['/api/auth/me?include=cart', '/api/cart'],
  'cart-bootstrap': ['/api/auth/me?include=cart-view'],
  'checkout-context-legacy': ['/api/auth/me?include=cart', '/api/checkout/context'],
  'checkout-context-bootstrap': ['/api/auth/me?include=checkout'],
};
let seed = 281007;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
try {
  let env = parseEnv(await readFile(values.credentials,'utf8'));
  const login = await request('/api/auth/login','POST',{ email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
  env = undefined;
  setup.push(login.timing);
  if (login.timing.status !== 200) throw new Error('login_failed');
  loggedIn = true;
  const userId = login.data.user.id;
  for (let sample=0;sample<samples;sample++) {
    const block = Object.keys(scenarios);
    for(let i=block.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[block[i],block[j]]=[block[j],block[i]];}
    for (const scenario of block) {
      const start = performance.now(), parts = [];
      try {
        let data;
        for (const path of scenarios[scenario]) {
          const result = await request(path); parts.push(result.timing);
          if (result.timing.status !== 200) throw new Error('read_failed');
          data = result.data;
        }
        const view = scenario.endsWith('bootstrap') ? data.bootstrap : data;
        if (!view?.cart || view.cart.user_id !== userId || !Array.isArray(view.lines) ||
            (scenario.startsWith('checkout') && (!view.meta || !Array.isArray(view.addresses)))) throw new Error('snapshot_invalid');
        rows.push({ sample, scenario, totalMs: elapsed(start), requests: parts.length, ok: true,
          lines: view.lines.length, revision: view.cart.revision, parts });
      } catch { rows.push({ sample, scenario, totalMs: elapsed(start), requests: parts.length, ok: false, error:'read_or_snapshot_failed', parts }); }
    }
  }
} catch { failure = 'setup_failed'; }
finally {
  if(loggedIn){try{const logout=await request('/api/auth/logout','POST',{});setup.push(logout.timing);if(logout.timing.status!==200)failure='logout_failed';}catch{failure='logout_failed';}}
  agent.destroy(); cookie = csrf = '';
  const groups=Object.fromEntries(Object.keys(scenarios).map(name=>{
    const group=rows.filter(r=>r.scenario===name), sorted=group.filter(r=>r.ok).map(r=>r.totalMs).sort((a,b)=>a-b);
    const n=sorted.length;
    return [name,{n:group.length,success:n,errors:group.length-n,medianMs:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.ceil((n-1)/2)])/2:null,
      p95LabMs:n>=30?sorted[Math.ceil(n*.95)-1]:null,minMs:sorted[0]??null,maxMs:sorted.at(-1)??null,over1s:group.filter(r=>r.totalMs>1000).length,
      requestsPerSuccess:scenarios[name].length}];
  }));
  const report={at:new Date().toISOString(),base:base.origin,seed:281007,samples,failure,
    scope:'Sequential randomized comparison on one deployment, H1 agent reuse. Admin context can be empty. Checkout measures session/context readiness ONLY: excludes quote and does not place an order. No private payloads or credentials stored.',groups,setup,rows};
  await mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
  await writeFile(values.output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({output:values.output,failure,groups},null,2));
  if(failure||rows.some(r=>!r.ok))process.exitCode=1;
}
