const crypto = require("node:crypto");

function fingerprint(secret) {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

function createApiClientPool({ OpenAI, NotionClient, httpsAgent, timeoutMs = 30_000 }) {
  let openAiEntry = null;
  let notionEntry = null;

  return {
    getOpenAI(apiKey) {
      const key = fingerprint(apiKey);
      if (openAiEntry?.key !== key) {
        openAiEntry = {
          key,
          client: new OpenAI({
            apiKey,
            timeout: timeoutMs,
            maxRetries: 2,
            httpAgent: httpsAgent
          })
        };
      }
      return openAiEntry.client;
    },

    getNotion(apiKey) {
      const key = fingerprint(apiKey);
      if (notionEntry?.key !== key) {
        notionEntry = {
          key,
          client: new NotionClient({ auth: apiKey, timeoutMs, agent: httpsAgent })
        };
      }
      return notionEntry.client;
    }
  };
}

module.exports = { createApiClientPool };
