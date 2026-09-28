const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { chromium } = require('playwright');
const { createImageRequestTracker } = require('../lib/chatgpt-image-request');
const { saveChatGptImage } = require('../lib/chatgpt-generated-image');
const { addSearchLayoutTurn } = require('./fixtures/chatgpt-search-layout');

const prompt = 'Tạo ảnh vuông sản phẩm, prompt 1';

async function setup(t) {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: '<main><div id="messages"></div><form><textarea id="prompt-textarea"></textarea></form></main>' }));
  await page.goto('https://chatgpt.com/c/completion');
  return page;
}

test('Creating image at 31% with an unmarked canvas is not a completed image', async t => {
  const page = await setup(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addSearchLayoutTurn(page, prompt);
  await page.locator('[data-chatgpt-search-message-ids="assistant-1"]').evaluate(el => {
    el.innerHTML = '<div>Creating image</div><canvas width="1024" height="1024"></canvas><span>31%</span>';
    const button = document.createElement('button'); button.setAttribute('aria-label', 'Stop streaming');
    document.querySelector('form').append(button);
  });
  assert.equal((await tracker.poll()).phase, 'awaiting-image');
  await page.locator('button[aria-label="Stop streaming"]').evaluate(el => el.remove());
  assert.equal((await tracker.poll()).phase, 'awaiting-image', 'missing stop selector is not proof of completion');
});

test('a loaded preview cannot bypass visible progress or any visible stop button', async t => {
  const page = await setup(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addSearchLayoutTurn(page, prompt);
  await page.locator('[data-chatgpt-search-message-ids="assistant-1"]').evaluate(el => {
    const status = document.createElement('span'); status.innerHTML = 'Creating image<span>31%</span>'; el.prepend(status);
  });
  assert.equal((await tracker.poll()).phase, 'awaiting-image');
  await page.locator('[data-chatgpt-search-message-ids="assistant-1"] > span').evaluate(el => el.remove());
  await page.locator('form').evaluate(el => { el.insertAdjacentHTML('beforeend', '<button data-testid="stop-button" hidden></button><button aria-label="Stop streaming"></button>'); });
  assert.equal((await tracker.poll()).phase, 'awaiting-image', 'hidden first stop button must not hide a second visible one');
  await page.locator('form button').evaluateAll(buttons => buttons.forEach(button => button.remove()));
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready');
  await result.candidate.image.dispose();
});

test('a large image alone or an unfinished canvas with Edit/Share controls is not a final result', async t => {
  const page = await setup(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addSearchLayoutTurn(page, prompt);
  await page.locator('[data-chatgpt-search-message-ids="assistant-1"]').evaluate(el => {
    const img = el.querySelector('img');
    el.replaceChildren(img);
  });
  assert.equal((await tracker.poll()).phase, 'awaiting-image');
  await page.locator('[data-chatgpt-search-message-ids="assistant-1"]').evaluate(el => {
    el.innerHTML = '<div><canvas width="512" height="512"></canvas><button>Edit</button><button aria-label="Share"></button></div>';
  });
  assert.equal((await tracker.poll()).phase, 'awaiting-image');
});

test('rechecks generation before atomic save and preserves an existing numbered file', async t => {
  const page = await setup(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addSearchLayoutTurn(page, prompt);
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-completion-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const output = path.join(folder, '1.png');
  await fs.writeFile(output, 'previous good image');
  await assert.rejects(saveChatGptImage(page.context(), result.candidate.image, result.candidate.src, output, {
    beforeCommit: async () => {
      await page.locator('form').evaluate(el => el.insertAdjacentHTML('beforeend', '<button aria-label="Stop streaming"></button>'));
      await tracker.validateCandidate(result.candidate);
    }
  }), { code: 'CHATGPT_IMAGE_CHANGED' });
  assert.equal(await fs.readFile(output, 'utf8'), 'previous good image');
  assert.deepEqual(await fs.readdir(folder), ['1.png']);
  await result.candidate.image.dispose();
});

test('save rejects a transparent loading image rather than committing a blank PNG or screenshot', async t => {
  const page = await setup(t);
  await page.locator('#messages').evaluate(el => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const img = document.createElement('img'); img.src = canvas.toDataURL(); el.append(img);
  });
  const img = await page.$('img');
  await img.evaluate(el => el.decode());
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-blank-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const output = path.join(folder, '1.png');
  await fs.writeFile(output, 'previous good image');
  await assert.rejects(saveChatGptImage(page.context(), img, await img.getAttribute('src'), output), /trống|hoàn chỉnh/);
  assert.equal(await fs.readFile(output, 'utf8'), 'previous good image');
});
