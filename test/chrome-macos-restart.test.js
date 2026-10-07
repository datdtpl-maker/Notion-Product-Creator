const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { ensureChromeDebug, ensureChromeManual } = require('../lib/chrome-debug-start');
const { isChromeProfileOpen, closeChromeProfile } = require('../lib/chrome-login');
const { readDebugEndpoint } = require('../lib/chatgpt-session');

test('macOS real Chrome restart preserves profile cookies and leaves another profile running', { skip: process.platform !== 'darwin', timeout: 60000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'npc-restart-test-'));
  const profileDir = path.join(root, 'Profile With Spaces');
  const otherDir = path.join(root, 'Other Profile');
  const contexts = [];
  t.after(async () => {
    await closeChromeProfile(profileDir);
    for (const context of contexts) await context.close().catch(() => {});
    await fs.rm(root, { recursive: true, force: true });
  });
  const launch = async (dir, args = []) => {
    const context = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: true, args });
    contexts.push(context);
    return context;
  };
  const original = await launch(profileDir);
  const other = await launch(otherDir);
  await original.addCookies([{ name: 'fixture-session', value: 'retain-me', domain: 'example.test', path: '/', expires: Math.floor(Date.now() / 1000) + 86400 }]);
  // Do not pre-flush with context.close(): a newly signed-in session must survive the actual exit path.
  assert.equal(await isChromeProfileOpen(profileDir), true);
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  await assert.rejects(readDebugEndpoint(port), { code: 'CHROME_DEBUG_UNAVAILABLE' });
  let restarted;
  const options = { port, profileDir, launch: async (debugPort, dir) => {
    assert.equal(dir, profileDir);
    restarted = await launch(dir, [`--remote-debugging-port=${debugPort}`]);
  } };
  await assert.rejects(ensureChromeDebug(options), { code: 'CHROME_PROFILE_RESTART_REQUIRED' });
  assert.equal(await isChromeProfileOpen(profileDir), true, 'no restart without consent');
  assert.match(await ensureChromeDebug({ ...options, restartProfile: true }), /^ws:\/\/127\.0\.0\.1:/);
  assert.equal((await restarted.cookies('https://example.test')).find(cookie => cookie.name === 'fixture-session')?.value, 'retain-me');
  assert.equal(await isChromeProfileOpen(otherDir), true);
  assert.equal(await other.pages()[0].evaluate(() => 2 + 2), 4, 'unrelated profile is still usable');
  const manual = { port, profileDir, launch: async (debugPort, dir, _url, verifyProfile) => {
    assert.equal(debugPort, null);
    assert.equal(verifyProfile, false);
    assert.equal(dir, profileDir);
    await new Promise((resolve, reject) => {
      const child = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
      child.once('spawn', resolve); child.once('error', reject);
    });
  } };
  await assert.rejects(ensureChromeManual(manual), { code: 'CHROME_PROFILE_RESTART_REQUIRED' });
  assert.equal((await ensureChromeManual({ ...manual, restartProfile: true })).state, 'manual');
  for (let i = 0; i < 50 && !await isChromeProfileOpen(profileDir); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await isChromeProfileOpen(profileDir), true);
  await assert.rejects(readDebugEndpoint(port), { code: 'CHROME_DEBUG_UNAVAILABLE' });
  assert.equal(await other.pages()[0].evaluate(() => 3 + 3), 6);
  await closeChromeProfile(profileDir);
  const preserved = await launch(profileDir);
  assert.equal((await preserved.cookies('https://example.test')).find(cookie => cookie.name === 'fixture-session')?.value, 'retain-me');
});
