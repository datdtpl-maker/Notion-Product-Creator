const { isChatGptPage } = require('./chatgpt-composer');
const { getChatGptConversationTurns, disposeConversationTurns } = require('./chatgpt-generated-image');

const normalize = text => (text || '').normalize('NFC').replace(/\s+/gu, ' ').trim();

function conversationId(url) {
  if (!isChatGptPage(url)) return null;
  return new URL(url).pathname.match(/\/c\/([^/]+)/)?.[1] || null;
}

function requestError(message) {
  const error = new Error(message);
  error.code = 'CHATGPT_REQUEST_MISMATCH';
  return error;
}

async function createImageRequestTracker(page, promptText) {
  const expected = normalize(promptText);
  if (!expected) throw new Error('Prompt tạo ảnh đang trống.');
  const initialUrl = page.url();
  let lockedConversation = conversationId(initialUrl);
  let requestTurnKey = null;
  const matchesPrompt = turn => turn.authorRole === 'user' && normalize(turn.text).includes(expected);
  const baseline = await getChatGptConversationTurns(page, { promptText });
  const baselineKeys = new Set(baseline.map(turn => turn.turnKey));
  const baselineSources = new Set(baseline.flatMap(turn => turn.images.map(image => image.src)).filter(src => !src.startsWith('canvas:')));
  const previousMatchingPrompts = baseline.filter(matchesPrompt).length;
  const documentId = await page.evaluate(() => window.__npcImageTurnIdentity.documentId);
  await disposeConversationTurns(baseline);

  async function assertConversation({ beforeSend = false } = {}) {
    if (page.isClosed()) throw requestError('Tab ChatGPT đã khóa bị đóng. Tool không chuyển sang tab khác.');
    const url = page.url();
    const current = conversationId(url);
    if (!isChatGptPage(url) || (lockedConversation && current !== lockedConversation)
      || (beforeSend && url !== initialUrl)) {
      throw requestError('Cuộc hội thoại đã thay đổi. Đã dừng để không lưu ảnh của cuộc trò chuyện khác; hãy quay lại đúng cuộc hội thoại vừa gửi prompt.');
    }
    if (await page.evaluate(() => window.__npcImageTurnIdentity?.documentId) !== documentId) {
      throw requestError('Trang ChatGPT đã tải lại trong lúc tạo ảnh. Đã dừng để không nhận nhầm kết quả cũ.');
    }
    return current;
  }

  function locateRequest(turns) {
    const matching = turns.filter(matchesPrompt);
    if (matching.length > previousMatchingPrompts + 1) {
      throw requestError('Prompt được gửi nhiều lần trong khi tool đang chờ. Đã dừng để không chọn nhầm lượt trả lời.');
    }
    if (!requestTurnKey) {
      // A re-rendered old prompt is not evidence that this send succeeded.
      if (matching.length <= previousMatchingPrompts) return -1;
      const request = matching.at(-1);
      if (baselineKeys.has(request.turnKey)) return -1;
      requestTurnKey = request.turnKey;
    }
    let index = turns.findIndex(turn => turn.turnKey === requestTurnKey && matchesPrompt(turn));
    if (index < 0 && matching.length === previousMatchingPrompts + 1 && !baselineKeys.has(matching.at(-1).turnKey)) {
      // React may replace an unmarked bubble after streaming; its unique prompt
      // occurrence is unchanged. Never accept an extra, identical user request.
      requestTurnKey = matching.at(-1).turnKey;
      index = turns.indexOf(matching.at(-1));
    }
    if (index < 0) return -1;
    if (turns.slice(index + 1).some(turn => ['user', 'unknown'].includes(turn.authorRole))) {
      throw requestError('Có thêm lượt nhắn sau prompt đang tạo ảnh. Đã dừng để không lưu kết quả của prompt khác.');
    }
    return index;
  }

  async function poll() {
    await assertConversation();
    const turns = await getChatGptConversationTurns(page, { promptText });
    let candidate;
    try {
      const current = await assertConversation();
      const index = locateRequest(turns);
      const diagnostics = { turns: turns.length, assistantTurns: turns.filter(turn => turn.authorRole === 'assistant').length,
        media: turns.reduce((count, turn) => count + turn.mediaCount, 0), readyImages: turns.reduce((count, turn) => count + turn.images.length, 0) };
      if (index < 0) return { phase: 'awaiting-prompt', diagnostics };
      if (!lockedConversation && current) lockedConversation = current;
      const replies = turns.slice(index + 1).filter(turn => turn.authorRole === 'assistant' && !baselineKeys.has(turn.turnKey));
      const stopping = await page.locator('[data-testid="stop-button"],button[aria-label="Stop generating"],button[aria-label="Dừng tạo"]').first().isVisible().catch(() => false);
      for (const reply of replies) {
        if (reply.busy) continue;
        const images = reply.images.filter(image => !baselineSources.has(image.src) && (!stopping || image.completedCard));
        if (images.length) {
          candidate = images.find(image => /generated|được tạo|đã tạo/i.test(image.alt)) || images[0];
          return { phase: 'image-ready', candidate, conversationId: lockedConversation, requestTurnKey, diagnostics };
        }
      }
      return { phase: 'awaiting-image', conversationId: lockedConversation, requestTurnKey, diagnostics };
    } finally { await disposeConversationTurns(turns, candidate?.image); }
  }

  async function validateCandidate(candidate) {
    await assertConversation();
    const turns = await getChatGptConversationTurns(page, { promptText });
    try {
      const index = locateRequest(turns);
      const reply = turns.slice(index + 1).find(turn => turn.turnKey === candidate.turnKey && turn.authorRole === 'assistant');
      if (index < 0 || !reply || reply.busy || !reply.images.some(image => image.src === candidate.src)
        || !await candidate.image.evaluate(element => element.isConnected)) {
        const error = new Error('Ảnh đang cập nhật trước khi lưu; tiếp tục đọc lại đúng lượt trả lời, chưa ghi đè file.');
        error.code = 'CHATGPT_IMAGE_CHANGED';
        throw error;
      }
      await assertConversation();
    } finally { await disposeConversationTurns(turns); }
  }

  async function diagnostics() {
    await assertConversation();
    // Structural counts only: no prompt text, image URLs, cookies or tokens.
    return page.evaluate(() => ({
      mainRoots: document.querySelectorAll('main,[role="main"]').length,
      turnMarkers: document.querySelectorAll('[data-testid^="conversation-turn"],article,[data-message-author-role],[data-turn]').length,
      readyImageElements: [...document.images].filter(image => image.complete && image.naturalWidth >= 256 && image.naturalHeight >= 256 && image.getClientRects().length).length,
      canvases: document.querySelectorAll('canvas').length,
      frames: document.querySelectorAll('iframe').length
    }));
  }

  return { poll, assertConversation, validateCandidate, diagnostics };
}

module.exports = { createImageRequestTracker, conversationId };
