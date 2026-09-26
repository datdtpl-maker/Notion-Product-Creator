const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { chromium } = require('playwright');
const { getChatGptConversationTurns, selectNewAssistantImage, saveChatGptImage } = require('../lib/chatgpt-generated-image');
const { runImageSequence } = require('../lib/image-sequence');

test('detects new article image, ignores user uploads and saves numbered PNGs before continuing', async t => {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-save-'));
  t.after(async () => { await browser.close(); await fs.rm(folder, { recursive: true, force: true }); });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent('<main><article data-testid="conversation-turn-0" data-message-author-role="user"></article><article id="old" aria-label="ChatGPT said:"></article></main>');
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    canvas.getContext('2d').fillRect(0, 0, 512, 512);
    return canvas.toDataURL('image/png');
  });
  await page.locator('article').evaluateAll((articles, png) => articles.forEach(article => { const img = document.createElement('img'); img.src = png; article.append(img); }), png);
  await page.waitForFunction(() => [...document.images].every(img => img.complete));
  const baseline = new Set((await getChatGptConversationTurns(page)).map(turn => turn.turnKey));
  assert.equal(selectNewAssistantImage(await getChatGptConversationTurns(page), baseline), null);
  // Mixed DOM: only the old user turn has a test ID; new results use articles.
  await page.evaluate(async png => {
    const article = document.createElement('article'); article.id = 'new'; article.setAttribute('aria-label', 'ChatGPT said:');
    const img = document.createElement('img'); img.alt = 'Generated image'; img.src = URL.createObjectURL(await (await fetch(png)).blob());
    article.append(img); document.querySelector('main').append(article); await img.decode();
  }, png);
  // The former first-choice selector sees only the user turn in this DOM.
  assert.equal(await page.locator('[data-testid^="conversation-turn-"]').count(), 1);
  assert.equal(await page.locator('[data-testid^="conversation-turn-"][data-message-author-role="assistant"]').count(), 0);
  const selected = selectNewAssistantImage(await getChatGptConversationTurns(page), baseline);
  assert.ok(selected);
  const generated = [];
  const completed = await runImageSequence(['one', 'two', 'three', 'four'], 1, async index => {
    if (index > 1) assert.ok((await fs.stat(path.join(folder, `${index - 1}.png`))).size > 0);
    generated.push(index);
    const destination = path.join(folder, `${index}.png`);
    await saveChatGptImage(page.context(), selected.image, selected.src, destination);
    return destination;
  });
  assert.deepEqual(completed, [1, 2, 3, 4]);
  assert.deepEqual(generated, [1, 2, 3, 4]);
  const bytes = await fs.readFile(path.join(folder, '1.png'));
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(bytes.readUInt32BE(20), 512);
  const preview = await page.context().newPage();
  await preview.setContent(`<img src="data:image/png;base64,${bytes.toString('base64')}">`);
  assert.equal(await preview.locator('img').evaluate(async img => { await img.decode(); return img.naturalWidth; }), 512);

  const attempted = [];
  await assert.rejects(runImageSequence(['one', 'two', 'three'], 2, async index => {
    attempted.push(index); throw new Error('disk full');
  }), /disk full/);
  assert.deepEqual(attempted, [2]);
  const invalid = path.join(folder, 'invalid.png');
  await fs.writeFile(invalid, '<html>not image</html>');
  await assert.rejects(runImageSequence(['one', 'two'], 1, async () => invalid), /PNG hợp lệ/);

  await page.setContent(`<article aria-label="You said:"><img alt="Generated image" src="${png}"></article><div contenteditable="true"><img src="${png}"></div>`);
  await page.waitForFunction(() => [...document.images].every(img => img.complete));
  assert.equal(selectNewAssistantImage(await getChatGptConversationTurns(page), new Set()), null);
});
