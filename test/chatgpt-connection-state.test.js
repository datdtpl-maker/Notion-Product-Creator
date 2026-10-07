const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { existsSync } = require('node:fs');
const { chromium } = require('playwright');
const { inspectChatGptState, observeChatGptConnection, createConnectionHistory, networkCategory } = require('../lib/chatgpt-connection-state');

test('real browser distinguishes verification, login, auth error and a ready editor without changing the page', async t => {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<main></main>' }));
  await page.goto('https://chatgpt.com/');
  await page.setContent('<title>Chờ một chút...</title><div>Xác minh bạn là con người</div><textarea id="prompt-textarea"></textarea>');
  assert.deepEqual(await inspectChatGptState(page), { state: 'verification_required', ready: false });
  await page.setContent('<title>ChatGPT</title><iframe src="https://challenges.cloudflare.com/widget"></iframe><textarea id="prompt-textarea"></textarea>');
  assert.equal((await inspectChatGptState(page)).state, 'verification_required');
  await page.locator('iframe').evaluate(el => { el.style.display = 'none'; });
  assert.equal((await inspectChatGptState(page)).state, 'ready', 'hidden old challenge cannot block a ready editor');
  await page.locator('title').evaluate(el => { el.textContent = 'Xác minh thông tin sản phẩm'; });
  assert.equal((await inspectChatGptState(page)).state, 'ready', 'conversation titles are not verification evidence');
  await page.setContent('<title>ChatGPT</title><button data-testid="login-button">Log in</button><textarea id="prompt-textarea"></textarea>');
  assert.equal((await inspectChatGptState(page)).state, 'login_required');
  await page.goto('https://auth.openai.com/log-in/password?code=SECRET-CODE');
  await page.setContent('<title>OpenAI</title><div>Oops, an error occurred! Invalid content type: text/html</div>');
  assert.equal((await inspectChatGptState(page)).state, 'auth_error');
  await page.setContent('<title>OpenAI</title><input type="password" value="PRIVATE-PASSWORD">');
  assert.equal((await inspectChatGptState(page)).state, 'login_required');
  const before = page.url();
  const report = await observeChatGptConnection(page, { samples: 2, intervalMs: 0 });
  assert.equal(page.url(), before);
  assert.equal(browser.contexts()[0].pages().length, 1);
  assert.equal(await page.locator('input').inputValue(), 'PRIVATE-PASSWORD');
  assert.ok(report.states.every(s => s.state === 'login_required'));
  assert.doesNotMatch(JSON.stringify(report), /SECRET|PRIVATE|password|auth\.openai/);
});

test('network diagnostic allows only categories/status codes, not URLs, response bodies or error strings', async () => {
  const page = new EventEmitter();
  page.url = () => 'https://chatgpt.com/c/PRIVATE-CONVERSATION';
  page.title = async () => 'Just a moment...';
  page.isClosed = () => false;
  const failIfRead = () => { throw new Error('Must not read headers, bodies or credentials'); };
  const report = await observeChatGptConnection(page, { samples: 2, wait: async () => {
    page.emit('response', { url: () => 'https://challenges.cloudflare.com/cdn-cgi/PRIVATE-ID?token=SECRET-TOKEN', status: () => 403, body: failIfRead, headers: failIfRead });
    page.emit('response', { url: () => 'https://auth.openai.com/login?email=PRIVATE-EMAIL', status: () => 400, body: failIfRead });
    page.emit('response', { url: () => 'https://unrelated.example/PRIVATE', status: () => 500 });
    page.emit('requestfailed', { url: () => 'https://chatgpt.com/c/PRIVATE-CONVERSATION', failure: () => ({ errorText: 'arbitrary SECRET-TOKEN' }) });
  } });
  assert.deepEqual(report.network.map(({ elapsedMs, ...event }) => event), [
    { category: 'verification', status: 403 }, { category: 'authentication', status: 400 }, { category: 'chatgpt', error: 'NETWORK_REQUEST_FAILED' }
  ]);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE|SECRET|https|token|email/i);
  assert.equal(page.listenerCount('response'), 0);
  assert.equal(page.listenerCount('requestfailed'), 0);
});

test('diagnostics are bounded and always detach observers on error', async () => {
  const page = new EventEmitter();
  page.url = () => 'https://chatgpt.com/'; page.title = async () => 'Just a moment...'; page.isClosed = () => false;
  const report = await observeChatGptConnection(page, { samples: 2, wait: async () => {
    for (let i = 0; i < 100; i++) page.emit('response', { url: () => 'https://chatgpt.com/', status: () => 200 });
  } });
  assert.equal(report.network.length, 50);
  assert.equal(report.truncated, true);
  await assert.rejects(observeChatGptConnection(page, { samples: 2, wait: async () => { throw new Error('cancelled'); } }), /cancelled/);
  assert.equal(page.listenerCount('response'), 0);
  assert.equal(page.listenerCount('requestfailed'), 0);
});

test('diagnostic history accepts only known actions/states and keeps the last twenty', () => {
  const history = createConnectionHistory();
  history.record('secret-token', 'loading');
  history.record('check', 'private-email');
  assert.deepEqual(history.snapshot(), []);
  for (let i = 0; i < 25; i++) history.record('check', 'verification_required');
  assert.equal(history.snapshot().length, 20);
  const snapshot = history.snapshot(); snapshot[0].state = 'PRIVATE';
  assert.equal(history.snapshot()[0].state, 'verification_required');
  assert.equal(networkCategory('https://chatgpt.com.evil.test/'), null);
  assert.equal(networkCategory('http://chatgpt.com/'), null);
  assert.equal(networkCategory('https://chatgpt.com/cdn-cgi/test?secret=yes'), 'verification');
});
