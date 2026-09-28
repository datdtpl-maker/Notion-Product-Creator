// Minimal, sanitized structure observed in the live ChatGPT image conversation.
// The user and assistant blocks share ONE search turn, not one turn each.
async function addSearchLayoutTurn(page, prompt, { index = 1, ready = true } = {}) {
  await page.evaluate(({ prompt, index, ready }) => {
    const turn = document.createElement('div');
    turn.setAttribute('data-content-search-turn-key', `fallback-turn-${index}`);
    turn.innerHTML = `<style>.contents,.block{display:contents}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}</style><div class="contents"><div class="contents"><div class="group"><div class="messages">
      <div class="block"><h4 class="sr-only">You said:</h4>
        <div data-chatgpt-search-unit-key="fallback-turn-${index}:0:user" data-chatgpt-search-message-ids="user-${index}">
          <div class="attachments"><img alt="User attachment"><img alt="User attachment"></div>
          <div data-content-search-unit-key="fallback-turn-${index}:0:user"><div><div data-user-message-bubble="true"><p></p></div></div></div>
        </div>
      </div>
      <div class="block"><span hidden data-chatgpt-agent-turn-start></span><h4 class="sr-only" data-conversation-role="assistant">ChatGPT said:</h4>
        <div data-chatgpt-search-message-ids="assistant-${index}"><div><div data-testid="generated-image-gallery"><div><div class="preview">
          <button data-testid="generated-image-preview" aria-label="Generated image 1"><img alt="Generated image 1"></button>
          <div><button aria-label="Edit generated image 1">Edit</button><button aria-label="Share generated image 1"></button></div>
        </div></div></div></div></div>
      </div>
    </div><div><button aria-label="Like this image"></button><button aria-label="Dislike this image"></button></div></div></div></div>`;
    turn.querySelector('p').textContent = prompt;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    for (const [i, img] of [...turn.querySelectorAll('img')].entries()) {
      context.fillStyle = `rgb(${index * 30},${i * 70},100)`; context.fillRect(0, 0, 512, 512);
      img.src = canvas.toDataURL();
    }
    if (!ready) {
      turn.querySelector('[data-testid="generated-image-gallery"]').setAttribute('aria-busy', 'true');
    }
    (document.querySelector('#messages') || document.querySelector('main')).append(turn);
  }, { prompt, index, ready });
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
}

module.exports = { addSearchLayoutTurn };
