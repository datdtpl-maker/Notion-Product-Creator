const EDITOR_SELECTORS = [
  '#prompt-textarea[contenteditable="true"]',
  'textarea#prompt-textarea',
  '[data-testid="composer-text-input"][contenteditable="true"]',
  'form [contenteditable="true"][role="textbox"]',
  'form .ProseMirror[contenteditable="true"]',
  'textarea[name="prompt-textarea"]'
];

function isChatGptPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['chatgpt.com', 'chat.openai.com'].includes(url.hostname);
  } catch { return false; }
}

async function findEditor(page) {
  if (/\/(auth|login|signup)(\/|$)/.test(new URL(page.url()).pathname)) return null;
  for (const selector of EDITOR_SELECTORS) {
    const candidates = page.locator(selector);
    for (let i = 0; i < await candidates.count(); i++) {
      const editor = candidates.nth(i);
      if (await editor.isVisible() && await editor.isEditable()) return editor;
    }
  }
  return null;
}

async function ensureChatGptComposer(browser, { preferredUrl, timeoutMs = 45000, pollMs = 300, allowNewChat = true } = {}) {
  const pages = () => browser.contexts().flatMap(context => context.pages())
    .filter(page => !page.isClosed() && isChatGptPage(page.url()));
  if (!pages().length && allowNewChat && !preferredUrl) {
    const context = browser.contexts()[0];
    if (!context) throw new Error('Chrome Debug chưa có phiên trình duyệt. Hãy khởi động lại Chrome Debug từ tool.');
    const page = await context.newPage();
    await page.goto('https://chatgpt.com', { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }

  const deadline = Date.now() + timeoutMs;
  do {
    const candidates = pages().filter(page => !preferredUrl || page.url() === preferredUrl);
    const ready = [];
    for (const page of candidates) {
      try {
        const editor = await findEditor(page);
        if (editor) ready.push({ page, editor });
      } catch { /* A tab can navigate while Chrome is being inspected. */ }
    }
    let selected = ready.length === 1 ? ready[0] : null;
    if (ready.length > 1) {
      const focused = [];
      for (const item of ready) {
        if (await item.page.evaluate(() => document.hasFocus() && document.visibilityState === 'visible').catch(() => false)) focused.push(item);
      }
      if (focused.length === 1) selected = focused[0];
      else throw new Error('Có nhiều tab ChatGPT sẵn sàng. Hãy chỉ giữ một tab cuộc trò chuyện cần tạo ảnh trong Chrome Debug rồi thử lại.');
    }
    if (selected) {
      await selected.page.bringToFront();
      return { ...selected, context: selected.page.context() };
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  } while (Date.now() < deadline);

  if (preferredUrl && !pages().some(page => page.url() === preferredUrl)) {
    throw new Error('Tab cuộc trò chuyện của sản phẩm đã đóng hoặc chuyển sang cuộc trò chuyện khác. Hãy mở lại đúng cuộc trò chuyện đã tạo ảnh 1; tool không gửi ảnh tiếp theo sang tab khác.');
  }
  // Only inspect gate text after failing to find an editor; never log conversation text.
  for (const page of pages()) {
    if (preferredUrl && page.url() !== preferredUrl) continue;
    const title = await page.title().catch(() => '');
    if (/just a moment|verify|verification|xác minh/i.test(title) || await page.locator('iframe[src*="challenges.cloudflare.com"]').count().catch(() => 0)) {
      throw new Error('ChatGPT đang chờ xác minh bảo mật. Hoàn tất xác minh trong cửa sổ Chrome Debug rồi bấm sinh ảnh lại.');
    }
    if (/\/(auth|login|signup)(\/|$)/.test(new URL(page.url()).pathname) || await page.locator('[data-testid="login-button"]').isVisible().catch(() => false)) {
      throw new Error('ChatGPT trong Chrome Debug đang yêu cầu đăng nhập. Phiên đăng nhập ở Chrome thông thường không dùng chung với Chrome Debug.');
    }
  }
  throw new Error(`Không tìm thấy ô nhập ChatGPT có thể soạn thảo sau ${Math.round(timeoutMs / 1000)} giây (${pages().length} tab ChatGPT trong Chrome Debug). Trang có thể chưa tải xong, có hộp thoại che hoặc giao diện đã đổi.`);
}

async function fillChatGptPrompt(editor, prompt) {
  // Locator.fill supports both textarea and contenteditable, including macOS.
  await editor.fill(prompt, { timeout: 10000 });
  const actual = await editor.evaluate(element => element.tagName === 'TEXTAREA' ? element.value : element.innerText);
  if (actual.replace(/\r\n/g, '\n').trim() !== prompt.replace(/\r\n/g, '\n').trim()) {
    throw new Error('Nội dung prompt trong ChatGPT chưa khớp. Đã dừng trước khi gửi để tránh gửi sai nội dung.');
  }
}

module.exports = { ensureChatGptComposer, fillChatGptPrompt, isChatGptPage };
