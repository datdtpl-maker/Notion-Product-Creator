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

async function isChromeProfileOpen(profileDir) {
  if (process.platform === 'win32') {
    const script = '$ErrorActionPreference = "Stop"; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); @(Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\'" | Select-Object -ExpandProperty CommandLine) | ConvertTo-Json -Compress';
    const executable = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const { stdout } = await runFile(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    const commands = JSON.parse(stdout.trim() || '[]');
    return [].concat(commands || []).some(command => commandUsesProfile(command, profileDir));
  }
  if (process.platform === 'darwin') {
    const { stdout } = await runFile('/bin/ps', ['-axww', '-o', 'command='], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 });
    return stdout.split('\n').some(command => command.includes('/Google Chrome.app/Contents/MacOS/Google Chrome') && commandUsesProfile(command, profileDir));
  }
  throw new Error('Kiểm tra profile Chrome chỉ hỗ trợ Windows và macOS.');
}

module.exports = { manualLoginArgs, commandUsesProfile, isChromeProfileOpen };
