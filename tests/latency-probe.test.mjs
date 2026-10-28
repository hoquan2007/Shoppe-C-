import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

test('latency probe isolates public credentials, preserves failures and always logs out', async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ path: req.url, method: req.method, cookie: req.headers.cookie, csrf: req.headers['x-csrf-token'] });
    req.resume();
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/auth/login') {
      res.setHeader('Set-Cookie', 'shoppe_session=fixture-private-cookie; HttpOnly');
      res.end(JSON.stringify({ csrf: 'fixture-private-csrf' }));
    } else {
      if (req.url === '/api/cart') res.statusCode = 503;
      res.end(JSON.stringify({ private: 'fixture-private-payload' }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const temp = await mkdtemp('.cache/latency-probe-test-');
  const credentials = temp + '/credentials.env', output = temp + '/result.json';
  await writeFile(credentials, 'ADMIN_EMAIL=probe@example.test\nADMIN_PASSWORD=fixture-private-password\n');
  try {
    const child = spawn(process.execPath, ['scripts/latency-probe.mjs', '--base', `http://127.0.0.1:${server.address().port}`,
      '--samples', '2', '--credentials', credentials, '--output', output], { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => stdout += b);
    child.stderr.on('data', b => stderr += b);
    const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
    assert.equal(code, 1, stderr);
    const text = await readFile(output, 'utf8'), report = JSON.parse(text);
    for (const secret of ['fixture-private-cookie', 'fixture-private-csrf', 'fixture-private-payload', 'fixture-private-password', 'probe@example.test'])
      assert.equal((text + stdout + stderr).includes(secret), false);
    assert.equal(seen.filter(r => r.path === '/api/auth/logout').length, 1);
    for (const r of seen) {
      if (r.path === '/' || /^\/api\/(products|health|live)/.test(r.path)) {
        assert.equal(r.cookie, undefined); assert.equal(r.csrf, undefined);
      }
      if (r.path === '/api/cart' || r.path === '/api/checkout/context') assert.equal(r.cookie, 'shoppe_session=fixture-private-cookie');
    }
    assert.equal(report.rows.filter(r => r.phase === 'measured').length, 28);
    assert.equal(report.groups['h1-reuse /api/cart'].errors, 2);
    assert.equal(report.groups['h1-new /api/cart'].errors, 2);
    assert.equal(report.groups['h1-reuse /api/live'].n, 2); // Initial request excluded.
    assert.equal(report.groups['h1-reuse /api/live'].p95LabMs, null);
    assert.ok(report.rows.some(r => r.socketReused === true));
    assert.ok(report.rows.filter(r => r.mode === 'h1-new').every(r => !r.socketReused));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
