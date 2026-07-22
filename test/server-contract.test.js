const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server test đã thoát với mã ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/config`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Server test không sẵn sàng.");
}

test("local config API redacts secrets and product cache keeps the parent URL", async (t) => {
  const configDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "notion-product-creator-server-"));
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, PORT: String(port), NPC_CONFIG_DIR: configDirectory },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await fs.rm(configDirectory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  let response = await fetch(`${baseUrl}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openAiApiKey: "sk-contract-test", notionApiKey: "notion-contract-test" })
  });
  assert.equal(response.ok, true);

  response = await fetch(`${baseUrl}/api/config/google-drive-parent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ googleDriveParentUrl: "https://drive.test/parent" })
  });
  assert.equal(response.ok, true);
  assert.equal((await fetch(`${baseUrl}/api/app/clear-product-cache`, { method: "POST" })).ok, true);

  const config = await (await fetch(`${baseUrl}/api/config`)).json();
  assert.equal(config.googleDriveParentUrl, "https://drive.test/parent");
  assert.equal(config.openAiApiKey, undefined);
  assert.equal(config.notionApiKey, undefined);
  assert.equal(config.openAiApiKeyConfigured, true);
  assert.equal(config.notionApiKeyConfigured, true);
});

test("Facebook preparation uses the Chờ đăng status", async () => {
  const serverSource = await fs.readFile(path.resolve(__dirname, "..", "server.js"), "utf8");
  assert.match(serverSource, /Facebook:\s*\{\s*select:\s*\{\s*name:\s*"Chờ đăng"/);
});

test("Notion website sync marks Facebook as Chưa đăng for create and update", async () => {
  const serverSource = await fs.readFile(path.resolve(__dirname, "..", "server.js"), "utf8");
  const routeStart = serverSource.indexOf('app.post("/api/notion/sync"');
  const routeEnd = serverSource.indexOf("// Start Server", routeStart);
  assert.notEqual(routeStart, -1);
  assert.notEqual(routeEnd, -1);
  const notionSyncSource = serverSource.slice(routeStart, routeEnd);
  const pendingFacebookProperties = notionSyncSource.match(
    /"Facebook":\s*\{\s*select:\s*\{\s*name:\s*"Chưa đăng"/g
  ) || [];
  const contentInProgressProperties = notionSyncSource.match(
    /"Trạng thái":\s*\{\s*select:\s*\{\s*name:\s*"Content đang làm"/g
  ) || [];

  assert.equal(pendingFacebookProperties.length, 2);
  assert.equal(contentInProgressProperties.length, 2);
  assert.doesNotMatch(notionSyncSource, /name:\s*"Báo IT đăng"/);
});

test("Website UI exposes an explicit persistent Google Drive parent link button", async () => {
  const root = path.resolve(__dirname, "..");
  const [appSource, htmlSource] = await Promise.all([
    fs.readFile(path.join(root, "public", "app.js"), "utf8"),
    fs.readFile(path.join(root, "public", "index.html"), "utf8")
  ]);

  assert.match(htmlSource, /id="btn-save-drive-parent-url"/);
  assert.match(appSource, /btnSaveDriveParentUrl\.addEventListener\("click"/);
  assert.match(appSource, /persistGoogleDriveParentUrl\(\{ silent: true \}\)/);
});
