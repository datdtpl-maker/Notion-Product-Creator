const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('verification recovery and diagnostic download keep drafts, block sending, and never retry automatically', async t => {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let state = 'verification_required';
  let accept = false;
  const requests = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'npc.test') return route.abort();
    if (url.pathname.startsWith('/api/')) {
      let body = {};
      if (url.pathname === '/api/config') body = { prompts: [{ title: 'Ảnh 1', content: 'Prompt giữ nguyên' }] };
      if (url.pathname === '/api/logs') body = [];
      if (url.pathname === '/api/chrome/status') body = { online: state !== 'manual', ready: false, state };
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        requests.push({ route: url.pathname, data });
        if (url.pathname === '/api/chrome/login') {
          if (data?.restartProfile !== true) return route.fulfill({ status: 409, json: { code: 'CHROME_PROFILE_RESTART_REQUIRED', error: 'Đóng đúng profile và mở thủ công?' } });
          state = 'manual';
          body = { success: true, ready: false, state, message: 'Chrome đang ở chế độ thủ công' };
        } else if (url.pathname === '/api/chrome/diagnose') {
          body = { success: true, message: 'Đã tạo báo cáo chẩn đoán', report: { schemaVersion: 1, state, history: [], observation: null } };
        } else return route.fulfill({ status: 500, json: { error: 'Unexpected action' } });
      }
      return route.fulfill({ json: body });
    }
    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!['index.html', 'app.js', 'styles.css'].includes(file)) return route.fulfill({ status: 404 });
    return route.fulfill({ body: await fs.readFile(path.join(__dirname, '..', 'public', file)), contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
  });
  await page.goto('http://npc.test');
  await page.waitForFunction(() => document.querySelector('#chrome-status').textContent.includes('Chờ xác minh'));
  await page.locator('#prod-name').fill('Sản phẩm đang làm');
  await page.locator('#article-content').fill('Nội dung chưa được lưu');
  assert.equal(await page.locator('.btn-generate-single').first().isEnabled(), false);
  await page.locator('#btn-manual-chrome').click();
  await page.waitForFunction(() => !document.querySelector('#btn-manual-chrome').disabled);
  assert.equal(requests.length, 1, 'cancel does not restart');
  assert.equal(state, 'verification_required');
  accept = true;
  await page.locator('#btn-manual-chrome').click();
  await page.waitForFunction(() => document.querySelector('#chrome-status').textContent.includes('Đăng nhập thủ công'));
  assert.equal(await page.locator('#btn-manual-chrome').isVisible(), false);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#btn-diagnose-chrome').click();
  const download = await downloadEvent;
  assert.equal(download.suggestedFilename(), 'notion-product-creator-chrome-diagnostic.json');
  assert.equal(JSON.parse(await fs.readFile(await download.path(), 'utf8')).state, 'manual');
  assert.equal(await page.locator('#prod-name').inputValue(), 'Sản phẩm đang làm');
  assert.equal(await page.locator('#article-content').inputValue(), 'Nội dung chưa được lưu');
  assert.equal(await page.locator('.btn-generate-single').first().isEnabled(), false);
  assert.deepEqual(requests.map(item => item.route), ['/api/chrome/login', '/api/chrome/login', '/api/chrome/login', '/api/chrome/diagnose']);
  assert.deepEqual(requests[2].data, { restartProfile: true });
  assert.deepEqual(errors, []);
});
