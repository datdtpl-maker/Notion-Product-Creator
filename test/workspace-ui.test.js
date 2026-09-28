const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const categories = ['Phục hồi da', 'Trị Mụn', 'Chăm Sóc Da', 'Chăm Sóc Mắt', 'Chống Nắng', 'Cơ Thể', 'Dưỡng Ẩm', 'Làm Sạch Da', 'Môi', 'Phụ Kiện', 'Thuốc', 'Tóc'];
const sampleConfig = {
  openAiApiKeyConfigured: true, notionApiKeyConfigured: true,
  defaultDriveParent: 'D:\\Products', googleDriveParentUrl: 'https://drive.google.com/drive/folders/example',
  facebookPageUrl: 'https://www.facebook.com/example',
  prompts: ['Ảnh bìa & insight', 'Thành phần nổi bật', 'Công dụng sản phẩm', 'Hướng dẫn sử dụng'].map(title => ({ title, content: 'Tạo một ảnh sản phẩm theo thông tin được cung cấp.' }))
};

test('content workspace UI — isolated APIs, no real credentials or publishing', { timeout: 90000 }, async t => {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());

  async function fixture() {
    const page = await browser.newPage({ viewport: { width: 1320, height: 880 } });
    const state = { requests: [], errors: [], job: 'running', jobId: 0, polls: 0, config: { ...sampleConfig }, contentError: false };
    page.on('pageerror', error => state.errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.hostname !== 'npc.test') return route.abort();
      if (!url.pathname.startsWith('/api/')) {
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const contentTypes = { 'index.html': 'text/html; charset=utf-8', 'styles.css': 'text/css', 'app.js': 'text/javascript', 'app-icon.png': 'image/png', 'favicon.ico': 'image/x-icon' };
        if (!contentTypes[file]) return route.fulfill({ status: 404 });
        return route.fulfill({ body: await fs.readFile(path.join(__dirname, '..', 'public', file)), contentType: contentTypes[file] });
      }
      state.requests.push({ route: url.pathname, method: request.method(), body: request.postDataJSON() });
      let body = { success: true };
      if (url.pathname === '/api/config') body = request.method() === 'POST' ? { config: state.config } : state.config;
      if (url.pathname === '/api/chrome/status') body = { online: true, ready: true };
      if (url.pathname === '/api/logs') body = [];
      if (url.pathname === '/api/google-drive/status') body = { connected: false };
      if (url.pathname === '/api/openai/generate-content') {
        if (state.contentError) return route.fulfill({ status: 500, json: { error: 'Lỗi kết nối thử nghiệm' } });
        body = { content: '# Bài viết thử nghiệm\nNội dung sản phẩm.' };
      }
      if (url.pathname === '/api/facebook/pending-products') body = { products: [{ pageId: 'sample', productName: 'Drogsan Oximin — Gel chăm sóc da mụn', webUrl: 'https://example.com/product', mediaUrl: 'https://example.com/media' }] };
      if (url.pathname === '/api/chrome/generate-single-image') body = { jobId: ++state.jobId, message: 'Đã nhận yêu cầu tạo ảnh' };
      if (url.pathname === '/api/chrome/image-job') {
        state.polls++;
        body = { id: state.jobId, status: state.job, savedPath: `D:\\Products\\Sản phẩm mẫu\\${state.jobId}.png` };
      }
      if (url.pathname === '/api/notion/sync') body = { contentPageUrl: 'https://www.notion.so/example' };
      return route.fulfill({ json: body });
    });
    await page.goto('http://npc.test');
    await page.waitForFunction(() => document.querySelector('#drive-parent').value === 'D:\\Products' && !document.querySelector('.btn-generate-single').disabled);
    return { page, state };
  }

  await t.test('12 preset categories preserve the string payload and cache reset default', async () => {
    const { page, state } = await fixture();
    try {
      assert.deepEqual(await page.locator('#prod-category option').allTextContents(), categories);
      assert.equal(await page.locator('#prod-category').inputValue(), 'Trị mụn');
      for (const category of categories) await page.locator('#prod-category').selectOption({ label: category });
      await page.locator('#prod-category').selectOption({ label: 'Chống Nắng' });
      await page.locator('#prod-name').fill('Sản phẩm mẫu');
      await page.locator('#btn-generate-content').click();
      await page.waitForFunction(() => document.querySelector('#article-content').value.startsWith('# Bài viết'));
      const submitted = state.requests.find(request => request.route === '/api/openai/generate-content');
      assert.equal(submitted.body.category, 'Chống Nắng');
      assert.equal(submitted.body.productName, 'Sản phẩm mẫu');
      await page.locator('#btn-clear-product-cache').click();
      await page.locator('#completion-modal').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#prod-category').inputValue(), 'Trị mụn');
      assert.equal(await page.locator('#product-drive-url').inputValue(), sampleConfig.googleDriveParentUrl);
      assert.deepEqual(state.errors, []);
    } finally { await page.close(); }
  });

  await t.test('settings and theme persist, tabs preserve drafts, keyboard opens prompts and image picker', async () => {
    const { page, state } = await fixture();
    try {
      assert.equal(await page.locator('#system-config-body').isVisible(), false);
      assert.ok(await page.locator('#btn-toggle-system-config').evaluate(el => el.getBoundingClientRect().height >= 44));
      await page.locator('#btn-toggle-system-config').click();
      assert.equal(await page.locator('#system-config-body').isVisible(), true);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#drive-parent').value !== '');
      assert.equal(await page.locator('#system-config-body').isVisible(), true);
      await page.locator('#btn-toggle-system-config').click();
      await page.locator('#article-content').fill('Bản nháp website cần giữ');
      await page.locator('[data-product-tab="facebook"]').click();
      await page.locator('#facebook-content').fill('Bản nháp Facebook cần giữ');
      await page.locator('.facebook-prompt-manager summary').click();
      await page.locator('#facebook-prompt-content').fill('Prompt do content chỉnh sửa');
      await page.locator('[data-product-tab="website"]').click();
      assert.equal(await page.locator('#article-content').inputValue(), 'Bản nháp website cần giữ');
      await page.locator('[data-product-tab="facebook"]').click();
      assert.equal(await page.locator('#facebook-content').inputValue(), 'Bản nháp Facebook cần giữ');
      assert.equal(await page.locator('#facebook-prompt-content').inputValue(), 'Prompt do content chỉnh sửa');
      await page.locator('[data-product-tab="website"]').click();
      for (let i = 1; i <= 4; i++) {
        await page.locator(`#prompt-header-${i}`).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.locator(`#prompt-header-${i}`).getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator(`#prompt-content-${i}`).isVisible(), true);
        await page.keyboard.press('Space');
        assert.equal(await page.locator(`#prompt-content-${i}`).isVisible(), false);
      }
      const chooser = page.waitForEvent('filechooser');
      await page.locator('#dropzone-text').focus();
      await page.keyboard.press('Enter');
      await chooser;
      await page.locator('#btn-theme-toggle').click();
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('light-mode')), false);
      await page.reload();
      await page.waitForFunction(() => document.querySelector('#drive-parent').value !== '');
      assert.equal(await page.locator('body').evaluate(el => el.classList.contains('light-mode')), false);
      assert.equal(await page.locator('#system-config-body').isVisible(), false);
      assert.deepEqual(state.errors, []);
    } finally { await page.close(); }
  });

  await t.test('each image 1–4 reports success only after matching job completion and keeps single-prompt flow', async () => {
    const { page, state } = await fixture();
    try {
      await page.locator('#prod-name').fill('Sản phẩm mẫu');
      for (let i = 1; i <= 4; i++) {
        state.job = 'running';
        const previousPolls = state.polls;
        const button = page.locator(`.btn-generate-single[data-index="${i}"]`);
        await button.click();
        await page.waitForResponse(response => response.url().endsWith('/api/chrome/image-job'));
        assert.ok(state.polls > previousPolls);
        assert.equal(await page.locator('#completion-modal').isVisible(), false);
        assert.equal(await button.getAttribute('aria-busy'), 'true');
        assert.equal(await page.locator('.btn-generate-single:disabled').count(), 4);
        state.job = 'completed';
        await page.locator('#completion-modal').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#completion-title').textContent(), `Đã lưu ảnh ${i}`);
        assert.match(await page.locator('#completion-message').textContent(), new RegExp(`${i}\\.png`));
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-close-completion');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.id), `prompt-header-${i}`);
        const submissions = state.requests.filter(request => request.route === '/api/chrome/generate-single-image');
        assert.equal(submissions.length, i, 'must not auto-submit next prompt');
        assert.equal(submissions[i - 1].body.promptIndex, String(i));
        if (i > 1) assert.equal(submissions[i - 1].body.referenceImage, null);
      }
      assert.deepEqual(state.errors, []);
    } finally { await page.close(); }
  });

  await t.test('failed article creation keeps user draft; Notion feedback matches existing workflow', async () => {
    const { page, state } = await fixture();
    try {
      await page.locator('#prod-name').fill('Sản phẩm mẫu');
      await page.locator('#article-content').fill('Bản nháp phải được giữ khi mạng lỗi');
      state.contentError = true;
      await page.locator('#btn-generate-content').click();
      await page.waitForFunction(() => !document.querySelector('#btn-generate-content').disabled);
      assert.equal(await page.locator('#article-content').inputValue(), 'Bản nháp phải được giữ khi mạng lỗi');
      await page.locator('#btn-push-notion').click();
      await page.locator('#completion-modal').waitFor({ state: 'visible' });
      assert.match(await page.locator('#completion-message').textContent(), /Content đang làm; Facebook: Chưa đăng/);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'completion-notion-link');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-close-completion');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'btn-push-notion');
      assert.deepEqual(state.errors, []);
    } finally { await page.close(); }
  });

  await t.test('both themes and panels fit 375–1920px including expanded settings and prompts', async () => {
    const { page, state } = await fixture();
    try {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => document.body.classList.toggle('light-mode', theme === 'light'), theme);
        const ratios = await page.evaluate(() => {
          const style = getComputedStyle(document.body);
          const luminance = token => {
            const hex = style.getPropertyValue(token).trim().slice(1);
            const rgb = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
              .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
            return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
          };
          return [['--text', '--surface'], ['--text-muted', '--surface-subtle'], ['--primary', '--primary-soft'], ['--on-primary', '--primary']]
            .map(([fg, bg]) => {
              const [a, b] = [luminance(fg), luminance(bg)];
              return { fg, bg, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
            });
        });
        for (const pair of ratios) assert.ok(pair.ratio >= 4.5, `${theme} ${pair.fg}/${pair.bg}: ${pair.ratio}`);
        for (const width of [375, 768, 1024, 1320, 1920]) {
          await page.setViewportSize({ width, height: width === 768 ? 375 : 880 });
          for (const panel of ['website', 'facebook']) {
            await page.locator(`[data-product-tab="${panel}"]`).click();
            if (panel === 'facebook') await page.locator('.facebook-pending-product').waitFor();
            await page.evaluate(() => {
              document.querySelector('#system-config-body').hidden = false;
              document.querySelector('#system-config-card').classList.remove('is-collapsed');
              document.querySelector('.facebook-prompt-manager').open = true;
              for (const element of document.querySelectorAll('.prompt-collapse-content')) element.style.display = 'block';
            });
            const overflow = await page.evaluate(() => {
              const width = document.documentElement.clientWidth;
              return [...document.querySelectorAll('input, select, textarea, button, .card')]
                .filter(el => el.getClientRects().length && (el.getBoundingClientRect().right > width + 1 || el.getBoundingClientRect().left < -1))
                .map(el => el.id || el.className);
            });
            assert.deepEqual(overflow, [], `${theme} ${panel} ${width}px`);
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${panel} page overflow at ${width}`);
          }
        }
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal(await page.locator('.system-config-chevron').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
      const ids = await page.locator('[id]').evaluateAll(elements => elements.map(el => el.id));
      assert.equal(ids.length, new Set(ids).size, 'no duplicate IDs');
      assert.deepEqual(state.errors, []);
      if (process.env.NPC_UI_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.NPC_UI_SCREENSHOT_DIR, { recursive: true });
        await page.setViewportSize({ width: 1320, height: 980 });
        await page.evaluate(() => {
          document.querySelector('#system-config-body').hidden = true;
          document.querySelector('#system-config-card').classList.add('is-collapsed');
          document.querySelector('.facebook-prompt-manager').open = false;
          document.querySelectorAll('.prompt-collapse-content').forEach(el => { el.style.display = 'none'; });
        });
        for (const panel of ['website', 'facebook']) {
          await page.locator(`[data-product-tab="${panel}"]`).click();
          for (const theme of ['light', 'dark']) {
            await page.evaluate(theme => {
              document.body.classList.toggle('light-mode', theme === 'light');
              document.querySelector('#btn-theme-toggle').textContent = theme === 'light' ? 'Giao diện tối' : 'Giao diện sáng';
              window.scrollTo(0, 0);
            }, theme);
            await page.screenshot({ path: path.join(process.env.NPC_UI_SCREENSHOT_DIR, `${panel}-${theme}.png`), fullPage: true });
          }
        }
      }
    } finally { await page.close(); }
  });
});
