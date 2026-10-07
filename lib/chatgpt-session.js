const path = require('node:path');
const { isChatGptPage } = require('./chatgpt-composer');
const { inspectChatGptState, observeChatGptConnection } = require('./chatgpt-connection-state');

function isChatGptLoginPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['auth.openai.com', 'auth0.openai.com'].includes(url.hostname);
  } catch { return false; }
}

async function readDebugEndpoint(port) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2500) });
  } catch (cause) {
    throw Object.assign(new Error(`Không kết nối được Chrome Debug tại cổng ${port}. Chrome đăng nhập thông thường chưa có cổng điều khiển. Hãy bấm “2. Kết nối Chrome Debug” trước khi kiểm tra và khóa tab.`, { cause }), { code: 'CHROME_DEBUG_UNAVAILABLE' });
  }
  try {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const endpoint = (await response.json()).webSocketDebuggerUrl;
    const url = new URL(endpoint);
    if (url.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Địa chỉ Chrome Debug không hợp lệ.');
    return endpoint;
  } catch (cause) {
    throw Object.assign(new Error(`Cổng ${port} có phản hồi nhưng không phải phiên Chrome Debug hợp lệ. Tool đã dừng để không kết nối nhầm ứng dụng.`, { cause }), { code: 'CHROME_DEBUG_INVALID' });
  }
}

async function getTargetId(page) {
  const session = await page.context().newCDPSession(page);
  try { return (await session.send('Target.getTargetInfo')).targetInfo.targetId; }
  finally { await session.detach(); }
}

async function bindChatGptSession(chromium, endpoint, profileDir, previousBinding, { diagnose = false } = {}) {
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
    const allPages = browser.contexts().flatMap(context => context.pages()).filter(page => !page.isClosed());
    let pages = allPages.filter(page => isChatGptPage(page.url()) || isChatGptLoginPage(page.url()));
    if (previousBinding?.endpoint === endpoint && previousBinding.targetId) {
      pages = [];
      for (const page of allPages) {
        if (await getTargetId(page) === previousBinding.targetId) pages.push(page);
      }
      if (!pages.length) throw new Error('Tab ChatGPT đã chọn bị đóng. Bấm Kết nối Chrome Debug để chọn lại; tool không tự mở tab thay thế.');
    }
    // Startup and sign-in redirects are not permission to open another tab.
    if (!pages.length) return { endpoint, profileDir, targetId: null, ready: false, state: 'loading' };
    let page = pages.length === 1 ? pages[0] : null;
    if (!page) {
      const visible = [];
      for (const candidate of pages) if (await candidate.evaluate(() => document.hasFocus() && document.visibilityState === 'visible')) visible.push(candidate);
      if (visible.length === 1) page = visible[0];
    }
    if (!page) throw new Error('Có nhiều tab ChatGPT trong profile này. Chỉ giữ tab cần dùng rồi bấm Khởi động Chrome Debug lại.');
    await page.bringToFront();
    const observation = diagnose ? await observeChatGptConnection(page) : undefined;
    const status = await inspectChatGptState(page);
    return { endpoint, targetId: await getTargetId(page), profileDir, ...status, ...(observation ? { observation } : {}) };
  } finally { await browser.close(); }
}

async function connectBoundChatGpt(chromium, port, binding) {
  if (!binding) throw new Error('Hãy bấm Khởi động Chrome Debug để khóa đúng profile và tab trước khi sinh ảnh.');
  if (binding.ready === false || !binding.targetId) throw new Error('ChatGPT chưa sẵn sàng. Đăng nhập thủ công rồi bấm Kiểm tra và khóa tab; tool chưa gửi prompt.');
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
