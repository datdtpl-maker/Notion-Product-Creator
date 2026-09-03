const fs = require("fs").promises;
const { existsSync } = require("fs");
const path = require("path");

function createConfigStore({
  configPath,
  legacyConfigPath,
  defaults,
  secretFields = [],
  encryptSecret = (value) => value,
  decryptSecret = (value) => value,
  cacheTtlMs = 1000
}) {
  let writeQueue = Promise.resolve();
  let cachedConfig = null;
  let cacheExpiresAt = 0;

  const cloneConfig = (config) => structuredClone(config);

  function updateCache(config) {
    cachedConfig = cloneConfig(config);
    cacheExpiresAt = Date.now() + Math.max(0, cacheTtlMs);
  }

  async function readConfig({ bypassCache = false } = {}) {
    if (!bypassCache && cachedConfig && Date.now() < cacheExpiresAt) {
      return cloneConfig(cachedConfig);
    }
    const sourcePath = [configPath, legacyConfigPath]
      .find((candidate) => candidate && existsSync(candidate));
    if (!sourcePath) {
      const config = { ...defaults };
      updateCache(config);
      return cloneConfig(config);
    }

    const stored = JSON.parse(await fs.readFile(sourcePath, "utf8"));
    const config = { ...defaults, ...stored };
    for (const field of secretFields) {
      if (typeof config[field] === "string" && config[field]) {
        config[field] = decryptSecret(config[field]);
      }
    }
    updateCache(config);
    return cloneConfig(config);
  }

  async function writeConfig(config) {
    const stored = { ...config };
    for (const field of secretFields) {
      if (typeof stored[field] === "string" && stored[field]) {
        stored[field] = encryptSecret(stored[field]);
      }
    }

    await fs.mkdir(path.dirname(configPath), { recursive: true });
    const temporaryPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(temporaryPath, JSON.stringify(stored, null, 2), { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporaryPath, configPath);
      try { await fs.chmod(configPath, 0o600); } catch {}
      if (legacyConfigPath && path.resolve(legacyConfigPath) !== path.resolve(configPath) && existsSync(legacyConfigPath)) {
        await fs.unlink(legacyConfigPath);
      }
    } catch (error) {
      try { await fs.unlink(temporaryPath); } catch {}
      throw error;
    }
    updateCache(config);
    return cloneConfig(config);
  }

  function enqueue(operation) {
    const result = writeQueue.then(operation, operation);
    writeQueue = result.catch(() => {});
    return result;
  }

  return {
    load: readConfig,
    save(config) {
      return enqueue(() => writeConfig(config));
    },
    update(updater) {
      return enqueue(async () => {
        const current = await readConfig({ bypassCache: true });
        const next = await updater(current);
        return writeConfig(next);
      });
    }
  };
}

function redactConfig(config) {
  const {
    openAiApiKey,
    notionApiKey,
    googleDriveClientSecret,
    googleDriveAccessToken,
    googleDriveRefreshToken,
    ...safeConfig
  } = config;
  return {
    ...safeConfig,
    openAiApiKeyConfigured: Boolean(openAiApiKey),
    notionApiKeyConfigured: Boolean(notionApiKey),
    googleDriveClientSecretConfigured: Boolean(googleDriveClientSecret)
  };
}

module.exports = { createConfigStore, redactConfig };
