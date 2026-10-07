const test = require('node:test');
const assert = require('node:assert/strict');
const { listChromeProfileProcesses, closeChromeProfile } = require('../lib/chrome-login');

const profile = '/Users/content/Library/Application Support/NotionProductCreator/chatgpt_profile';
const browser = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const owner = { pid: 411, command: `${browser} --user-data-dir=${profile} --new-window https://chatgpt.com` };

test('macOS enumeration selects only the exact Chrome browser profile, not helpers or similar paths', async () => {
  const lines = [
    `${owner.pid} ${owner.command}`,
    `412 ${browser} --user-data-dir=${profile}-other --new-window https://chatgpt.com`,
    `413 ${browser} --type=renderer --user-data-dir=${profile}`,
    `414 /usr/bin/something --user-data-dir=${profile}`,
    `415 ${browser}`,
    `416 /bin/sh -c echo ${owner.command}`
  ].join('\n');
  const actual = await listChromeProfileProcesses(profile, { platform: 'darwin', run: async (file, args) => {
    assert.equal(file, '/bin/ps');
    assert.deepEqual(args, ['-axww', '-o', 'pid=,command=']);
    return { stdout: lines };
  } });
  assert.deepEqual(actual, [owner]);
});

test('Windows enumeration validates PID and exact profile with spaces', async () => {
  const win = 'C:\\Users\\User Name\\NPC\\chatgpt_profile';
  const command = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir="${win}" --new-window https://chatgpt.com`;
  const processes = [
    { ProcessId: 411, CommandLine: command },
    { ProcessId: 412, CommandLine: command.replace('chatgpt_profile', 'chatgpt_profile-other') },
    { ProcessId: 413, CommandLine: `${command} --type=renderer` },
    { ProcessId: null, CommandLine: command },
    { ProcessId: 414, CommandLine: null }
  ];
  assert.deepEqual(await listChromeProfileProcesses(win, { platform: 'win32', run: async (_file, args, options) => {
    assert.equal(options.windowsHide, true);
    const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
    assert.match(script, /Name='chrome.exe'/);
    assert.doesNotMatch(script, /Stop-Process|taskkill/);
    return { stdout: JSON.stringify(processes) };
  } }), [{ pid: 411, command }]);
});

test('profile exit rechecks process identity and waits for exit before returning', async () => {
  let open = true;
  const actions = [];
  await closeChromeProfile(profile, {
    list: async dir => { assert.equal(dir, profile); actions.push('inspect'); return open ? [owner] : []; },
    requestExit: async item => { actions.push('exit'); assert.deepEqual(item, owner); open = false; },
    wait: async () => { throw new Error('No wait needed'); }
  });
  assert.deepEqual(actions, ['inspect', 'inspect', 'exit', 'inspect']);
});

test('PID reused by another command is not terminated', async () => {
  let calls = 0;
  const actions = [];
  await assert.rejects(closeChromeProfile(profile, {
    list: async () => ++calls === 1 ? [owner] : [{ ...owner, command: owner.command + ' --another-instance' }],
    requestExit: async item => actions.push(item), timeoutMs: 0
  }), /chưa thoát/);
  assert.deepEqual(actions, []);
});

test('a browser that refuses exit is not force-killed', async () => {
  const actions = [];
  await assert.rejects(closeChromeProfile(profile, {
    list: async () => [owner], requestExit: async item => actions.push(item), timeoutMs: 0
  }), /không ép tắt/);
  assert.deepEqual(actions, [owner], 'only one graceful exit request, no forced retry');
});

test('exit permission failure stops safely and provides manual recovery', async () => {
  await assert.rejects(closeChromeProfile(profile, {
    list: async () => [owner], requestExit: async () => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); }
  }), error => {
    assert.match(error.message, /thoát profile này thủ công/);
    assert.equal(error.cause.code, 'EPERM');
    return true;
  });
});
