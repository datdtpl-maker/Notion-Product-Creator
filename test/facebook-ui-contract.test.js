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
