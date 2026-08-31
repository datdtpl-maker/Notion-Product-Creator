const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");

test("Facebook UI exposes the confirmed-publish status workflow", async () => {
  const root = path.resolve(__dirname, "..");
  const [serverSource, appSource, htmlSource] = await Promise.all([
    fs.readFile(path.join(root, "server.js"), "utf8"),
    fs.readFile(path.join(root, "public", "app.js"), "utf8"),
    fs.readFile(path.join(root, "public", "index.html"), "utf8")
  ]);

  assert.match(serverSource, /\/api\/facebook\/waiting-products/);
  assert.match(serverSource, /\/api\/facebook\/mark-waiting-as-published/);
  assert.match(appSource, /confirmWaitingFacebookProducts/);
  assert.match(htmlSource, /id="btn-confirm-facebook-published"/);
});

test("Facebook UI exposes a persistent editable prompt library", async () => {
  const root = path.resolve(__dirname, "..");
  const [serverSource, appSource, htmlSource] = await Promise.all([
    fs.readFile(path.join(root, "server.js"), "utf8"),
    fs.readFile(path.join(root, "public", "app.js"), "utf8"),
    fs.readFile(path.join(root, "public", "index.html"), "utf8")
  ]);

  for (const id of [
    "facebook-prompt-select",
    "facebook-prompt-name",
    "facebook-prompt-content",
    "btn-add-facebook-prompt",
    "btn-save-facebook-prompt",
    "btn-delete-facebook-prompt",
    "btn-export-facebook-prompts",
    "btn-import-facebook-prompts"
  ]) {
    assert.match(htmlSource, new RegExp(`id="${id}"`));
  }
  assert.match(appSource, /facebookPrompts:\s*facebookPrompts\.map/);
  assert.match(appSource, /selectedFacebookPromptId/);
  assert.match(appSource, /prompt:\s*activePrompt\.content\.trim\(\)/);
  assert.match(serverSource, /content:\s*effectivePrompt/);
});
