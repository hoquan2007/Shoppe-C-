// Bounded, sequential reads. Private mode only adds temporary login/logout.
// Never writes carts, addresses, orders, payments, email or OAuth state.
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseArgs, parseEnv } from 'node:util';
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';

const { values } = parseArgs({ options: {
  base: { type: 'string', default: 'https://shoppec.vercel.app' },
  samples: { type: 'string', default: '30' },
  modes: { type: 'string', default: 'h1-reuse,h1-new' },
  output: { type: 'string', default: 'artifacts/latency-probe.json' },
  credentials: { type: 'string' }, label: { type: 'string', default: 'manual' },
  'transport-test': { type: 'boolean', default: false },
  origin: { type: 'boolean', default: false },
} });
const base = new URL(values.base);
if (base.pathname !== '/' || base.search || base.hash || base.username || base.password)
  throw new Error('Base must be an origin without path, query or credentials');
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))
  throw new Error('Only HTTPS or disposable localhost HTTP is supported');
const samples = Number(values.samples), modes = values.modes.split(',');
if (!Number.isInteger(samples) || samples < 1 || samples > 30 ||
    modes.some(m => !['h1-reuse', 'h1-new', 'h2-reuse'].includes(m))) throw new Error('Invalid bounded probe configuration');
if (values.credentials && base.hostname !== 'shoppec.vercel.app' && !['127.0.0.1', 'localhost'].includes(base.hostname))
  throw new Error('Private probes are restricted to the existing production alias or localhost');
