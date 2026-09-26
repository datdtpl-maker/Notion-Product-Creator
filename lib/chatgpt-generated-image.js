function inferConversationTurnRole({ ownRole, userMarkerCount, assistantMarkerCount, readyImageCount }) {
  if (ownRole === "user" || ownRole === "assistant") return ownRole;
  if (userMarkerCount > 0) return "user";
  if (assistantMarkerCount > 0) return "assistant";
  if (readyImageCount > 0) return "assistant";
  return null;
}

function selectNewAssistantImage(turns, baselineTurnKeys) {
  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    if (turn.authorRole !== "assistant" || baselineTurnKeys.has(turn.turnKey)) continue;
    if (turn.images?.length) {
      return turn.images.find(({ alt = "" }) => (
        /(generated image|ảnh (?:đã|được) tạo|hình (?:ảnh )?(?:đã|được) tạo)/i.test(alt)
      )) || turn.images[0];
    }
  }
  return null;
}

module.exports = { inferConversationTurnRole, selectNewAssistantImage };

async function getChatGptConversationTurns(page) {
  // Read individual turns, never the whole conversation (which also contains uploads).
  const containers = page.locator('[data-testid^="conversation-turn-"], article, [data-message-author-role]');
  const result = [];
  for (let index = 0; index < await containers.count(); index++) {
    const turn = containers.nth(index);
    const metadata = await turn.evaluate(element => {
      const selector = '[data-testid^="conversation-turn-"], article, [data-message-author-role]';
      if (element.parentElement?.closest(selector)) return null;
      const user = element.matches('[data-message-author-role="user"]') || element.querySelector('[data-message-author-role="user"]');
      const assistant = element.matches('[data-message-author-role="assistant"]') || element.querySelector('[data-message-author-role="assistant"]');
      const label = `${element.getAttribute('aria-label') || ''} ${element.querySelector('h5,h6')?.textContent || ''}`;
      let role = user ? 'user' : assistant ? 'assistant' : null;
      if (!role && /^(?:\s*)(?:you said|bạn (?:đã )?nói)/i.test(label)) role = 'user';
      if (!role && /chatgpt (?:said|(?:đã )?nói)/i.test(label)) role = 'assistant';
      const id = element.getAttribute('data-message-id') || element.querySelector('[data-message-id]')?.getAttribute('data-message-id') || element.getAttribute('data-testid') || element.id;
      return { role, id };
    });
    if (!metadata) continue;
    const images = [];
    if (metadata.role !== 'user') {
      const nodes = turn.locator('img');
      for (let i = 0; i < await nodes.count(); i++) {
        const image = nodes.nth(i);
        const info = await image.evaluate(element => ({
          src: element.currentSrc || element.src,
          alt: element.alt || '',
          ready: element.complete && element.naturalWidth >= 256 && element.naturalHeight >= 256,
          generated: /generated image|image generated|image created|ảnh (?:đã |được )?tạo|hình ảnh (?:đã |được )?tạo/i.test(element.alt || '')
        }));
        if (!info.ready || !info.src) continue;
        // Unknown articles need explicit generated-image evidence, not just a large image.
        if (metadata.role !== 'assistant' && !info.generated) continue;
        if (!await image.isVisible()) continue;
        images.push({ image, src: info.src, alt: info.alt });
      }
    }
    result.push({ turnKey: metadata.id || `turn-${index}`, authorRole: metadata.role || (images.length ? 'assistant' : null), images });
  }
  return result;
}

async function saveChatGptImage(context, image, src, imagePath) {
  const fs = require('node:fs/promises');
  // Canvas exports decoded pixels as PNG for HTTP, blob and data image sources.
  // This also avoids writing a JPEG/WebP payload under a .png filename.
  let bytes;
  let mode = 'original';
  try {
    const data = await image.evaluate(element => {
      const canvas = document.createElement('canvas');
      canvas.width = element.naturalWidth;
      canvas.height = element.naturalHeight;
      canvas.getContext('2d').drawImage(element, 0, 0);
      return canvas.toDataURL('image/png');
    });
    bytes = Buffer.from(data.split(',')[1], 'base64');
  } catch {
    mode = 'screenshot';
    bytes = await image.screenshot({ type: 'png', animations: 'disabled', timeout: 15000 });
  }
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) < 256 || bytes.readUInt32BE(20) < 256) {
    throw new Error('Ảnh kết quả chưa có dữ liệu PNG hợp lệ.');
  }
  const temporaryPath = `${imagePath}.part`;
  try {
    await fs.writeFile(temporaryPath, bytes);
    await fs.rename(temporaryPath, imagePath);
  } finally {
    await fs.unlink(temporaryPath).catch(() => {});
  }
  return mode;
}

module.exports.getChatGptConversationTurns = getChatGptConversationTurns;
module.exports.saveChatGptImage = saveChatGptImage;
