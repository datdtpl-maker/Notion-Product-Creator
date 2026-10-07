const { isChatGptPage, findEditor } = require('./chatgpt-composer');

const messages = {
  ready: 'ChatGPT đã sẵn sàng, đã khóa đúng tab để sinh ảnh.',
  verification_required: 'ChatGPT đang yêu cầu xác minh Cloudflare. Tool đã dừng, chưa gửi prompt. Hãy xác minh trực tiếp trong Chrome; nếu cứ lặp lại, bấm “Quay về đăng nhập thủ công” hoặc tải báo cáo chẩn đoán. Không cần xóa profile.',
  auth_error: 'Trang đăng nhập OpenAI đang báo lỗi. Tool chưa gửi prompt. Hãy quay về đăng nhập thủ công; nếu lỗi vẫn còn, tải báo cáo chẩn đoán để kiểm tra.',
  login_required: 'ChatGPT chưa đăng nhập. Bấm “Quay về đăng nhập thủ công”, đăng nhập xong mới kết nối Debug.',
  loading: 'Tab ChatGPT còn tải trang. Tool giữ nguyên tab, chưa gửi prompt. Khi thấy ô chat, bấm Kiểm tra và khóa tab.',
  manual: 'Chrome đang ở chế độ thủ công, không kết nối điều khiển. Bạn có thể đăng nhập và sử dụng ChatGPT trực tiếp. Khi sẵn sàng, bấm Kết nối Chrome Debug.',
  offline: 'Chrome Debug chưa kết nối. Hãy mở Chrome đăng nhập hoặc kết nối Debug.',
  connection_error: 'Không kiểm tra được phiên Chrome hiện tại. Tool đã dừng, chưa gửi prompt. Có thể tải báo cáo chẩn đoán hoặc quay về đăng nhập thủ công.'
};

function connectionMessage(state) { return messages[state] || messages.loading; }

async function inspectChatGptState(page) {
  let state = 'loading';
  try {
    const url = new URL(page.url());
    const auth = url.protocol === 'https:' && ['auth.openai.com', 'auth0.openai.com'].includes(url.hostname);
    if (!auth && !isChatGptPage(url.href)) return { state, ready: false };
    const title = await page.title();
    const challenge = /^\s*(?:just a moment|chờ một chút|verify you are human|xác minh bạn là con người|verification required)\s*(?:[.!…]|$)/i.test(title)
      || await page.locator('iframe[src*="challenges.cloudflare.com"]:visible').count() > 0;
    if (challenge) state = 'verification_required';
    else if (auth) {
      const error = /oops.*error|error occurred|đã xảy ra lỗi/i.test(title)
        || await page.locator('text=/Invalid content type|Oops, an error occurred/i').first().isVisible().catch(() => false);
      state = error ? 'auth_error' : 'login_required';
    } else if (await page.locator('[data-testid="login-button"]').isVisible().catch(() => false)) state = 'login_required';
    else if (await findEditor(page)) state = 'ready';
  } catch { /* Navigation/closing the same tab is not permission to use another tab. */ }
  return { state, ready: state === 'ready' };
}

function networkCategory(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname === 'challenges.cloudflare.com') return 'verification';
    if (['auth.openai.com', 'auth0.openai.com'].includes(url.hostname)) return 'authentication';
    if (['chatgpt.com', 'chat.openai.com'].includes(url.hostname)) return url.pathname.startsWith('/cdn-cgi/') ? 'verification' : 'chatgpt';
  } catch {}
  return null;
}

// Observe only on explicit request. Never reload, send a request, click a challenge, or read bodies/headers.
async function observeChatGptConnection(page, { samples = 6, intervalMs = 1000, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const started = Date.now();
  const network = [];
  const states = [];
  const add = event => { if (network.length < 50) network.push({ elapsedMs: Date.now() - started, ...event }); };
  const onResponse = response => {
    try {
      const category = networkCategory(response.url());
      const status = response.status();
      if (category && Number.isInteger(status) && status >= 100 && status <= 599) add({ category, status });
    } catch {}
  };
  const onFailed = request => {
    try {
      const category = networkCategory(request.url());
      const code = request.failure()?.errorText;
      const allowed = ['net::ERR_BLOCKED_BY_CLIENT', 'net::ERR_NAME_NOT_RESOLVED', 'net::ERR_CONNECTION_RESET', 'net::ERR_TIMED_OUT', 'net::ERR_INTERNET_DISCONNECTED', 'net::ERR_ABORTED'];
      if (category) add({ category, error: allowed.includes(code) ? code : 'NETWORK_REQUEST_FAILED' });
    } catch {}
  };
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  try {
    for (let i = 0; i < samples; i++) {
      if (i) await wait(intervalMs);
      const { state } = await inspectChatGptState(page);
      states.push({ elapsedMs: Date.now() - started, state });
      if (page.isClosed()) break;
    }
  } finally {
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
  }
  return { durationMs: Date.now() - started, states, network, truncated: network.length === 50 };
}

function createConnectionHistory() {
  const events = [];
  return {
    record(action, state) {
      if (!['login', 'start', 'check', 'diagnose'].includes(action) || !Object.hasOwn(messages, state)) return;
      events.push({ time: new Date().toISOString(), action, state });
      if (events.length > 20) events.shift();
    },
    snapshot: () => events.map(event => ({ ...event }))
  };
}

module.exports = { inspectChatGptState, connectionMessage, observeChatGptConnection, createConnectionHistory, networkCategory };