const transport = base.protocol === 'https:' ? https : http;
const agent = new transport.Agent({ keepAlive: true, maxSockets: 1 });
let h2, cookie = '', csrf = '', loggedIn = false, phase = 'initial';
let readOrdinal = 0;
const probeGeneration = Date.now().toString(36);
const rows = [];
const elapsed = start => +(performance.now() - start).toFixed(3);
const safePath = path => path === '/api/live?connection=close' ? path : path.split('?')[0];
function rowFor(path, mode, start, headerAt, headers, status, bytes, phases) {
  return { phase, path: safePath(path), mode, status, totalMs: elapsed(start), ttfbMs: +(headerAt - start).toFixed(3),
    bodyMs: +(performance.now() - headerAt).toFixed(3), bytes, ...phases,
    cache: headers['x-vercel-cache'] || null, age: headers.age || null,
    cacheControl: headers['cache-control'] || null, sessionSource: headers['x-session-source'] || null,
    appRequest: headers['x-request-id'] || null, platformRequest: headers['x-vercel-id'] || null,
    instance: headers['x-app-instance'] || null, instanceAgeMs: headers['x-app-age-ms'] || null,
    serverTiming: headers['server-timing'] || null };
}
async function request(path, mode = 'h1-reuse', method = 'GET', body) {
  const start = performance.now(), chunks = [];
  const payload = body === undefined ? undefined : JSON.stringify(body);
  // Explicit synthetic origin samples. Never bust session/private or static URLs.
  const originRead = values.origin && phase === 'measured' && method === 'GET' && /^\/api\/(home|meta|products)(?:[/?]|$)/.test(path);
  const networkPath = originRead ? path + (path.includes('?') ? '&' : '?') + '_fresh=probe-' + probeGeneration + '-' + (++readOrdinal) : path;
  const publicRead = method === 'GET' && (path === '/' || /^\/api\/(products|home|meta|live|health)(?:[/?]|$)/.test(path));
  const headers = { 'accept-encoding': 'identity', ...(!publicRead && cookie ? { cookie } : {}),
    ...(!publicRead && csrf ? { 'x-csrf-token': csrf } : {}), ...(payload ? { 'content-type': 'application/json', origin: base.origin } : {}) };
  let row, data;
  try {
    const result = await new Promise((resolve, reject) => {
      const finish = (responseHeaders, status, headerAt, phases) => {
        const bytes = Buffer.concat(chunks);
        try { data = JSON.parse(bytes); } catch { /* static control is HTML */ }
        const setCookie = responseHeaders['set-cookie'];
        if (setCookie?.length) cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
        if (data?.csrf) csrf = data.csrf;
        row = rowFor(path, mode, start, headerAt, responseHeaders, status, bytes.length, phases);
        resolve({ data, row });
      };
      if (mode === 'h2-reuse') {
        if (!h2 || h2.closed || h2.destroyed) {
          h2 = http2.connect(base.origin);
          h2.on('error', () => {});
        }
        const req = h2.request({ ':path': networkPath, ':method': method, ...headers });
        let responseHeaders, headerAt;
        const deadline = setTimeout(() => { req.close(http2.constants.NGHTTP2_CANCEL); reject(new Error('timeout')); }, 20000);
        req.on('close', () => clearTimeout(deadline));
        req.on('response', h => { responseHeaders = h; headerAt = performance.now(); });
        req.on('data', b => chunks.push(b));
        req.on('end', () => finish(responseHeaders || {}, responseHeaders?.[':status'], headerAt || performance.now(), { protocol: 'h2', socketReused: null }));
        req.on('error', reject); req.end(payload);
      } else {
        let headerAt, dnsAt, tcpAt, tlsAt;
        const req = transport.request(new URL(networkPath, base), { method, headers, agent: mode === 'h1-new' ? false : agent }, res => {
          headerAt = performance.now();
          res.on('data', b => chunks.push(b)); res.on('error', reject);
          res.on('end', () => finish(res.headers, res.statusCode, headerAt, {
            protocol: 'http/1.1', socketReused: req.reusedSocket,
            dnsAtMs: dnsAt ?? null, tcpAtMs: tcpAt ?? null, tlsAtMs: tlsAt ?? null,
          }));
        });
        req.on('socket', socket => {
          // No per-request listeners on reused sockets: avoids leaks and misleading DNS/TLS phases.
          if (socket.connecting) {
            socket.once('lookup', () => { dnsAt = elapsed(start); });
            socket.once('connect', () => { tcpAt = elapsed(start); });
            socket.once('secureConnect', () => { tlsAt = elapsed(start); });
          }
        });
        const deadline = setTimeout(() => req.destroy(new Error('timeout')), 20000);
        req.on('close', () => clearTimeout(deadline));
        req.on('error', reject); req.end(payload);
      }
    });
    rows.push(result.row);
    return result;
  } catch (error) {
    rows.push({ phase, path: safePath(path), mode, status: null, totalMs: elapsed(start), error: error.code || (error.message === 'timeout' ? 'timeout' : 'transport_error') });
    throw error;
  }
}
function summary(separateCache = false) {
  const measured = rows.filter(r => r.phase === 'measured');
  const keyOf = row => `${row.mode} ${row.path}` + (separateCache ? ` ${row.cache || 'unknown'}` : '');
  return Object.fromEntries([...new Set(measured.map(keyOf))].map(key => {
    const group = measured.filter(r => keyOf(r) === key), ok = group.filter(r => r.status === 200);
    const sorted = ok.map(r => r.totalMs).sort((a,b) => a-b);
    const median = sorted.length ? (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.ceil((sorted.length-1)/2)])/2 : null;
    return [key, { n: group.length, successes: ok.length, errors: group.length-ok.length, medianMs: median,
      p95LabMs: sorted.length >= 30 ? sorted[Math.ceil(sorted.length*.95)-1] : null,
      minMs: sorted[0] ?? null, maxMs: sorted.at(-1) ?? null, over1s: group.filter(r => r.totalMs > 1000).length }];
  }));
}
let failure;
try {
  // First origin read is recorded separately, never assumed to be cold without instance/log evidence.
  await request('/api/live', 'h1-new');
  if (values.credentials) {
    phase = 'auth';
    const env = parseEnv(await readFile(values.credentials, 'utf8'));
    const login = await request('/api/auth/login', 'h1-reuse', 'POST', { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD });
    if (login.row.status !== 200) throw new Error('Temporary audit login failed');
    loggedIn = true;
  }
  const paths = values['transport-test'] ? ['/', '/api/live', '/api/live?connection=close', '/api/auth/me?include=cart'] :
    ['/', '/api/live', '/api/health', '/api/home', '/api/products?include=meta',
      '/api/auth/me?include=cart', ...(loggedIn ? ['/api/cart', '/api/checkout/context'] : [])];
  // Deterministic seeded shuffle of complete mode/endpoint blocks reduces order bias.
  let seed = 28102026;
  phase = 'measured';
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let sample = 0; sample < samples; sample++) {
    const block = modes.flatMap(mode => paths.map(path => ({ mode, path })));
    for (let i = block.length-1; i > 0; i--) { const j = Math.floor(random()*(i+1)); [block[i],block[j]] = [block[j],block[i]]; }
    for (const { mode, path } of block) {
      try { await request(path, mode); } catch { /* retain failed rows and continue bounded reads */ }
    }
  }
} catch (error) { failure = error.message === 'Temporary audit login failed' ? error.message : 'Probe setup failed'; }
finally {
  if (loggedIn) {
    phase = 'cleanup';
    try { const logout = await request('/api/auth/logout', 'h1-reuse', 'POST', {}); if (logout.row.status !== 200) failure = 'Audit logout failed'; }
    catch { failure = 'Audit logout failed'; }
  }
  agent.destroy(); h2?.destroy();
  let source; try { source = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch {}
  const report = { at: new Date().toISOString(), label: values.label, runnerSource: source, base: base.origin,
    scope: 'Sequential controlled lab; response bodies, cookies, CSRF and credentials are not stored. First origin read is not automatically cold. Private context may be empty; not buyer checkout readiness.',
    samples, modes, transportTest: values['transport-test'], syntheticOriginReads: values.origin,
    seed: 28102026, failure: failure || null, groups: summary(), cacheGroups: summary(true), rows };
  await mkdir(dirname(values.output), { recursive: true });
  await writeFile(values.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output: values.output, failure: report.failure, groups: report.groups }, null, 2));
  if (failure || rows.some(r => r.status !== 200)) process.exitCode = 1;
}
