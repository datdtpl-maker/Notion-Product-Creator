const path = require('node:path');
const { isChatGptPage } = require('./chatgpt-composer');

async function readDebugEndpoint(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2500) });
  if (!response.ok) throw new Error('Không đọc được phiên Chrome Debug.');
  const endpoint = (await response.json()).webSocketDebuggerUrl;
  const url = new URL(endpoint);
  if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Địa chỉ Chrome Debug không hợp lệ.');
  return endpoint;
}

async function getTargetId(page) {
  const session = await page.context().newCDPSession(page);
  try { return (await session.send('Target.getTargetInfo')).targetInfo.targetId; }
  finally { await session.detach(); }
}

async function bindChatGptSession(chromium, endpoint, profileDir) {
  const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
  try {
    const session = await browser.newBrowserCDPSession();
    let args;
    try { args = (await session.send('Browser.getBrowserCommandLine')).arguments; }
    catch { throw new Error('Chrome Debug cũ chưa xác minh được profile. Hãy đóng cửa sổ Chrome Debug rồi bấm Khởi động Chrome Debug từ tool một lần.'); }
    finally { await session.detach(); }
    const actual = args.find(arg => arg.startsWith('--user-data-dir='))?.slice('--user-data-dir='.length);
    const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    if (!actual || normalize(actual) !== normalize(profileDir)) throw new Error('Cổng Chrome Debug đang thuộc profile khác. Tool đã dừng để không thao tác nhầm profile.');
    let pages = browser.contexts().flatMap(context => context.pages()).filter(page => isChatGptPage(page.url()));
    if (!pages.length) {
      const page = await browser.contexts()[0].newPage();
      await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded' });
      pages = [page];
    }
    let page = pages.length === 1 ? pages[0] : null;
    if (!page) {
      const visible = [];
      for (const candidate of pages) if (await candidate.evaluate(() => document.hasFocus() && document.visibilityState === 'visible')) visible.push(candidate);
      if (visible.length === 1) page = visible[0];
    }
    if (!page) throw new Error('Có nhiều tab ChatGPT trong profile này. Chỉ giữ tab cần dùng rồi bấm Khởi động Chrome Debug lại.');
    await page.bringToFront();
    return { endpoint, targetId: await getTargetId(page), profileDir };
  } finally { await browser.close(); }
}

async function connectBoundChatGpt(chromium, port, binding) {
  if (!binding) throw new Error('Hãy bấm Khởi động Chrome Debug để khóa đúng profile và tab trước khi sinh ảnh.');
  if (await readDebugEndpoint(port) !== binding.endpoint) throw new Error('Phiên Chrome Debug đã thay đổi. Bấm Khởi động Chrome Debug để xác nhận lại profile; tool chưa gửi prompt.');
  const browser = await chromium.connectOverCDP(binding.endpoint, { noDefaults: true });
  try {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if (await getTargetId(page) === binding.targetId) {
          if (!isChatGptPage(page.url())) throw new Error('Tab đã khóa không còn ở ChatGPT. Hãy quay lại ChatGPT trong chính tab này.');
          return { browser, page };
        }
      }
    }
    throw new Error('Tab ChatGPT đã khóa bị đóng. Tool không tự chuyển tab; hãy bấm Khởi động Chrome Debug để chọn lại.');
  } catch (error) { await browser.close(); throw error; }
}

module.exports = { readDebugEndpoint, bindChatGptSession, connectBoundChatGpt };
