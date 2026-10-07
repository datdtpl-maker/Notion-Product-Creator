const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

for (const restartChoice of ['not-needed', 'accept', 'cancel']) {
test(`Chrome controls require readiness and honor profile restart choice: ${restartChoice}`, async t => {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1320, height: 880 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let ready = false;
  const actions = [];
  const restartRequests = [];
  const confirmations = [];
  page.on('dialog', async dialog => {
    assert.equal(dialog.type(), 'confirm');
    confirmations.push(dialog.message());
    if (restartChoice === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });
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
        if (url.pathname === '/api/chrome/start' && restartChoice !== 'not-needed') {
          const request = route.request().postDataJSON();
          restartRequests.push(request);
          if (request?.restartProfile !== true) {
            return route.fulfill({ status: 409, json: { code: 'CHROME_PROFILE_RESTART_REQUIRED', error: 'Đóng đúng profile của tool rồi mở Debug? Cookie được giữ nguyên.' } });
          }
        }
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
  if (restartChoice === 'cancel') {
    assert.deepEqual(actions, ['/api/chrome/login', '/api/chrome/start']);
    assert.deepEqual(restartRequests, [null]);
    assert.equal(confirmations.length, 1);
    assert.match(await page.locator('#chrome-login-hint').textContent(), /Đã hủy/);
    assert.deepEqual(errors, []);
    return;
  }
  await page.locator('#btn-check-chrome').click();
  await page.waitForFunction(() => document.querySelector('#chrome-status').textContent.includes('Sẵn sàng'));
  assert.equal(await images.first().isEnabled(), true);
  assert.deepEqual(actions, ['/api/chrome/login', '/api/chrome/start', ...(restartChoice === 'accept' ? ['/api/chrome/start'] : []), '/api/chrome/connect']);
  if (restartChoice === 'accept') {
    assert.equal(confirmations.length, 1);
    assert.deepEqual(restartRequests, [null, { restartProfile: true }]);
  } else assert.equal(confirmations.length, 0);
  assert.deepEqual(errors, []);
});
}
