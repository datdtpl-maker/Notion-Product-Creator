const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

function freePort() {
  return new Promise(resolve => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const port = server.address().port; server.close(() => resolve(port));
    });
  });
}

test('single-image API attaches the reference, saves one result and never starts prompt 2', { timeout: 45000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-single-'));
  const profile = path.join(root, 'profile');
  const port = await freePort();
  const chromePort = await freePort();
  let child;
  const context = await chromium.launchPersistentContext(profile, {
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }),
    headless: true, args: ['--enable-automation', `--remote-debugging-port=${chromePort}`]
  });
  t.after(async () => {
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
    await context.close();
    await fs.rm(root, { recursive: true, force: true });
  });
  const page = context.pages()[0];
  await context.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: `
    <main></main><form onsubmit="return false"><input type="file"><textarea id="prompt-textarea"></textarea>
    <button data-testid="stop-button" type="button">Đang tạo</button><button data-testid="send-button" type="button">Gửi</button></form>
    <script>
      window.sent = 0; window.uploads = 0;
      document.querySelector('input').onchange = event => { window.uploads += event.target.files.length; };
      document.querySelector('[data-testid="send-button"]').onclick = () => {
        window.sent++;
        const user = document.createElement('article'); user.dataset.turn = 'user'; user.id = 'request-' + window.sent;
        user.textContent = document.querySelector('textarea').value;
        const assistant = document.createElement('article'); assistant.dataset.turn = 'assistant'; assistant.id = 'result-' + window.sent;
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
        canvas.getContext('2d').fillStyle = 'red'; canvas.getContext('2d').fillRect(0, 0, 512, 512);
        assistant.append(canvas); document.querySelector('main').append(user, assistant);
        history.pushState({}, '', '/c/test-product/updated-by-chatgpt');
        document.querySelector('textarea').value = '';
      };
    </script>` }));
  await page.goto('https://chatgpt.com/c/test-product');
  const referenceImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    canvas.getContext('2d').fillStyle = 'blue'; canvas.getContext('2d').fillRect(0, 0, 512, 512);
    return canvas.toDataURL('image/png');
  });
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), NPC_CONFIG_DIR: path.join(root, 'config'), NPC_DISABLE_AUTO_LAUNCH: '1' },
    stdio: 'ignore', windowsHide: true
  });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (await fetch(`${base}/api/config`).then(r => r.ok).catch(() => false)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const post = async (route, body) => {
    const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.ok, true, result.error);
    return result;
  };
  await post('/api/config', { chromeDebugPort: chromePort, chromeUserDataDir: profile, logoImageUrl: '' });
  for (const route of ['/api/chrome/login', '/api/chrome/start', '/api/chrome/connect']) {
    const untrusted = await fetch(base + route, { method: 'POST', headers: { Origin: 'https://untrusted.example' } });
    assert.equal(untrusted.status, 403, 'external websites cannot control the local Chrome profile');
  }
  await context.route('https://auth.openai.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Just a moment...</title>Verify you are human' }));
  await page.goto('https://auth.openai.com/login');
  const pending = await post('/api/chrome/start', {});
  assert.equal(pending.ready, false);
  assert.equal(context.pages().length, 1, 'start while signing in must not open another tab');
  let status = await (await fetch(`${base}/api/chrome/status`)).json();
  assert.equal(status.online, true);
  assert.equal(status.ready, false, 'online browser is not a signed-in ChatGPT session');
  const blocked = await fetch(`${base}/api/chrome/generate-single-image`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName: 'Test product', driveParent: path.join(root, 'products'), promptIndex: 1, promptText: 'Do not send before login' })
  });
  assert.equal(blocked.status, 409);
  assert.equal(await fs.stat(path.join(root, 'products')).then(() => true).catch(() => false), false);
  const loginWhileDebug = await fetch(`${base}/api/chrome/login`, { method: 'POST' });
  assert.equal(loginWhileDebug.status, 409, 'manual login must never spawn into the running automated profile');
  assert.equal(context.pages().length, 1);
  await page.goto('https://chatgpt.com/c/test-product');
  const connected = await post('/api/chrome/connect', {});
  assert.equal(connected.ready, true);
  status = await (await fetch(`${base}/api/chrome/status`)).json();
  assert.equal(status.ready, true);
  await post('/api/chrome/generate-single-image', {
    productName: 'Test product', driveParent: path.join(root, 'products'), promptIndex: 1,
    promptText: 'Tạo một ảnh sản phẩm', referenceImage,
    autoContinue: true, prompts: ['one', 'two', 'three', 'four']
  });
  let job;
  for (let attempt = 0; attempt < 100; attempt++) {
    job = await (await fetch(`${base}/api/chrome/image-job`)).json();
    if (job.status !== 'running') break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.equal(job.status, 'completed', job.error);
  assert.deepEqual(job.completed, [1]);
  const target = path.join(root, 'products', 'Test product');
  assert.equal(job.savedPath, path.join(target, '1.png'));
  assert.deepEqual((await fs.readdir(target)).sort(), ['1.png', 'reference_image.png']);
  const bytes = await fs.readFile(job.savedPath);
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(await page.evaluate(() => window.sent), 1);
  assert.equal(await page.evaluate(() => window.uploads), 1);
  assert.equal(context.pages().length, 1);
});
