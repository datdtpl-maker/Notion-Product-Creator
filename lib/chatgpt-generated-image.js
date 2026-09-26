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
  const containers = page.locator('[data-testid^="conversation-turn-"], article, [data-message-author-role], [data-turn="user"], [data-turn="assistant"]');
  const result = [];
  for (let index = 0; index < await containers.count(); index++) {
    const turn = containers.nth(index);
    const metadata = await turn.evaluate(element => {
      const selector = '[data-testid^="conversation-turn-"], article, [data-message-author-role], [data-turn="user"], [data-turn="assistant"]';
      if (element.parentElement?.closest(selector)) return null;
      const user = element.matches('[data-message-author-role="user"], [data-turn="user"]') || element.querySelector('[data-message-author-role="user"], [data-turn="user"]');
      const assistant = element.matches('[data-message-author-role="assistant"], [data-turn="assistant"]') || element.querySelector('[data-message-author-role="assistant"], [data-turn="assistant"]');
      const label = `${element.getAttribute('aria-label') || ''} ${element.querySelector('h5,h6')?.textContent || ''}`;
      let role = user ? 'user' : assistant ? 'assistant' : null;
      if (!role && /^(?:\s*)(?:you said|bạn (?:đã )?nói)/i.test(label)) role = 'user';
      if (!role && /chatgpt (?:said|(?:đã )?nói)/i.test(label)) role = 'assistant';
      const id = element.getAttribute('data-testid') || element.id || element.getAttribute('data-message-id') || element.querySelector('[data-message-id]')?.getAttribute('data-message-id');
      return { role, id };
    });
    if (!metadata) continue;
    const images = [];
    if (metadata.role !== 'user') {
      const nodes = turn.locator('img, canvas, [style*="background"], [role="img"]');
      for (let i = 0; i < await nodes.count(); i++) {
        const image = nodes.nth(i);
        const info = await image.evaluate(async element => {
          const alt = element.alt || element.getAttribute('aria-label') || '';
          let src = element.currentSrc || element.src || '';
          let width = element.naturalWidth || 0;
          let height = element.naturalHeight || 0;
          let complete = element.complete;
          if (element.tagName === 'CANVAS') {
            src = `canvas:${element.width}x${element.height}`;
            width = element.width; height = element.height; complete = true;
          } else if (element.tagName !== 'IMG') {
            src = getComputedStyle(element).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1] || '';
            if (src) {
              const decoded = new Image(); decoded.src = src;
              await Promise.race([decoded.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 1500))]);
              width = decoded.naturalWidth; height = decoded.naturalHeight; complete = decoded.complete;
            }
          }
          return { src, alt, ready: Boolean(complete) && width >= 256 && height >= 256,
            generated: /generated image|image generated|image created|ảnh (?:đã |được )?tạo|hình ảnh (?:đã |được )?tạo/i.test(alt) };
        });
        if (!info.ready || !info.src) continue;
        // Unknown articles need explicit generated-image evidence, not just a large image.
        if (metadata.role !== 'assistant' && !info.generated) continue;
        if (!await image.isVisible()) continue;
        images.push({ image, src: info.src, alt: info.alt });
      }
    }
    result.push({ turnKey: metadata.id || `turn-${index}`, authorRole: metadata.role || (images.length ? 'assistant' : null), images,
      mediaCount: await turn.locator('img,canvas,[style*="background"],[role="img"]').count() });
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
    const data = await image.evaluate(async element => {
      let source = element;
      if (!['IMG', 'CANVAS'].includes(element.tagName)) {
        const src = getComputedStyle(element).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
        source = new Image(); source.src = src; await source.decode();
      }
      const canvas = document.createElement('canvas');
      canvas.width = source.naturalWidth || source.width;
      canvas.height = source.naturalHeight || source.height;
      canvas.getContext('2d').drawImage(source, 0, 0);
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
