const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { getChatGptConversationTurns, saveChatGptImage } = require('../lib/chatgpt-generated-image');
const { createImageRequestTracker } = require('../lib/chatgpt-image-request');

const prompt = 'Tạo ảnh vuông sản phẩm Vitamin K. Giữ đúng nhãn sản phẩm và logo.';

async function fixture(t) {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: '<main><div id="messages"></div><form><textarea id="prompt-textarea"></textarea></form></main>' }));
  await page.goto('https://chatgpt.com/c/product-a');
  return page;
}

async function addPlainTurns(page, text = prompt) {
  await page.evaluate(text => {
    const user = document.createElement('div');
    const paragraph = document.createElement('p'); paragraph.textContent = text;
    user.append(paragraph);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = 'blue'; ctx.fillRect(0, 0, 512, 512);
    const reference = document.createElement('img'); reference.src = canvas.toDataURL(); reference.alt = 'Ảnh đã tạo';
    user.append(reference);
    const answer = document.createElement('div');
    const figure = document.createElement('figure');
    ctx.fillStyle = `rgb(${200 + document.images.length},0,0)`; ctx.fillRect(0, 0, 512, 512);
    const result = document.createElement('img'); result.src = canvas.toDataURL();
    const edit = document.createElement('button'); edit.textContent = 'Chỉnh sửa';
    const download = document.createElement('button'); download.setAttribute('aria-label', 'Tải xuống');
    const feedback = document.createElement('button'); feedback.setAttribute('aria-label', 'Good response');
    figure.append(result, edit, download); answer.append(figure, feedback);
    document.querySelector('#messages').append(user, answer);
  }, text);
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
}

test('recognizes prompt and completed image without article/test-id/author-role markers', async t => {
  const page = await fixture(t);
  await addPlainTurns(page);
  const turns = await getChatGptConversationTurns(page, { promptText: prompt });
  assert.equal(turns.length, 2, 'visible prompt + image result must not be reported as 0 turns');
  assert.equal(turns[0].authorRole, 'user');
  assert.equal(turns[0].images.length, 0, 'uploaded reference is never an output');
  assert.equal(turns[1].authorRole, 'assistant');
  assert.equal(turns[1].images.length, 1);
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-request-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  await saveChatGptImage(page.context(), turns[1].images[0].image, turns[1].images[0].src, path.join(folder, '1.png'));
  assert.deepEqual(await fs.readdir(folder), ['1.png']);
});

test('generic conversation-turn test ids do not collapse distinct turns into one key', async t => {
  const page = await fixture(t);
  await page.locator('#messages').evaluate(el => {
    el.innerHTML = '<div data-testid="conversation-turn"><h5>You said:</h5><p>First prompt</p></div><div data-testid="conversation-turn"><h6>ChatGPT said:</h6><canvas width="512" height="512"></canvas></div>';
  });
  const turns = await getChatGptConversationTurns(page);
  assert.equal(turns.length, 2);
  assert.notEqual(turns[0].turnKey, turns[1].turnKey);
  assert.equal(turns[1].images.length, 1);
});

test('recognizes a direct canvas result with edit/share controls in a plain reply', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await page.locator('#messages').evaluate((element, prompt) => {
    const user = document.createElement('div'); user.id = 'request-1'; user.textContent = prompt;
    const assistant = document.createElement('div'); assistant.id = 'result-1';
    assistant.innerHTML = '<canvas width="512" height="512"></canvas><button>Chỉnh sửa</button><button aria-label="Chia sẻ"></button><button aria-label="Good response"></button>';
    element.append(user, assistant);
  }, prompt);
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready', JSON.stringify(result));
  await result.candidate.image.dispose();
});

test('tracks the exact sent prompt, ignores earlier results and saves only its completed image', async t => {
  const page = await fixture(t);
  await addPlainTurns(page, 'An earlier different prompt');
  const tracker = await createImageRequestTracker(page, prompt);
  assert.equal((await tracker.poll()).phase, 'awaiting-prompt');
  await addPlainTurns(page);
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready');
  assert.equal(result.conversationId, 'product-a');
  await tracker.validateCandidate(result.candidate);
  await result.candidate.image.dispose();
});

test('does not treat an old identical prompt as a new send', async t => {
  const page = await fixture(t);
  await addPlainTurns(page);
  const tracker = await createImageRequestTracker(page, prompt);
  assert.equal((await tracker.poll()).phase, 'awaiting-prompt');
  await addPlainTurns(page);
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready');
  await result.candidate.image.dispose();
});

test('rejects a different conversation in the same locked browser tab', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addPlainTurns(page);
  await page.evaluate(() => history.pushState({}, '', '/c/product-b'));
  await assert.rejects(tracker.poll(), { code: 'CHATGPT_REQUEST_MISMATCH' });
});

