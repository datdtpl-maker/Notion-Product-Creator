const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

test('real API reports verification, exports safe observations, and refuses cross-origin diagnostics/recovery', { timeout: 60000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-diagnostic-api-'));
  const profile = path.join(root, 'private-profile');
  const port = await freePort();
  const chromePort = await freePort();
  let child;
  const browser = await chromium.launchPersistentContext(profile, {
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }),
    headless: true, args: ['--enable-automation', `--remote-debugging-port=${chromePort}`]
  });
  t.after(async () => {
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    await browser.close();
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'npc-diagnostic-api-')));
    await fs.rm(root, { recursive: true, force: true });
  });
  await browser.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<title>Chờ một chút...</title><div>PRIVATE-USER</div>' }));
  const page = browser.pages()[0];
  await page.goto('https://chatgpt.com/c/PRIVATE-CONVERSATION?token=SECRET-TOKEN');
  child = spawn(process.execPath, ['server.js'], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, PORT: String(port), NPC_CONFIG_DIR: path.join(root, 'config'), NPC_DISABLE_AUTO_LAUNCH: '1' }, stdio: 'ignore', windowsHide: true });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (await fetch(base + '/api/config').then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const post = (route, body = {}, headers = {}) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post('/api/config', { chromeDebugPort: chromePort, chromeUserDataDir: profile })).ok, true);
  for (const route of ['/api/chrome/diagnose', '/api/chrome/login']) {
    assert.equal((await post(route, { restartProfile: true }, { Origin: 'https://untrusted.example' })).status, 403);
  }
  const connection = await (await post('/api/chrome/start')).json();
  assert.equal(connection.ready, false);
  assert.equal(connection.state, 'verification_required');
  assert.match(connection.message, /Cloudflare/);
  const status = await (await fetch(base + '/api/chrome/status')).json();
  assert.equal(status.state, 'verification_required');
  assert.equal(status.ready, false);
  const response = await post('/api/chrome/diagnose');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.report.debugAvailable, true);
  assert.equal(result.report.state, 'verification_required');
  assert.equal(result.report.observation.states.length, 6);
  assert.ok(result.report.history.some(event => event.action === 'start'));
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE-|SECRET-|127\.0\.0\.1|webSocket|user-data-dir/);
  assert.equal(browser.pages().length, 1);
  assert.equal(page.url(), 'https://chatgpt.com/c/PRIVATE-CONVERSATION?token=SECRET-TOKEN');
  const imageRequest = { productName: 'fixture', driveParent: root, promptIndex: 1, promptText: 'Never send this prompt' };
  assert.equal((await post('/api/chrome/generate-single-image', imageRequest)).status, 409);
  // Even when the page becomes ready, diagnostics alone may not enable image sending.
  await page.setContent('<title>ChatGPT</title><textarea id="prompt-textarea"></textarea>');
  const next = await (await post('/api/chrome/diagnose')).json();
  assert.equal(next.report.state, 'ready');
  assert.equal((await (await fetch(base + '/api/chrome/status')).json()).ready, false);
  assert.equal((await (await post('/api/chrome/connect')).json()).ready, true);
  const pending = post('/api/chrome/diagnose');
  for (let i = 0; i < 25; i++) {
    if (!(await (await fetch(base + '/api/chrome/status')).json()).ready) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal((await post('/api/chrome/generate-single-image', imageRequest)).status, 409);
  assert.equal((await post('/api/chrome/login', { restartProfile: true })).status, 409);
  assert.equal((await pending).ok, true);
});
