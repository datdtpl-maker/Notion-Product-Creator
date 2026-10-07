const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { ensureChromeDebug } = require('../lib/chrome-debug-start');
const { readDebugEndpoint } = require('../lib/chatgpt-session');

const profileDir = '/Users/content/Library/Application Support/NotionProductCreator/chatgpt_profile';
const endpoint = 'ws://127.0.0.1:9222/devtools/browser/fixture';
function manualProfile() {
  let open = true;
  let debug = false;
  const actions = [];
  return {
    actions,
    launch: async (...args) => { assert.equal(open, false, 'must wait for the old process to exit'); actions.push(['launch', ...args]); debug = true; },
    dependencies: {
      readEndpoint: async () => { if (debug) return endpoint; throw Object.assign(new Error('fetch failed'), { code: 'CHROME_DEBUG_UNAVAILABLE' }); },
      isProfileOpen: async () => open,
      closeProfile: async dir => { assert.equal(dir, profileDir); actions.push(['close', dir]); open = false; },
      wait: async () => {}
    }
  };
}

test('manual profile requires explicit consent before any close or launch', async () => {
  const fixture = manualProfile();
  await assert.rejects(ensureChromeDebug({ port: 9222, profileDir, launch: fixture.launch }, fixture.dependencies), error => {
    assert.equal(error.code, 'CHROME_PROFILE_RESTART_REQUIRED');
    assert.match(error.message, /cookie/);
    return true;
  });
  assert.deepEqual(fixture.actions, []);
});

test('confirmed restart switches the same still-running manual profile to Debug', async () => {
  const fixture = manualProfile();
  assert.equal(await ensureChromeDebug({ port: 9222, profileDir, restartProfile: true, launch: fixture.launch }, fixture.dependencies), endpoint);
  assert.deepEqual(fixture.actions, [['close', profileDir], ['launch', 9222, profileDir, 'https://chatgpt.com', true]]);
});

test('a close failure must never launch another browser or profile', async () => {
  const fixture = manualProfile();
  fixture.dependencies.closeProfile = async () => { throw new Error('Profile chưa thoát'); };
  await assert.rejects(ensureChromeDebug({ port: 9222, profileDir, restartProfile: true, launch: fixture.launch }, fixture.dependencies), /Profile chưa thoát/);
  assert.deepEqual(fixture.actions, []);
});

test('already running Debug is reused without closing or opening any profile', async () => {
  const fixture = manualProfile();
  fixture.dependencies.readEndpoint = async () => endpoint;
  assert.equal(await ensureChromeDebug({ port: 9222, profileDir, restartProfile: true, launch: fixture.launch }, fixture.dependencies), endpoint);
  assert.deepEqual(fixture.actions, []);
});

test('non-boolean confirmation cannot close the profile', async () => {
  const fixture = manualProfile();
  await assert.rejects(ensureChromeDebug({ port: 9222, profileDir, restartProfile: 'true', launch: fixture.launch }, fixture.dependencies), { code: 'CHROME_PROFILE_RESTART_REQUIRED' });
  assert.deepEqual(fixture.actions, []);
});

test('an occupied non-Debug port never closes or launches a profile', async () => {
  const fixture = manualProfile();
  fixture.dependencies.readEndpoint = async () => { throw Object.assign(new Error('invalid endpoint'), { code: 'CHROME_DEBUG_INVALID' }); };
  await assert.rejects(ensureChromeDebug({ port: 9222, profileDir, restartProfile: true, launch: fixture.launch }, fixture.dependencies), { code: 'CHROME_DEBUG_INVALID' });
  assert.deepEqual(fixture.actions, []);
});

test('restart cannot launch if the profile is still running after close', async () => {
  const fixture = manualProfile();
  fixture.dependencies.closeProfile = async () => {};
  await assert.rejects(ensureChromeDebug({ port: 9222, profileDir, restartProfile: true, launch: fixture.launch }, fixture.dependencies), /chưa thoát/);
  assert.deepEqual(fixture.actions, []);
});

test('closed profile starts normally and waits for a real endpoint', async () => {
  const fixture = manualProfile();
  fixture.dependencies.isProfileOpen = async () => false;
  let launched = false;
  let probes = 0;
  fixture.dependencies.readEndpoint = async () => {
    if (launched && ++probes === 2) return endpoint;
    throw Object.assign(new Error('not listening'), { code: 'CHROME_DEBUG_UNAVAILABLE' });
  };
  const launch = async () => { launched = true; };
  assert.equal(await ensureChromeDebug({ port: 9222, profileDir, launch }, fixture.dependencies), endpoint);
  assert.equal(probes, 2);
  assert.deepEqual(fixture.actions, []);
});

test('missing endpoint after launch is reported without retrying launch', async () => {
  const fixture = manualProfile();
  fixture.dependencies.isProfileOpen = async () => false;
  let launches = 0;
  await assert.rejects(ensureChromeDebug({ port: 9222, profileDir, launch: async () => { launches++; } }, fixture.dependencies), /cổng Debug 9222 chưa phản hồi/);
  assert.equal(launches, 1);
});

test('unavailable Debug endpoint has actionable text instead of raw fetch failed', async () => {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  await assert.rejects(readDebugEndpoint(port), error => {
    assert.equal(error.code, 'CHROME_DEBUG_UNAVAILABLE');
    assert.match(error.message, new RegExp(String(port)));
    assert.match(error.message, /Kết nối Chrome Debug/);
    assert.equal(error.cause?.message, 'fetch failed');
    return true;
  });
});
