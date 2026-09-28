const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('Chrome controls keep image buttons disabled until explicit readiness confirmation', async t => {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1320, height: 880 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let ready = false;
  const actions = [];
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'npc.test') return route.abort();
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (url.pathname === '/api/config') body = { prompts: [{ title: 'Ảnh 1', content: 'Tạo một ảnh' }] };
      if (url.pathname === '/api/logs') body = [];
      if (url.pathname === '/api/chrome/status') body = { online: true, ready };
      if (route.request().method() === 'POST') {
        actions.push(url.pathname);
        if (url.pathname === '/api/chrome/connect') ready = true;
        body = { success: true, ready, message: ready ? 'ChatGPT đã sẵn sàng' : 'Đăng nhập rồi đóng cửa sổ profile để kết nối.' };
      }
      return route.fulfill({ json: body });
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'app.js', 'styles.css'].includes(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ body: await fs.readFile(path.join(__dirname, '..', 'public', file)), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await page.goto('http://npc.test');
  await page.waitForFunction(() => document.querySelector('#chrome-status').textContent.includes('Chưa khóa tab'));
  const images = page.locator('.btn-generate-single');
  assert.ok(await images.count() > 0);
  assert.equal(await images.first().isEnabled(), false);
  await page.locator('#btn-login-chrome').click();
  await page.waitForFunction(() => document.querySelector('#chrome-login-hint').textContent.includes('Đăng nhập rồi'));
  assert.equal(await images.first().isEnabled(), false);
  await page.locator('#btn-start-chrome').click();
  await page.waitForFunction(() => !document.querySelector('#btn-check-chrome').disabled);
  assert.equal(await images.first().isEnabled(), false);
  await page.locator('#btn-check-chrome').click();
  await page.waitForFunction(() => document.querySelector('#chrome-status').textContent.includes('Sẵn sàng'));
  assert.equal(await images.first().isEnabled(), true);
  assert.deepEqual(actions, ['/api/chrome/login', '/api/chrome/start', '/api/chrome/connect']);
  assert.deepEqual(errors, []);
});