test('rejects another prompt and refuses commit if navigation happens during download', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addPlainTurns(page);
  const result = await tracker.poll();
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-save-guard-'));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const output = path.join(folder, '1.png');
  await fs.writeFile(output, 'existing image must survive');
  await assert.rejects(saveChatGptImage(page.context(), result.candidate.image, result.candidate.src, output, {
    beforeCommit: async () => {
      await page.evaluate(() => history.pushState({}, '', '/c/product-b'));
      await tracker.validateCandidate(result.candidate);
    }
  }), { code: 'CHATGPT_REQUEST_MISMATCH' });
  assert.equal(await fs.readFile(output, 'utf8'), 'existing image must survive');
  assert.deepEqual(await fs.readdir(folder), ['1.png']);
  await page.evaluate(() => history.pushState({}, '', '/c/product-a'));
  await addPlainTurns(page, 'Another user request');
  await assert.rejects(tracker.poll(), { code: 'CHATGPT_REQUEST_MISMATCH' });
  await result.candidate.image.dispose();
});

test('permits a new chat to acquire its conversation ID, but then locks that ID', async t => {
  const page = await fixture(t);
  await page.evaluate(() => history.pushState({}, '', '/'));
  const tracker = await createImageRequestTracker(page, prompt);
  await addPlainTurns(page);
  await page.evaluate(() => history.pushState({}, '', '/c/new-product'));
  const result = await tracker.poll();
  assert.equal(result.conversationId, 'new-product');
  await result.candidate.image.dispose();
  await page.evaluate(() => history.pushState({}, '', '/c/another-product'));
  await assert.rejects(tracker.poll(), { code: 'CHATGPT_REQUEST_MISMATCH' });
});

test('waits for generation completion instead of saving an in-progress preview', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await page.locator('#messages').evaluate((el, prompt) => {
    el.innerHTML = '<article data-turn="user"></article><article data-turn="assistant"><canvas width="512" height="512"></canvas><div aria-busy="true"></div></article>';
    el.firstChild.textContent = prompt;
  }, prompt);
  assert.equal((await tracker.poll()).phase, 'awaiting-image');
  await page.locator('[aria-busy]').evaluate(el => el.remove());
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready');
  await result.candidate.image.dispose();
});

test('ignores an uploaded image wrapped after the prompt even if its alt says Generated image', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await page.locator('#messages').evaluate((el, prompt) => {
    const user = document.createElement('div');
    const p = document.createElement('p'); p.textContent = prompt;
    const attachment = document.createElement('div');
    attachment.innerHTML = '<canvas width="512" height="512" aria-label="Generated image"></canvas><button>Chỉnh sửa</button><button aria-label="Tải xuống"></button>';
    user.append(p, attachment); el.append(user);
  }, prompt);
  const result = await tracker.poll();
  assert.equal(result.phase, 'awaiting-image');
  assert.equal(result.candidate, undefined);
});

test('refuses two new identical prompts instead of silently selecting the last result', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addPlainTurns(page);
  await addPlainTurns(page);
  await assert.rejects(tracker.poll(), { code: 'CHATGPT_REQUEST_MISMATCH' });
});

test('survives React replacing an unmarked user bubble but retries a replaced output before commit', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await addPlainTurns(page);
  const first = await tracker.poll();
  assert.equal(first.phase, 'image-ready');
  await page.locator('#messages > div').first().evaluate(element => element.replaceWith(element.cloneNode(true)));
  await page.locator('#messages > div').last().evaluate(element => element.replaceWith(element.cloneNode(true)));
  await assert.rejects(tracker.validateCandidate(first.candidate), { code: 'CHATGPT_IMAGE_CHANGED' });
  const second = await tracker.poll();
  assert.equal(second.phase, 'image-ready');
  await tracker.validateCandidate(second.candidate);
  await first.candidate.image.dispose();
  await second.candidate.image.dispose();
});

test('identifies a headerless user turn by its exact submitted prompt and diagnostics contain no content', async t => {
  const page = await fixture(t);
  const tracker = await createImageRequestTracker(page, prompt);
  await page.locator('#messages').evaluate((el, prompt) => {
    el.innerHTML = '<div data-testid="conversation-turn"></div><div data-testid="conversation-turn"><h6>ChatGPT said:</h6><canvas width="512" height="512"></canvas></div>';
    el.firstChild.textContent = prompt;
  }, prompt);
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready');
  assert.deepEqual(Object.keys(await tracker.diagnostics()).sort(), ['canvases', 'frames', 'mainRoots', 'readyImageElements', 'turnMarkers']);
  await result.candidate.image.dispose();
});

test('matches multiline Vietnamese prompts rendered as separate rich-text paragraphs', async t => {
  const page = await fixture(t);
  const multiline = 'Ảnh sản phẩm Vitamin K\n\nGiữ nguyên nhãn và logo\nKhông che chữ';
  const tracker = await createImageRequestTracker(page, multiline);
  await addPlainTurns(page, multiline);
  await page.locator('#messages > div').first().evaluate((element, text) => {
    element.replaceChildren(...text.split('\n').filter(Boolean).map(line => {
      const paragraph = document.createElement('p'); paragraph.textContent = line; return paragraph;
    }));
  }, multiline);
  const result = await tracker.poll();
  assert.equal(result.phase, 'image-ready');
  await result.candidate.image.dispose();
});
