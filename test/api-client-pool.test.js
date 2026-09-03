const assert = require("node:assert/strict");
const test = require("node:test");
const { createApiClientPool } = require("../lib/api-client-pool");

test("reuses API clients and rotates them when a credential changes", () => {
  const openAiOptions = [];
  const notionOptions = [];
  class FakeOpenAI { constructor(options) { openAiOptions.push(options); } }
  class FakeNotion { constructor(options) { notionOptions.push(options); } }
  const agent = {};
  const pool = createApiClientPool({ OpenAI: FakeOpenAI, NotionClient: FakeNotion, httpsAgent: agent });

  const firstOpenAI = pool.getOpenAI("key-a");
  assert.equal(pool.getOpenAI("key-a"), firstOpenAI);
  assert.notEqual(pool.getOpenAI("key-b"), firstOpenAI);
  assert.equal(openAiOptions.length, 2);
  assert.deepEqual(openAiOptions[0], {
    apiKey: "key-a",
    timeout: 30_000,
    maxRetries: 2,
    httpAgent: agent
  });

  const firstNotion = pool.getNotion("token-a");
  assert.equal(pool.getNotion("token-a"), firstNotion);
  assert.notEqual(pool.getNotion("token-b"), firstNotion);
  assert.equal(notionOptions.length, 2);
  assert.deepEqual(notionOptions[0], { auth: "token-a", timeoutMs: 30_000, agent });
});
