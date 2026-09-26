const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { existsSync } = require('node:fs');
const { chromium } = require('playwright');
const { getChatGptConversationTurns, selectNewAssistantImage, saveChatGptImage } = require('../lib/chatgpt-generated-image');

test('detects the result, ignores user uploads and saves exactly the selected numbered PNG', async t => {
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
  await saveChatGptImage(page.context(), selected.image, selected.src, path.join(folder, '1.png'));
  assert.deepEqual(await fs.readdir(folder), ['1.png']);
  const bytes = await fs.readFile(path.join(folder, '1.png'));
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(bytes.readUInt32BE(20), 512);
  const preview = await page.context().newPage();
  await preview.setContent(`<img src="data:image/png;base64,${bytes.toString('base64')}">`);
  assert.equal(await preview.locator('img').evaluate(async img => { await img.decode(); return img.naturalWidth; }), 512);

  await assert.rejects(saveChatGptImage(context, selected.image, selected.src, path.join(folder, 'missing-directory', '2.png')), /ENOENT/);

  await page.setContent(`<article aria-label="You said:"><img alt="Generated image" src="${png}"></article><div contenteditable="true"><img src="${png}"></div>`);
  await page.waitForFunction(() => [...document.images].every(img => img.complete));
  assert.equal(selectNewAssistantImage(await getChatGptConversationTurns(page), new Set()), null);

  // Reproduce the newer DOM: no author-role/alt, role is held in data-turn.
  await page.setContent(`<article data-turn="user"><img src="${png}"></article><article data-turn="assistant"><canvas width="512" height="512"></canvas></article>`);
  await page.locator('canvas').evaluate(canvas => { canvas.getContext('2d').fillRect(0, 0, 512, 512); });
  let result = selectNewAssistantImage(await getChatGptConversationTurns(page), new Set());
  assert.ok(result, 'canvas result with data-turn must be detected');
  await saveChatGptImage(context, result.image, result.src, path.join(folder, '2.png'));
  await page.setContent(`<article data-turn="assistant"><div role="img" style="width:512px;height:512px;background-image:url('${png}')"></div></article>`);
  result = selectNewAssistantImage(await getChatGptConversationTurns(page), new Set());
  assert.ok(result, 'CSS image result must be detected');
  await saveChatGptImage(context, result.image, result.src, path.join(folder, '3.png'));
  await page.setContent(`<article data-turn="user"><canvas width="512" height="512"></canvas><img alt="Generated image" src="${png}"></article>`);
  assert.equal(selectNewAssistantImage(await getChatGptConversationTurns(page), new Set()), null);
});
