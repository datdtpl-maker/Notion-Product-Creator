const assert = require('node:assert/strict');
const test = require('node:test');
const { chromium } = require('playwright');
const { existsSync } = require('node:fs');
const { ensureChatGptComposer, fillChatGptPrompt, isChatGptPage } = require('../lib/chatgpt-composer');

test('ChatGPT composer selection and editing in a real browser', async t => {
  const browser = await chromium.launch({ ...(existsSync(chromium.executablePath()) ? {} : { channel: 'chrome' }), headless: true });
  t.after(() => browser.close());
  async function fixture(context, url, html) {
    const page = await context.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: html }));
    await page.goto(url);
    return page;
  }
  async function contextFor(t) {
    const context = await browser.newContext();
    t.after(() => context.close());
    return context;
  }
  const options = { timeoutMs: 250, pollMs: 20, allowNewChat: false };

  await t.test('old first-tab selector times out while fallback finds the usable tab', async t => {
    const context = await contextFor(t);
    const oldTab = await fixture(context, 'https://chatgpt.com/auth/login', '<button data-testid="login-button">Log in</button>');
    const readyTab = await fixture(context, 'https://chatgpt.com/c/fixture', '<form><div contenteditable="true" role="textbox">old text</div></form>');
    await assert.rejects(oldTab.waitForSelector('#prompt-textarea', { timeout: 100 }), /Timeout/);
    const result = await ensureChatGptComposer(browser, options);
    assert.equal(result.page, readyTab);
    await fillChatGptPrompt(result.editor, 'Sản phẩm mới\nDòng thứ hai có dấu');
    assert.equal(await result.editor.innerText(), 'Sản phẩm mới\nDòng thứ hai có dấu');
  });
  await t.test('hidden old input is ignored and textarea is filled exactly', async t => {
    const context = await contextFor(t);
    await fixture(context, 'https://chatgpt.com/', '<textarea id="prompt-textarea" hidden></textarea><textarea name="prompt-textarea">cũ</textarea>');
    const result = await ensureChatGptComposer(browser, options);
    await fillChatGptPrompt(result.editor, 'Prompt 1 mới');
    assert.equal(await result.editor.inputValue(), 'Prompt 1 mới');
  });
  await t.test('continuation stays on the remembered conversation across contexts', async t => {
    const first = await contextFor(t);
    const second = await contextFor(t);
    const html = '<div id="prompt-textarea" contenteditable="true"></div>';
    await fixture(first, 'https://chatgpt.com/c/unrelated', html);
    const expected = await fixture(second, 'https://chatgpt.com/c/product', html);
    const result = await ensureChatGptComposer(browser, { ...options, preferredUrl: expected.url() });
    assert.equal(result.page, expected);
    assert.equal(result.context, second);
    await assert.rejects(ensureChatGptComposer(browser, { ...options, preferredUrl: 'https://chatgpt.com/c/closed' }), /Tab cuộc trò chuyện.*đã đóng/);
  });
  await t.test('login gate returns an actionable error', async t => {
    const context = await contextFor(t);
    await fixture(context, 'https://chatgpt.com/auth/login', '<button data-testid="login-button">Log in</button>');
    await assert.rejects(ensureChatGptComposer(browser, options), /đang yêu cầu đăng nhập/);
  });
  await t.test('verification gate returns an actionable error', async t => {
    const context = await contextFor(t);
    await fixture(context, 'https://chatgpt.com/', '<title>Just a moment...</title>');
    await assert.rejects(ensureChatGptComposer(browser, options), /xác minh bảo mật/);
  });
  await t.test('multiple ready tabs without focus cannot receive an arbitrary prompt', async t => {
    const context = await contextFor(t);
    const html = '<div id="prompt-textarea" contenteditable="true"></div><script>document.hasFocus = () => false;</script>';
    await fixture(context, 'https://chatgpt.com/c/a', html);
    await fixture(context, 'https://chatgpt.com/c/b', html);
    await assert.rejects(ensureChatGptComposer(browser, options), /Có nhiều tab ChatGPT/);
  });
});

test('only exact ChatGPT hosts are accepted', () => {
  assert.equal(isChatGptPage('https://chatgpt.com/c/a'), true);
  assert.equal(isChatGptPage('https://example.com/?chatgpt.com'), false);
  assert.equal(isChatGptPage('https://chatgpt.com.example.com/'), false);
});
