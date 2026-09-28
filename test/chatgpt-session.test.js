const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require('playwright');
const { readDebugEndpoint, bindChatGptSession, connectBoundChatGpt } = require('../lib/chatgpt-session');
const { ensureChatGptComposer } = require('../lib/chatgpt-composer');

test('CDP keeps the theme, verifies profile and uses only the bound tab', async t => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-profile-'));
  const port = await new Promise(resolve => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const port = server.address().port; server.close(() => resolve(port));
    });
  });
  const context = await chromium.launchPersistentContext(profile, {
    ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }),
    headless: true, colorScheme: 'dark', args: ['--enable-automation', `--remote-debugging-port=${port}`]
  });
  t.after(async () => { await context.close(); await fs.rm(profile, { recursive: true, force: true }); });
  await context.route('https://chatgpt.com/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="prompt-textarea" contenteditable="true"></div>' }));
  const page = context.pages()[0];
  await page.goto('https://chatgpt.com/c/locked');
  const dark = () => page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  assert.equal(await dark(), true);
  const endpoint = await readDebugEndpoint(port);
  // The former connection really changes the page to light.
  const oldConnection = await chromium.connectOverCDP(endpoint);
  assert.equal(await dark(), false);
  await oldConnection.close();
  await page.emulateMedia({ colorScheme: 'dark' });
  const binding = await bindChatGptSession(chromium, endpoint, profile);
  assert.equal(binding.ready, true);
  assert.equal(await dark(), true);
  await assert.rejects(bindChatGptSession(chromium, endpoint, `${profile}-different`), /profile khác/);
  const otherPage = await context.newPage();
  await otherPage.goto('https://chatgpt.com/c/other');
  await otherPage.bringToFront();
  await context.route('https://auth.openai.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Just a moment...</title>' }));
  await page.goto('https://auth.openai.com/login');
  const pendingLogin = await bindChatGptSession(chromium, endpoint, profile, binding);
  assert.equal(pendingLogin.targetId, binding.targetId, 'keep the bound auth tab even with another ChatGPT tab present');
  assert.equal(pendingLogin.ready, false);
  assert.equal(context.pages().length, 2);
  await assert.rejects(connectBoundChatGpt(chromium, port, pendingLogin), /chưa sẵn sàng/);
  await page.goto('https://chatgpt.com/c/locked');
  await page.setContent('<button data-testid="login-button">Log in</button><textarea id="prompt-textarea"></textarea>');
  assert.equal((await bindChatGptSession(chromium, endpoint, profile, binding)).ready, false, 'guest composer is not enough to enable image generation');
  await page.goto('https://chatgpt.com/c/locked');
  assert.equal((await bindChatGptSession(chromium, endpoint, profile, binding)).ready, true);
  let bound = await connectBoundChatGpt(chromium, port, binding);
  assert.equal(bound.page.url(), 'https://chatgpt.com/c/locked');
  const result = await ensureChatGptComposer(bound.browser, { preferredPage: bound.page, allowNewChat: false, timeoutMs: 500 });
  assert.equal(result.page.url(), 'https://chatgpt.com/c/locked');
  assert.equal(await dark(), true);
  await bound.browser.close();
  await assert.rejects(connectBoundChatGpt(chromium, port, { ...binding, endpoint: endpoint + '-different' }), /Phiên Chrome Debug đã thay đổi/);
  await page.close();
  await assert.rejects(connectBoundChatGpt(chromium, port, binding), /Tab ChatGPT đã khóa bị đóng/);
  assert.equal(context.pages().length, 1, 'must not create a replacement tab');
});
