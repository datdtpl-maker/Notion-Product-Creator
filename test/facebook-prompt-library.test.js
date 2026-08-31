const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_FACEBOOK_PROMPT,
  normalizeFacebookPromptLibrary,
  resolveFacebookPrompt
} = require("../lib/facebook-prompt-library");

test("hiển thị prompt Facebook mặc định khi máy chưa có thư viện", () => {
  const library = normalizeFacebookPromptLibrary([], "");

  assert.deepEqual(library.prompts, [DEFAULT_FACEBOOK_PROMPT]);
  assert.equal(library.selectedPromptId, DEFAULT_FACEBOOK_PROMPT.id);
});

test("giữ prompt người dùng và chọn lại prompt hợp lệ", () => {
  const library = normalizeFacebookPromptLibrary([
    { id: "ban-hang", name: "Bài bán hàng", content: "Viết bài bán hàng ngắn gọn." },
    { id: "chuyen-gia", name: "Giọng chuyên gia", content: "Viết theo giọng chuyên gia da liễu." }
  ], "chuyen-gia");

  assert.equal(library.prompts.length, 2);
  assert.equal(library.selectedPromptId, "chuyen-gia");
});

test("loại prompt rỗng, sửa id trùng và giới hạn kích thước thư viện", () => {
  const library = normalizeFacebookPromptLibrary([
    { id: "trung", name: "Prompt 1", content: "Nội dung 1" },
    { id: "trung", name: "Prompt 2", content: "Nội dung 2" },
    { id: "rong", name: "", content: "" }
  ], "khong-ton-tai");

  assert.equal(library.prompts.length, 2);
  assert.notEqual(library.prompts[0].id, library.prompts[1].id);
  assert.equal(library.selectedPromptId, library.prompts[0].id);
});

test("ưu tiên prompt đang nhập và fallback về prompt đã lưu", () => {
  const prompts = [
    { id: "da-luu", name: "Đã lưu", content: "Prompt trong cấu hình" }
  ];

  assert.equal(resolveFacebookPrompt({ requestPrompt: "Prompt vừa sửa", prompts, selectedPromptId: "da-luu" }), "Prompt vừa sửa");
  assert.equal(resolveFacebookPrompt({ requestPrompt: "", prompts, selectedPromptId: "da-luu" }), "Prompt trong cấu hình");
});

test("từ chối prompt vượt giới hạn an toàn", () => {
  assert.throws(
    () => resolveFacebookPrompt({ requestPrompt: "x".repeat(20001), prompts: [], selectedPromptId: "" }),
    /20.000 ký tự/
  );
});
