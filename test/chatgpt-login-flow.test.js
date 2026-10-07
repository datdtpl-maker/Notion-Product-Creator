const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { bindChatGptSession } = require('../lib/chatgpt-session');
const { manualLoginArgs, commandUsesProfile } = require('../lib/chrome-login');

function loginBrowser(url) {
  const profileDir = path.resolve('fixture-profile-not-created');
  let createdTabs = 0;
  const page = {
    url: () => url, isClosed: () => false,
    title: async () => 'Just a moment...',
    context: () => context, bringToFront: async () => {},
    evaluate: async () => true,
    locator: () => ({ count: async () => 0, isVisible: async () => false })
  };
  const context = {
    pages: () => [page],
    newPage: async () => { createdTabs++; throw new Error('Unexpected replacement tab'); },
    newCDPSession: async () => ({ send: async () => ({ targetInfo: { targetId: 'original' } }), detach: async () => {} })
  };
  const browser = {
    contexts: () => [context], close: async () => {},
    newBrowserCDPSession: async () => ({ send: async () => ({ arguments: [`--user-data-dir=${profileDir}`] }), detach: async () => {} })
  };
  return { profileDir, chromium: { connectOverCDP: async () => browser }, createdTabs: () => createdTabs };
}

test('binding during OpenAI login keeps the original tab and waits for manual login', async () => {
  const fixture = loginBrowser('https://auth.openai.com/login');
  const result = await bindChatGptSession(fixture.chromium, 'ws://127.0.0.1:9222/test', fixture.profileDir);
  assert.equal(fixture.createdTabs(), 0);
  assert.equal(result.targetId, 'original');
  assert.equal(result.ready, false);
  assert.equal(result.state, 'verification_required', 'verification must not be presented as generic loading');
});

test('startup blank tab is left alone instead of creating a replacement', async () => {
  const fixture = loginBrowser('about:blank');
  const result = await bindChatGptSession(fixture.chromium, 'ws://127.0.0.1:9222/test', fixture.profileDir);
  assert.equal(fixture.createdTabs(), 0);
  assert.equal(result.ready, false);
  assert.equal(result.state, 'loading');
});

test('manual sign-in launches the same profile without debugging or automation flags', () => {
  const profile = 'C:\\Users\\User Name\\ChatGPT profile';
  const args = manualLoginArgs(profile);
  assert.deepEqual(args, [`--user-data-dir=${profile}`, '--new-window', 'https://chatgpt.com']);
  assert.ok(!args.some(arg => /automation|remote-debugging|remote-allow-origins/.test(arg)));
});

test('profile process detection handles Windows quotes and macOS spaces without matching other profiles', () => {
  const win = 'C:\\Users\\User Name\\ChatGPT profile';
  for (const arg of [`--user-data-dir="${win}"`, `"--user-data-dir=${win}"`, `--user-data-dir=${win}`]) {
    assert.equal(commandUsesProfile(`chrome.exe ${arg} --new-window https://chatgpt.com`, win, 'win32'), true);
  }
  assert.equal(commandUsesProfile(`chrome.exe --user-data-dir="${win}-other"`, win, 'win32'), false);
  assert.equal(commandUsesProfile(`chrome.exe --type=renderer --user-data-dir="${win}"`, win, 'win32'), false);
  const mac = '/Users/content/Library/Application Support/NotionProductCreator/chatgpt_profile';
  assert.equal(commandUsesProfile(`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=${mac} --new-window https://chatgpt.com`, mac, 'darwin'), true);
  assert.equal(commandUsesProfile(`Google Chrome --user-data-dir=${mac}-other`, mac, 'darwin'), false);
});
