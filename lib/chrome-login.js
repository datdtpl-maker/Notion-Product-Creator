const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const runFile = promisify(execFile);

function manualLoginArgs(profileDir) {
  // This phase is normal Chrome: no debugging or browser automation connection.
  return [`--user-data-dir=${profileDir}`, '--new-window', 'https://chatgpt.com'];
}

function commandUsesProfile(command, profileDir, platform = process.platform) {
  if (!command || /(?:^|\s)--type=/.test(command)) return false;
  const match = command.match(/(?:^|\s)"?--user-data-dir=(?:"([^"]+)"|(.+?))(?=\s--|\shttps?:\/\/|$)/);
  if (!match) return false;
  const value = (match[1] || match[2]).trim().replace(/^"|"$/g, '');
  const normalize = platform === 'win32'
    ? input => path.win32.resolve(input).toLowerCase()
    : input => path.posix.resolve(input);
  return normalize(value) === normalize(profileDir);
}

async function listChromeProfileProcesses(profileDir, { platform = process.platform, run = runFile } = {}) {
  let processes;
  if (platform === 'win32') {
    const script = '$ErrorActionPreference = "Stop"; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\'" | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress';
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const { stdout } = await run(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    processes = [].concat(JSON.parse(stdout.trim() || '[]') || []).map(item => ({ pid: Number(item.ProcessId), command: item.CommandLine }));
  } else if (platform === 'darwin') {
    const { stdout } = await run('/bin/ps', ['-axww', '-o', 'pid=,command='], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    processes = stdout.split('\n').flatMap(line => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!match || !/^"?(?:\/Applications|\/Users\/[^/\r\n]+\/Applications)\/Google Chrome\.app\/Contents\/MacOS\/Google Chrome"?(?=\s|$)/.test(match[2])) return [];
      return [{ pid: Number(match[1]), command: match[2] }];
    });
  } else {
    throw new Error('Kiểm tra profile Chrome chỉ hỗ trợ Windows và macOS.');
  }
  return processes.filter(item => Number.isSafeInteger(item.pid) && item.pid > 0 && commandUsesProfile(item.command, profileDir, platform));
}

async function isChromeProfileOpen(profileDir) {
  return (await listChromeProfileProcesses(profileDir)).length > 0;
}

async function requestProcessExit({ pid, command }, platform) {
  if (platform === 'darwin') {
    try { process.kill(pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
    return;
  }
  if (platform !== 'win32') throw new Error('Chuyển chế độ Chrome chỉ hỗ trợ Windows và macOS.');
  // Recheck identity inside PowerShell as well; never use taskkill /F or kill all Chrome.
  const encodedCommand = Buffer.from(command, 'utf8').toString('base64');
  const script = `$ErrorActionPreference = 'Stop'; $expected = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedCommand}')); $item = Get-CimInstance Win32_Process -Filter "ProcessId=${pid} AND Name='chrome.exe'"; if ($item -and $item.CommandLine -ceq $expected) { $process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if ($process) { [void]$process.CloseMainWindow() } }`;
  const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  await runFile(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000 });
}

async function closeChromeProfile(profileDir, dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const list = dependencies.list || (dir => listChromeProfileProcesses(dir, { platform }));
  const requestExit = dependencies.requestExit || (item => requestProcessExit(item, platform));
  const wait = dependencies.wait || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const processes = await list(profileDir);
  for (const item of processes) {
    // The user may have closed/reopened Chrome while the confirmation was visible.
    const current = (await list(profileDir)).find(candidate => candidate.pid === item.pid && candidate.command === item.command);
    if (!current) continue;
    try { await requestExit(current); }
    catch (cause) { throw new Error('Không thể đóng profile Chrome của tool. Hãy lưu nội dung đang nhập và thoát profile này thủ công, rồi bấm Kết nối Chrome Debug. Tool không ép tắt hoặc xóa dữ liệu.', { cause }); }
  }
  const deadline = Date.now() + (dependencies.timeoutMs ?? 10000);
  while ((await list(profileDir)).length) {
    if (Date.now() >= deadline) throw new Error('Profile Chrome chưa thoát, nên tool chưa mở lại Debug. Hãy lưu các tab và thoát Chrome hoàn toàn (macOS: Command + Q), rồi kết nối lại. Tool không ép tắt hoặc xóa cookie.');
    await wait(250);
  }
}

module.exports = { manualLoginArgs, commandUsesProfile, isChromeProfileOpen, listChromeProfileProcesses, closeChromeProfile };
