const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createConfigStore, redactConfig } = require("../lib/config-store");

async function makeStore() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notion-product-creator-"));
  const configPath = path.join(directory, "config.json");
  const prefix = "encrypted:";
  const store = createConfigStore({
    configPath,
    defaults: { openAiApiKey: "", googleDriveParentUrl: "", prompts: [] },
    secretFields: ["openAiApiKey"],
    encryptSecret: (value) => `${prefix}${Buffer.from(value).toString("base64")}`,
    decryptSecret: (value) => value.startsWith(prefix)
      ? Buffer.from(value.slice(prefix.length), "base64").toString("utf8")
      : value
  });
  return { directory, configPath, store };
}

test("encrypts secrets at rest and restores them when loading", async (t) => {
  const { directory, configPath, store } = await makeStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.save({ openAiApiKey: "sk-test", googleDriveParentUrl: "https://drive.test/parent", prompts: [] });
  const storedText = await fs.readFile(configPath, "utf8");
  assert.doesNotMatch(storedText, /sk-test/);
  assert.equal((await store.load()).openAiApiKey, "sk-test");
});

test("serializes partial updates without losing secrets", async (t) => {
  const { directory, store } = await makeStore();
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await store.save({ openAiApiKey: "sk-test", googleDriveParentUrl: "old", prompts: [] });
  await Promise.all([
    store.update((config) => ({ ...config, googleDriveParentUrl: "new" })),
    store.update((config) => ({ ...config, prompts: [{ title: "Ảnh 1", content: "Prompt" }] }))
  ]);
  const config = await store.load();
  assert.equal(config.openAiApiKey, "sk-test");
  assert.equal(config.googleDriveParentUrl, "new");
  assert.equal(config.prompts.length, 1);
});

test("redacts credentials returned to the renderer", () => {
  const safe = redactConfig({
    openAiApiKey: "sk-test",
    notionApiKey: "secret_test",
    googleDriveClientSecret: "client-secret",
    googleDriveAccessToken: "access-token",
    googleDriveRefreshToken: "refresh-token",
    googleDriveParentUrl: "https://drive.test/parent"
  });
  assert.equal(safe.openAiApiKey, undefined);
  assert.equal(safe.notionApiKey, undefined);
  assert.equal(safe.googleDriveAccessToken, undefined);
  assert.equal(safe.openAiApiKeyConfigured, true);
  assert.equal(safe.notionApiKeyConfigured, true);
  assert.equal(safe.googleDriveParentUrl, "https://drive.test/parent");
});

test("migrates a plaintext legacy config and removes the legacy file", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "notion-product-creator-legacy-"));
  const configPath = path.join(directory, "config.json");
  const legacyConfigPath = path.join(directory, "legacy", "config.json");
  await fs.mkdir(path.dirname(legacyConfigPath), { recursive: true });
  await fs.writeFile(legacyConfigPath, JSON.stringify({ openAiApiKey: "sk-legacy", googleDriveParentUrl: "parent" }));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  const prefix = "encrypted:";
  const store = createConfigStore({
    configPath,
    legacyConfigPath,
    defaults: { openAiApiKey: "", googleDriveParentUrl: "" },
    secretFields: ["openAiApiKey"],
    encryptSecret: (value) => `${prefix}${Buffer.from(value).toString("base64")}`,
    decryptSecret: (value) => value.startsWith(prefix)
      ? Buffer.from(value.slice(prefix.length), "base64").toString("utf8")
      : value
  });

  await store.update((config) => config);
  assert.equal(await fs.stat(legacyConfigPath).then(() => true, () => false), false);
  assert.doesNotMatch(await fs.readFile(configPath, "utf8"), /sk-legacy/);
  assert.equal((await store.load()).openAiApiKey, "sk-legacy");
});
