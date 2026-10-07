const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureChromeManual } = require('../lib/chrome-debug-start');
const profileDir = '/Users/content/Library/Application Support/NotionProductCreator/chatgpt_profile';

function fixture(debug = true) {
  let open = true;
  const calls = [];
  return {
    calls,
    options: { port: 9222, profileDir, launch: async (...args) => { assert.equal(open, false); calls.push(['launch', ...args]); } },
    dependencies: {
      readEndpoint: async () => { if (debug) return 'ws://127.0.0.1:9222/fixture'; throw Object.assign(new Error('offline'), { code: 'CHROME_DEBUG_UNAVAILABLE' }); },
      isProfileOpen: async () => open,
      isDebugProfile: async () => debug,
      closeProfile: async dir => { calls.push(['close', dir]); open = false; }
    }
  };
}
test('returning to manual mode requires consent and leaves the browser alone until accepted', async () => {
  const f = fixture();
  await assert.rejects(ensureChromeManual(f.options, f.dependencies), { code: 'CHROME_PROFILE_RESTART_REQUIRED' });
  assert.deepEqual(f.calls, []);
});
test('confirmed recovery closes only the configured profile and launches it without debug flags', async () => {
  const f = fixture();
  const result = await ensureChromeManual({ ...f.options, restartProfile: true }, f.dependencies);
  assert.equal(result.state, 'manual');
  assert.deepEqual(f.calls, [['close', profileDir], ['launch', null, profileDir, 'https://chatgpt.com', false]]);
});
test('manual profile already open is reused without restart or debug attachment', async () => {
  const f = fixture(false);
  assert.equal((await ensureChromeManual(f.options, f.dependencies)).alreadyOpen, true);
  assert.deepEqual(f.calls, []);
});

test('an unrelated occupied Debug port cannot restart a manual profile or block recovery', async () => {
  const f = fixture(false);
  f.dependencies.readEndpoint = async () => { throw new Error('Must not inspect unrelated endpoint'); };
  assert.equal((await ensureChromeManual(f.options, f.dependencies)).alreadyOpen, true);
  assert.deepEqual(f.calls, []);
});
test('failed profile exit cannot open another window', async () => {
  const f = fixture();
  f.dependencies.closeProfile = async () => { throw new Error('not exited'); };
  await assert.rejects(ensureChromeManual({ ...f.options, restartProfile: true }, f.dependencies), /not exited/);
  assert.deepEqual(f.calls, []);
});
test('manual recovery still works when the Debug process exists but its port is unreachable', async () => {
  const f = fixture(false);
  f.dependencies.isDebugProfile = async () => true;
  await assert.rejects(ensureChromeManual(f.options, f.dependencies), { code: 'CHROME_PROFILE_RESTART_REQUIRED' });
  await ensureChromeManual({ ...f.options, restartProfile: true }, f.dependencies);
  assert.equal(f.calls[1][1], null);
});
test('a Debug endpoint with no configured profile cannot cause another profile to close', async () => {
  const f = fixture();
  f.dependencies.isProfileOpen = async () => false;
  f.options.launch = async (...args) => f.calls.push(['launch', ...args]);
  await ensureChromeManual(f.options, f.dependencies);
  assert.deepEqual(f.calls, [['launch', null, profileDir, 'https://chatgpt.com', false]]);
});

test('a bound Debug session missing from the process list blocks a new manual launch', async () => {
  const f = fixture();
  f.dependencies.isProfileOpen = async () => false;
  const binding = { profileDir, endpoint: 'ws://127.0.0.1:9222/fixture' };
  await assert.rejects(ensureChromeManual({ ...f.options, binding }, f.dependencies), { code: 'CHROME_PROFILE_PROCESS_UNAVAILABLE' });
  await assert.rejects(ensureChromeManual({ ...f.options, binding, restartProfile: true }, f.dependencies), { code: 'CHROME_PROFILE_PROCESS_UNAVAILABLE' });
  assert.deepEqual(f.calls, []);
});
