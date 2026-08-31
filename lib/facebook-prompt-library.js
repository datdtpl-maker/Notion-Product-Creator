const MAX_FACEBOOK_PROMPTS = 50;
const MAX_FACEBOOK_PROMPT_LENGTH = 20000;

const DEFAULT_FACEBOOK_PROMPT = Object.freeze({
  id: "khai-hoan-default",
  name: "Prompt mặc định Khải Hoàn",
  content: "Bạn viết bài Facebook ngắn gọn cho Khải Hoàn Skincare. Không bịa công dụng, dùng ngôn từ an toàn. Trả về duy nhất nội dung bài đăng, có CTA và link web cuối bài."
});

function createUniqueId(candidate, index, usedIds) {
  const base = String(candidate || `facebook-prompt-${index + 1}`)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || `facebook-prompt-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function normalizeFacebookPromptLibrary(prompts, selectedPromptId) {
  const usedIds = new Set();
  const normalized = (Array.isArray(prompts) ? prompts : [])
    .slice(0, MAX_FACEBOOK_PROMPTS)
    .map((prompt, index) => {
      const name = String(prompt?.name || "").trim().slice(0, 120);
      const content = String(prompt?.content || "").trim().slice(0, MAX_FACEBOOK_PROMPT_LENGTH);
      if (!name || !content) return null;
      return {
        id: createUniqueId(prompt?.id, index, usedIds),
        name,
        content
      };
    })
    .filter(Boolean);

  const safePrompts = normalized.length ? normalized : [{ ...DEFAULT_FACEBOOK_PROMPT }];
  const requestedId = String(selectedPromptId || "").trim();
  const selectedPrompt = safePrompts.find((prompt) => prompt.id === requestedId) || safePrompts[0];

  return {
    prompts: safePrompts,
    selectedPromptId: selectedPrompt.id
  };
}

function resolveFacebookPrompt({ requestPrompt, prompts, selectedPromptId }) {
  const submittedPrompt = String(requestPrompt || "").trim();
  if (submittedPrompt.length > MAX_FACEBOOK_PROMPT_LENGTH) {
    const error = new Error("Prompt Facebook không được vượt quá 20.000 ký tự.");
    error.code = "FACEBOOK_PROMPT_TOO_LONG";
    throw error;
  }
  if (submittedPrompt) return submittedPrompt;

  const library = normalizeFacebookPromptLibrary(prompts, selectedPromptId);
  return library.prompts.find((prompt) => prompt.id === library.selectedPromptId)?.content
    || DEFAULT_FACEBOOK_PROMPT.content;
}

module.exports = {
  DEFAULT_FACEBOOK_PROMPT,
  MAX_FACEBOOK_PROMPTS,
  MAX_FACEBOOK_PROMPT_LENGTH,
  normalizeFacebookPromptLibrary,
  resolveFacebookPrompt
};
