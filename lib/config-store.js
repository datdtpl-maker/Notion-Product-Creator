const fs = require("fs").promises;
const { existsSync } = require("fs");
const path = require("path");

function createConfigStore({
  configPath,
  legacyConfigPath,
  defaults,
  secretFields = [],
  encryptSecret = (value) => value,
  decryptSecret = (value) => value
}) {
  let writeQueue = Promise.resolve();

  async function readConfig() {
    const sourcePath = [configPath, legacyConfigPath]
      .find((candidate) => candidate && existsSync(candidate));
    if (!sourcePath) return { ...defaults };

    const stored = JSON.parse(await fs.readFile(sourcePath, "utf8"));
    const config = { ...defaults, ...stored };
    for (const field of secretFields) {
      if (typeof config[field] === "string" && config[field]) {
        config[field] = decryptSecret(config[field]);
      }
    }
    return config;
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
    return config;
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
        const current = await readConfig();
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
