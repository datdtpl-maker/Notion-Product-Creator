// Hotfix for V8 snapshot crypto bug in pkg + Node 18+
try {
  Object.defineProperty(globalThis, "crypto", {
    value: require("crypto").webcrypto,
    configurable: true,
    enumerable: true,
    writable: true
  });
} catch (e) {}

const express = require("express");
const fs = require("fs").promises;
const { existsSync } = require("fs");
const path = require("path");
const { exec, execSync, spawn, execFile } = require("child_process");
const { promisify } = require("util");
const { Client: NotionClient } = require("@notionhq/client");
const OpenAI = require("openai");
const { chromium } = require("playwright");
const nodeCrypto = require("crypto");
const { inferConversationTurnRole, selectNewAssistantImage } = require("./lib/chatgpt-generated-image");
const { createConfigStore, redactConfig } = require("./lib/config-store");
const { listFacebookProductsByStatus, markFacebookProductsAsPublished } = require("./lib/facebook-status");
const { listNumberedImages, resolveProductImageFolder } = require("./lib/product-image-folder");
const { getGoogleDriveFileId, downloadGoogleDriveLogo } = require("./lib/logo-image");

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

async function launchChromeDebug(port, userDataDir, startUrl) {
  const candidates = process.platform === "darwin"
    ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
    : ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"];
  let executable = process.platform === "darwin" ? "google-chrome" : "chrome.exe";
  for (const candidate of candidates) {
    try { await fs.access(candidate); executable = candidate; break; } catch {}
  }
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, "--remote-allow-origins=*", "--new-window", startUrl];
  if (process.platform === "win32") {
    const argsStr = args.map((arg) => `'${arg}'`).join(", ");
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process '${executable}' -ArgumentList ${argsStr}"`);
  } else {
    const child = spawn(executable, args, { detached: true, stdio: "ignore" });
    child.unref();
  }
}

const isPkg = typeof process.pkg !== "undefined";
const appDir = isPkg ? path.dirname(process.execPath) : __dirname;
const isElectron = Boolean(process.versions.electron);
const userConfigBaseDir = process.platform === "darwin"
  ? path.join(process.env.HOME || appDir, "Library", "Application Support")
  : (process.env.APPDATA || path.join(process.env.HOME || appDir, ".config"));
const configDir = process.env.NPC_CONFIG_DIR || (isElectron
  ? path.join(userConfigBaseDir, "NotionProductCreator")
  : appDir);

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(appDir, "public")));

const CONFIG_PATH = path.join(configDir, "config.json");
const LEGACY_CONFIG_PATH = isElectron
  ? path.join(process.env.APPDATA || appDir, "Programs", "NotionProductCreator", "config.json")
  : null;
const SAFE_STORAGE_PREFIX = "electron-safe-storage:v1:";
const SECRET_CONFIG_FIELDS = [
  "openAiApiKey",
  "notionApiKey",
  "googleDriveClientSecret",
  "googleDriveAccessToken",
  "googleDriveRefreshToken"
];
const CONFIG_DEFAULTS = {
  openAiApiKey: "",
  notionApiKey: "",
  defaultDriveParent: "",
  googleDriveParentUrl: "",
  logoImageUrl: "https://drive.google.com/file/d/1N3ushR0ex_Nkr1hH9FkcaJnP90TStp60/view",
  googleDriveClientId: "",
  googleDriveClientSecret: "",
  googleDriveAccessToken: "",
  googleDriveRefreshToken: "",
  googleDriveTokenExpiry: 0,
  chromeDebugPort: 9222,
  chromeUserDataDir: path.join(configDir, "chatgpt_profile"),
  prompts: []
};

function getElectronSafeStorage() {
  if (!isElectron) return null;
  try {
    const { safeStorage } = require("electron");
    return safeStorage.isEncryptionAvailable() ? safeStorage : null;
  } catch {
    return null;
  }
}

function encryptConfigSecret(value) {
  const safeStorage = getElectronSafeStorage();
  if (!value) return value;
  if (!safeStorage) {
    if (!isElectron) return value;
    throw new Error("Không thể truy cập vùng lưu trữ bảo mật của hệ điều hành. Secret chưa được lưu để tránh ghi plaintext.");
  }
  return `${SAFE_STORAGE_PREFIX}${safeStorage.encryptString(value).toString("base64")}`;
}

function decryptConfigSecret(value) {
  if (!value?.startsWith(SAFE_STORAGE_PREFIX)) return value;
  const safeStorage = getElectronSafeStorage();
  if (!safeStorage) {
    throw new Error("Không thể giải mã cấu hình bảo mật trên máy này. Hãy mở ứng dụng Electron bằng đúng tài khoản đã lưu cấu hình.");
  }
  return safeStorage.decryptString(Buffer.from(value.slice(SAFE_STORAGE_PREFIX.length), "base64"));
}

const configStore = createConfigStore({
  configPath: CONFIG_PATH,
  legacyConfigPath: LEGACY_CONFIG_PATH,
  defaults: CONFIG_DEFAULTS,
  secretFields: SECRET_CONFIG_FIELDS,
  encryptSecret: encryptConfigSecret,
  decryptSecret: decryptConfigSecret
});

// System logs buffer for frontend polling
let logs = [];
let pendingGoogleDriveOAuth = null;
let configSecurityMigrated = false;
const addLog = (message, type = "info") => {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = { timestamp, message, type };
  logs.push(logEntry);
  console.log(`[${type.toUpperCase()}] ${message}`);
  if (logs.length > 100) logs.shift();
};

// Helper: extract key points from article content for image prompt
function extractKeyPoints(content) {
  if (!content) return "";
  try {
    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    const keyLines = [];
    
    // 1. Get the summary line (first non-header, non-danh-muc line)
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (lines[i].includes("Danh mục sản phẩm:")) continue;
      if (lines[i].startsWith("#")) continue;
      if (lines[i].startsWith("-") || lines[i].startsWith("*")) continue;
      keyLines.push(lines[i]);
      break;
    }
    
    // 2. Scan for ingredients and key bullet points
    let inTargetSection = false;
    for (const line of lines) {
      if (line.startsWith("## Thành Phần") || line.startsWith("## Công Dụng") || line.startsWith("## Cơ Chế")) {
        inTargetSection = true;
        continue;
      } else if (line.startsWith("##") || line.startsWith("#")) {
        inTargetSection = false;
      }
      
      if (inTargetSection && (line.startsWith("-") || line.startsWith("*") || line.startsWith("+"))) {
        const cleanedLine = line.replace(/^[\-\*\+]\s*/, "").trim();
        if (cleanedLine && keyLines.length < 12) {
          keyLines.push("• " + cleanedLine);
        }
      }
    }
    
    if (keyLines.length > 0) {
      return keyLines.join("\n");
    }
  } catch (e) {
    console.error("Lỗi trích xuất ý chính:", e);
  }
  return content.substring(0, 400); // Fallback
}

async function generateSeoKeywords(apiKey, productName, content) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `Bạn là chuyên gia SEO dược mỹ phẩm. Trả về CHÍNH XÁC 3 từ khóa SEO ngắn, ngăn cách duy nhất bằng dấu phẩy, không đánh số, không hashtag, không giải thích.

Quy tắc bắt buộc theo đúng thứ tự:
1. Từ khóa 1: tên/brand ngắn nhận diện nhất, lấy trực tiếp từ đầu tên sản phẩm; không dùng cụm chung chung như "gel trị mụn".
2. Từ khóa 2: hoạt chất chính có nồng độ nếu có trong tên hoặc nội dung.
3. Từ khóa 3: một công dụng/tình trạng chính, ngắn gọn và đúng dữ liệu.

Ví dụ: "Drogsan Oximin Clindamycin 1% + Benzoyl Peroxide 5% – Gel Điều Trị Mụn Viêm, Mụn Mủ, Mụn Trứng Cá" phải trả về đúng dạng: "Drogsan Oximin, Clindamycin 1%, Mụn viêm".
Không trả từ khóa quá rộng như "trị mụn, ngăn ngừa tái phát, giảm sưng viêm".`
      },
      {
        role: "user",
        content: `Tên sản phẩm: ${productName}\n\nNội dung và công dụng sản phẩm:\n${content}`
      }
    ]
  });

  const keywords = (response.choices[0].message.content || "")
    .replace(/\r?\n/g, " ")
    .split(/[,;]/)
    .map((keyword) => keyword.trim().replace(/^[\-•\d.\s]+/, ""))
    .filter(Boolean)
    .slice(0, 3);

  if (keywords.length < 2) {
    throw new Error("AI không trả về đủ 2-3 từ khóa SEO hợp lệ.");
  }

  return keywords.join(", ");
}

// Helper: download image URL and convert to base64 using native HTTPS module
function downloadImageAsBase64(url) {
  const https = require("https");
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers["content-type"] || "image/png";
        resolve(`data:${contentType};base64,` + buffer.toString("base64"));
      });
      res.on("error", (err) => reject(err));
    }).on("error", (err) => reject(err));
  });
}

function isChatGptContentImageSource(src) {
  if (!src || src.startsWith("data:")) return false;
  if (src.startsWith("blob:")) return true;

  try {
    const host = new URL(src).hostname.toLowerCase();
    return !host.endsWith("oaistatic.com");
  } catch {
    return false;
  }
}

async function collectReadyImages(container) {
  const images = container.locator("img");
  const count = await images.count();
  const readyImages = [];

  for (let index = 0; index < count; index++) {
    const image = images.nth(index);
    const src = await image.getAttribute("src");
    const alt = await image.getAttribute("alt") || "";
    if (!isChatGptContentImageSource(src)) continue;
    const isReady = await image.evaluate((element) => (
      element.complete && element.naturalWidth >= 256 && element.naturalHeight >= 256
    )).catch(() => false);
    if (isReady) readyImages.push({ image, src, alt });
  }
  return readyImages;
}

async function getChatGptConversationTurns(page) {
  const turns = page.locator('[data-testid^="conversation-turn-"]');
  const count = await turns.count();
  const result = [];

  for (let index = 0; index < count; index++) {
    const turn = turns.nth(index);
    const testId = await turn.getAttribute("data-testid");
    const images = await collectReadyImages(turn);
    const authorRole = inferConversationTurnRole({
      ownRole: await turn.getAttribute("data-message-author-role"),
      userMarkerCount: await turn.locator('[data-message-author-role="user"]').count(),
      assistantMarkerCount: await turn.locator('[data-message-author-role="assistant"]').count(),
      readyImageCount: images.length
    });
    result.push({
      turnKey: testId || `conversation-turn-${index}`,
      authorRole,
      images
    });
  }

  if (result.length) return result;

  // Fallback for a future ChatGPT DOM variant without conversation-turn test IDs.
  const assistantMessages = page.locator('[data-message-author-role="assistant"]');
  const assistantCount = await assistantMessages.count();
  for (let index = 0; index < assistantCount; index++) {
    const message = assistantMessages.nth(index);
    result.push({
      turnKey: `assistant-message-${index}`,
      authorRole: "assistant",
      images: await collectReadyImages(message)
    });
  }
  return result;
}

async function filesAreIdentical(firstPath, secondPath) {
  if (!firstPath || !secondPath) return false;
  try {
    const [first, second] = await Promise.all([fs.readFile(firstPath), fs.readFile(secondPath)]);
    if (first.length !== second.length) return false;
    return nodeCrypto.createHash("sha256").update(first).digest("hex") ===
      nodeCrypto.createHash("sha256").update(second).digest("hex");
  } catch {
    return false;
  }
}

async function saveChatGptImage(context, image, src, imagePath) {
  if (src.startsWith("http") && context.request) {
    try {
      const response = await context.request.get(src);
      if (response.ok()) {
        await fs.writeFile(imagePath, await response.body());
        return "original";
      }
      throw new Error(`HTTP ${response.status()}`);
    } catch (err) {
      console.warn(`Không thể tải ảnh gốc từ ChatGPT: ${err.message}`);
    }
  }

  await image.screenshot({ path: imagePath, animations: "disabled" });
  return "screenshot";
}

async function getCompletedPromptImageIndexes(targetFolder) {
  const completed = [];
  for (let index = 1; index <= 4; index++) {
    try {
      const stat = await fs.stat(path.join(targetFolder, `${index}.png`));
      if (stat.isFile() && stat.size > 0) completed.push(index);
    } catch {}
  }
  return completed;
}

// Helper: load config
async function loadConfig() {
  const cfg = await configStore.load();

  // Normalize prompts to objects
  const defaultTitles = [
    "Ảnh 1: Cover Bán Hàng & Insight",
    "Ảnh 2: Infographic Thành Phần",
    "Ảnh 3: Infographic Công Dụng",
    "Ảnh 4: Infographic Hướng Dẫn/Routine"
  ];
  if (!cfg.prompts || cfg.prompts.length === 0) {
    cfg.prompts = defaultTitles.map(t => ({ title: t, content: "" }));
  } else {
    cfg.prompts = cfg.prompts.map((p, i) => {
      if (typeof p === "string") {
        return { title: defaultTitles[i] || `Ảnh ${i+1}`, content: p };
      }
      return p;
    });
  }

  return cfg;
}

// Helper: save config
async function saveConfig(cfg) {
  return configStore.save(cfg);
}

async function updateConfig(updater) {
  return configStore.update(updater);
}

async function getNotionClient() {
  const config = await loadConfig();
  const apiKey = config.notionApiKey?.trim() || process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error("Chưa cấu hình Notion API Key. Hãy nhập khóa trong phần Cấu hình hệ thống.");
  }
  return new NotionClient({ auth: apiKey });
}

// Markdown to Notion Blocks
const parseInlineMarkdown = (text) => {
  const parts = [];
  const regex = /(\*\*|__)(.*?)\1|(`)(.*?)\3|(\*)(.*?)\5|([^_*`]+)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      parts.push({ type: "text", text: { content: match[2] }, annotations: { bold: true } });
    } else if (match[4]) {
      parts.push({ type: "text", text: { content: match[4] }, annotations: { code: true } });
    } else if (match[6]) {
      parts.push({ type: "text", text: { content: match[6] }, annotations: { italic: true } });
    } else if (match[7]) {
      parts.push({ type: "text", text: { content: match[7] } });
    }
  }
  return parts.length > 0 ? parts : [{ type: "text", text: { content: text } }];
};

const markdownToNotionBlocks = (markdown) => {
  const lines = markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    if (line.startsWith("### ")) {
      const content = line.slice(4).trim();
      return {
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: parseInlineMarkdown(content) }
      };
    }
    if (line.startsWith("## ")) {
      const content = line.slice(3).trim();
      return {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: parseInlineMarkdown(content) }
      };
    }
    if (line.startsWith("# ")) {
      const content = line.slice(2).trim();
      return {
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: parseInlineMarkdown(content) }
      };
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const content = line.slice(2).trim();
      return {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: parseInlineMarkdown(content) }
      };
    }
    if (line.startsWith("1. ") || /^\d+\.\s/.test(line)) {
      const content = line.replace(/^\d+\.\s/, "").trim();
      return {
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: { rich_text: parseInlineMarkdown(content) }
      };
    }
    return {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: parseInlineMarkdown(line) }
    };
  });
};

// --- API ROUTES ---

// Get Logs
app.get("/api/logs", (req, res) => {
  res.json(logs);
});

// Clear Logs
app.post("/api/logs/clear", (req, res) => {
  logs = [];
  res.json({ success: true });
});

// Load configuration
app.get("/api/config", async (req, res) => {
  try {
    let config;
    if (!configSecurityMigrated && getElectronSafeStorage()) {
      config = await updateConfig((current) => current);
      configSecurityMigrated = true;
    } else {
      config = await loadConfig();
    }
    res.json(redactConfig(config));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save configuration
app.post("/api/config", async (req, res) => {
  try {
    const newCfg = req.body;
    const merged = await updateConfig((cfg) => {
      const clientIdChanged = Object.prototype.hasOwnProperty.call(newCfg, "googleDriveClientId")
        && newCfg.googleDriveClientId !== cfg.googleDriveClientId;
      const submittedClientSecret = typeof newCfg.googleDriveClientSecret === "string"
        ? newCfg.googleDriveClientSecret.trim()
        : "";
      const submittedOpenAiKey = typeof newCfg.openAiApiKey === "string" ? newCfg.openAiApiKey.trim() : "";
      const submittedNotionKey = typeof newCfg.notionApiKey === "string" ? newCfg.notionApiKey.trim() : "";
      const submittedLogoUrl = typeof newCfg.logoImageUrl === "string" ? newCfg.logoImageUrl.trim() : "";
      if (submittedLogoUrl && !getGoogleDriveFileId(submittedLogoUrl)) {
        throw new Error("Link logo phải là link file Google Drive hợp lệ dạng drive.google.com/file/d/...");
      }
      const next = { ...cfg, ...newCfg };
      next.openAiApiKey = submittedOpenAiKey || cfg.openAiApiKey;
      next.notionApiKey = submittedNotionKey || cfg.notionApiKey;
      next.googleDriveClientSecret = submittedClientSecret || (clientIdChanged ? "" : cfg.googleDriveClientSecret);
      if (clientIdChanged) {
        next.googleDriveAccessToken = "";
        next.googleDriveRefreshToken = "";
        next.googleDriveTokenExpiry = 0;
      }
      return next;
    });
    res.json({ success: true, config: redactConfig(merged) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function saveGoogleDriveParentUrl(req, res) {
  try {
    const googleDriveParentUrl = String(req.body?.googleDriveParentUrl || "").trim();
    const config = await updateConfig((current) => ({ ...current, googleDriveParentUrl }));
    res.json({ success: true, googleDriveParentUrl: config.googleDriveParentUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.patch("/api/config/google-drive-parent", saveGoogleDriveParentUrl);
app.post("/api/config/google-drive-parent", saveGoogleDriveParentUrl);

async function saveLogoImageUrl(req, res) {
  try {
    const logoImageUrl = String(req.body?.logoImageUrl || "").trim();
    if (logoImageUrl && !getGoogleDriveFileId(logoImageUrl)) {
      return res.status(400).json({ error: "Link logo phải là link file Google Drive hợp lệ dạng drive.google.com/file/d/..." });
    }
    const config = await updateConfig((current) => ({ ...current, logoImageUrl }));
    res.json({ success: true, logoImageUrl: config.logoImageUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.patch("/api/config/logo-image", saveLogoImageUrl);
app.post("/api/config/logo-image", saveLogoImageUrl);

app.get("/api/google-drive/status", async (req, res) => {
  try {
    const config = await loadConfig();
    res.json({
      configured: Boolean(config.googleDriveClientId),
      clientSecretConfigured: Boolean(config.googleDriveClientSecret),
      connected: Boolean(config.googleDriveRefreshToken || (config.googleDriveAccessToken && Number(config.googleDriveTokenExpiry) > Date.now()))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/google-drive/start-auth", async (req, res) => {
  try {
    const config = await loadConfig();
    const clientId = config.googleDriveClientId?.trim();
    const clientSecret = config.googleDriveClientSecret?.trim();
    if (!clientId || !clientId.endsWith(".apps.googleusercontent.com")) {
      return res.status(400).json({ error: "Hãy nhập Google OAuth Client ID dạng ...apps.googleusercontent.com và lưu cấu hình trước." });
    }
    if (!clientSecret) {
      return res.status(400).json({ error: "Hãy nhập Google OAuth Client Secret và lưu cấu hình trước." });
    }

    const state = nodeCrypto.randomBytes(24).toString("base64url");
    const verifier = nodeCrypto.randomBytes(48).toString("base64url");
    const challenge = nodeCrypto.createHash("sha256").update(verifier).digest("base64url");
    const redirectUri = "http://127.0.0.1:3000/api/google-drive/oauth/callback";
    pendingGoogleDriveOAuth = { state, verifier, redirectUri, clientId, clientSecret };

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.metadata.readonly",
      access_type: "offline",
      prompt: "select_account consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    res.json({ success: true, authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/google-drive/oauth/callback", async (req, res) => {
  const pending = pendingGoogleDriveOAuth;
  try {
    if (req.query.error) throw new Error(`Google từ chối cấp quyền: ${req.query.error}`);
    if (!pending || req.query.state !== pending.state || !req.query.code) throw new Error("Phiên xác thực Google Drive không hợp lệ hoặc đã hết hạn.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: pending.clientId,
        client_secret: pending.clientSecret,
        redirect_uri: pending.redirectUri,
        grant_type: "authorization_code",
        code_verifier: pending.verifier
      })
    });
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token) throw new Error(tokens.error_description || "Không đổi được mã xác thực Google Drive.");
    await updateConfig((config) => ({
      ...config,
      googleDriveAccessToken: tokens.access_token,
      googleDriveRefreshToken: tokens.refresh_token || config.googleDriveRefreshToken || "",
      googleDriveTokenExpiry: Date.now() + Number(tokens.expires_in || 3600) * 1000
    }));
    addLog("Đã kết nối Google Drive thành công.", "success");
    res.type("html").send("<html><body style='font-family:system-ui;text-align:center;padding:48px'><h2>Đã kết nối Google Drive</h2><p>Bạn có thể đóng cửa sổ này và quay lại Notion Product Creator.</p><script>setTimeout(() => window.close(), 1200)</script></body></html>");
  } catch (err) {
    addLog(`Kết nối Google Drive thất bại: ${err.message}`, "error");
    res.status(400).type("html").send(`<html><body style='font-family:system-ui;padding:48px'><h2>Kết nối Google Drive thất bại</h2><p>${String(err.message).replace(/[<>&]/g, "")}</p></body></html>`);
  } finally {
    pendingGoogleDriveOAuth = null;
  }
});

app.post("/api/google-drive/disconnect", async (req, res) => {
  try {
    const config = await loadConfig();
    const token = config.googleDriveRefreshToken || config.googleDriveAccessToken;
    let revokedRemotely = false;

    if (token) {
      try {
        const revokeResponse = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token })
        });
        revokedRemotely = revokeResponse.ok;
      } catch (err) {
        addLog(`Không thể thu hồi quyền Google từ xa: ${err.message}`, "warning");
      }
    }

    pendingGoogleDriveOAuth = null;
    await updateConfig((current) => ({
      ...current,
      googleDriveAccessToken: "",
      googleDriveRefreshToken: "",
      googleDriveTokenExpiry: 0
    }));
    addLog("Đã ngắt kết nối tài khoản Google Drive. Client ID vẫn được giữ lại.", "success");
    res.json({
      success: true,
      revokedRemotely,
      message: "Đã ngắt kết nối Google Drive. Bấm Kết nối Google Drive để chọn tài khoản khác."
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/app/clear-product-cache", (req, res) => {
  logs = [];
  res.json({ success: true, message: "Đã xóa cache phiên sản phẩm. API Key, Notion token, Google Drive OAuth, link thư mục cha, link logo và prompt vẫn được giữ lại." });
});

// Test OpenAI API Key
app.post("/api/openai/check", async (req, res) => {
  try {
    const config = await loadConfig();
    const apiKey = String(req.body?.apiKey || "").trim() || config.openAiApiKey;
    if (!apiKey) return res.status(400).json({ error: "Vui lòng cung cấp API Key." });
    const openai = new OpenAI({ apiKey });
    await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5
    });
    res.json({ success: true, message: "Kết nối thành công! API Key hoạt động bình thường." });
  } catch (err) {
    res.status(400).json({ error: `Kiểm tra thất bại: ${err.message}` });
  }
});

// Write Post Content using OpenAI
app.post("/api/openai/generate-content", async (req, res) => {
  const { productName, details, category, price, driveParent } = req.body;
  if (!productName) {
    return res.status(400).json({ error: "Thiếu tên sản phẩm." });
  }

  const config = await loadConfig();
  const apiKey = config.openAiApiKey;
  if (!apiKey) {
    return res.status(400).json({ error: "Chưa cấu hình OpenAI API Key trong ứng dụng." });
  }

  // Create product folder immediately if driveParent is provided
  if (driveParent) {
    const targetFolder = path.join(driveParent, productName.replace(/[\\/:*?"<>|]/g, ""));
    try {
      await fs.mkdir(targetFolder, { recursive: true });
      addLog(`Đã tự động tạo thư mục lưu trữ sản phẩm: "${targetFolder}"`, "success");
    } catch (err) {
      addLog(`Lỗi tự động tạo thư mục lưu trữ: ${err.message}`, "warning");
    }
  }

  addLog(`Đang tạo nội dung bài viết cho sản phẩm: "${productName}"...`, "info");

  try {
    const openai = new OpenAI({ apiKey });
    const systemPrompt = `
Bạn là một dược sĩ lâm sàng cao cấp và chuyên gia sáng tạo nội dung cho nhà thuốc Khải Hoàn Skincare.
Nhiệm vụ của bạn là viết một bài viết giới thiệu sản phẩm mới theo phong cách chuyên nghiệp, thực tế, đi thẳng vào vấn đề bệnh lý và công dụng thực tế của hoạt chất, không dùng từ ngữ ẩn dụ hoa mỹ sáo rỗng.

Cấu trúc bài viết bắt buộc phải tuân theo cấu trúc Markdown chính xác sau:

Danh mục sản phẩm: [Tên danh mục] - Giá: [Giá tiền]

[Tóm tắt ngắn gọn 1-2 câu giới thiệu về sản phẩm. Sử dụng văn bản thường, KHÔNG in đậm, KHÔNG sử dụng ký tự **]

## Thành Phần Chính

### [Tên hoạt chất 1 kèm hàm lượng/nồng độ nếu có, ví dụ: Clindamycin 10mg/g]
[Mô tả chi tiết và thực tế về tác dụng sinh học, cơ chế hoạt động của hoạt chất đối với da]
* [Lợi ích 1]
* [Lợi ích 2]
* [Lợi ích 3]
* [Lợi ích 4]

### [Tên hoạt chất 2 kèm hàm lượng/nồng độ nếu có, ví dụ: Benzoyl Peroxide 50mg/g]
[Mô tả chi tiết và thực tế về tác dụng sinh học, cơ chế hoạt động của hoạt chất đối với da]
* [Lợi ích 1]
* [Lợi ích 2]
* [Lợi ích 3]
* [Lợi ích 4]

## Cơ Chế Hoạt Động
[Một đoạn ngắn giải thích cơ chế phối hợp hoạt chất bổ trợ lẫn nhau]
* **[Hoạt chất 1]** giúp...
* **[Hoạt chất 2]** giúp...
[Câu kết luận về đối tượng và mức độ điều trị phù hợp cho sự phối hợp cơ chế này]

# Công Dụng Nổi Bật
* [Công dụng 1]
* [Công dụng 2]
* [Công dụng 3]
* [Công dụng 4]
* [Công dụng 5]
* [Công dụng 6]
* [Công dụng 7]

## Đối Tượng Phù Hợp
* [Đối tượng 1]
* [Đối tượng 2]
* [Đối tượng 3]
* [Đối tượng 4]

## Hướng Dẫn Sử Dụng
[Đoạn khuyến nghị sử dụng theo dược sĩ Khải Hoàn]
* [Hướng dẫn/Lưu ý/Bước 1]
* [Hướng dẫn/Lưu ý/Bước 2]
* [Hướng dẫn/Lưu ý/Bước 3]
* [Hướng dẫn/Lưu ý/Bước 4]
* [Hướng dẫn/Lưu ý/Bước 5]

## Khuyến Cáo Quan Trọng Khi Sử Dụng
* [Khuyến cáo 1]
* [Khuyến cáo 2]
* [Khuyến cáo 3]
* [Khuyến cáo 4]
* [Khuyến cáo 5]
* [Khuyến cáo 6]
* [Khuyến cáo 7]
* [Khuyến cáo 8]

## Kết Luận
[Đoạn kết luận ngắn gọn tổng hợp tên sản phẩm, các hoạt chất chính và ứng dụng thực tế. Sử dụng văn bản thường, KHÔNG in đậm, KHÔNG sử dụng ký tự **]

Liên hệ Khải Hoàn Skincare/Nhà thuốc Khải Hoàn để được dược sĩ tư vấn cách sử dụng [Tên sản phẩm] phù hợp với tình trạng da và routine hiện tại của bạn. (Sử dụng văn bản thường, KHÔNG in đậm, KHÔNG sử dụng ký tự **)

Lưu ý: Không thêm bất kỳ văn bản giải thích hoặc định dạng nào khác ngoài cấu trúc Markdown trên. KHÔNG tự ý thêm tiêu đề H1 (#) ở đầu bài viết.
    `.trim();

    const userPrompt = `
Tên sản phẩm: ${productName}
Danh mục: ${category || "Trị mụn"}
Giá: ${price || "350.000"}
Thông tin bổ sung hoạt chất/công dụng/ghi chú:
${details || "Không cung cấp thêm chi tiết."}
    `.trim();

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7
    });

    const content = response.choices[0].message.content.trim();
    addLog(`Đã tạo nội dung thành công cho sản phẩm.`, "success");
    res.json({ success: true, content });
  } catch (err) {
    addLog(`Lỗi tạo nội dung: ${err.message}`, "error");
    res.status(500).json({ error: err.message });
  }
});

// Open the operating system's native folder dialog. This lets the user choose
// any mounted drive on Windows or macOS instead of starting from a fixed path.
app.post("/api/system/select-folder", async (req, res) => {
  if (!process.versions.electron) {
    return res.status(501).json({ error: "Chức năng chọn thư mục chỉ hoạt động trong ứng dụng desktop." });
  }

  try {
    const { dialog, BrowserWindow } = require("electron");
    const requestedPath = typeof req.body?.path === "string" ? req.body.path.trim() : "";
    const defaultPath = requestedPath && existsSync(requestedPath) ? requestedPath : undefined;
    const ownerWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const result = await dialog.showOpenDialog(ownerWindow, {
      title: "Chọn thư mục sản phẩm và ảnh",
      defaultPath,
      properties: ["openDirectory", "createDirectory"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return res.json({ canceled: true });
    }

    res.json({ canceled: false, path: result.filePaths[0] });
  } catch (err) {
    res.status(500).json({ error: `Không thể mở hộp chọn thư mục: ${err.message}` });
  }
});

// Kept for compatibility with older app windows that may still be open.
app.get("/api/drive/list-folders", async (req, res) => {
  const currentPath = req.query.path || path.parse(process.cwd()).root;
  try {
    const resolved = path.resolve(currentPath);
    try {
      await fs.access(resolved);
    } catch {
      return res.json({
        currentPath: resolved,
        parentPath: "",
        folders: []
      });
    }

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const folders = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
      .map(entry => entry.name)
      .sort();

    const parentPath = path.dirname(resolved) === resolved ? "" : path.dirname(resolved);

    res.json({
      currentPath: resolved,
      parentPath,
      folders,
      separator: path.sep
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Chrome Debug Port 9222
app.post("/api/chrome/start", async (req, res) => {
  try {
    const config = await loadConfig();
    const port = config.chromeDebugPort || 9222;
    const userDataDir = config.chromeUserDataDir || path.join(configDir, "chatgpt_profile");

    await fs.mkdir(userDataDir, { recursive: true });

    addLog(`Đang khởi động Chrome Debug...`, "info");
    await launchChromeDebug(port, userDataDir, "https://chatgpt.com");

    res.json({ success: true, message: "Đã kích hoạt Chrome Debug trên Windows Desktop. Vui lòng kiểm tra màn hình của bạn." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Check Chrome Debug Status
app.get("/api/chrome/status", async (req, res) => {
  const config = await loadConfig();
  const port = config.chromeDebugPort || 9222;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    res.json({ online: response.ok });
  } catch {
    clearTimeout(timeout);
    res.json({ online: false });
  }
});

function getGoogleDriveFolderId(value) {
  const text = String(value || "").trim();
  const match = text.match(/(?:folders\/|[?&]id=)([A-Za-z0-9_-]{10,})/) || text.match(/^([A-Za-z0-9_-]{20,})$/);
  return match?.[1] || null;
}

function toGoogleDriveFolderUrl(driveId) {
  return `https://drive.google.com/drive/u/0/folders/${driveId}`;
}

// Resolve the real Drive folder ID from the local Google Drive Desktop metadata.
// Windows uses an alternate data stream; macOS uses Google Drive File Provider xattrs.
async function getDriveFolderId(folderPath) {
  if (process.platform === "darwin") {
    const attributes = [
      "com.google.drivefs.item-id",
      "com.google.drivefs.file-id",
      "com.google.drivefs.metadata"
    ];
    for (const attribute of attributes) {
      try {
        const { stdout } = await execFileAsync("xattr", ["-p", attribute, folderPath]);
        const driveId = getGoogleDriveFolderId(stdout);
        if (driveId) return driveId;
      } catch {
        // Try the next Drive File Provider metadata attribute.
      }
    }
    return null;
  }

  try {
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path '${folderPath}' -Stream 'user.drive.id'"`;
    const { stdout } = await execAsync(cmd);
    const driveId = getGoogleDriveFolderId(stdout);
    if (driveId) return driveId;
  } catch (err) {
    // Ignore error
  }
  return null;
}

function escapeGoogleDriveQueryValue(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getGoogleDriveAccessToken() {
  const config = await loadConfig();
  if (config.googleDriveAccessToken && Number(config.googleDriveTokenExpiry) > Date.now() + 30_000) {
    return config.googleDriveAccessToken;
  }
  if (!config.googleDriveClientId || !config.googleDriveClientSecret || !config.googleDriveRefreshToken) {
    throw new Error("Chưa kết nối Google Drive. Hãy nhập Client ID rồi bấm Kết nối Google Drive.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleDriveClientId,
      client_secret: config.googleDriveClientSecret,
      refresh_token: config.googleDriveRefreshToken,
      grant_type: "refresh_token"
    })
  });
  const tokens = await response.json();
  if (!response.ok || !tokens.access_token) {
    throw new Error(tokens.error_description || "Không thể làm mới quyền Google Drive. Hãy kết nối lại Google Drive.");
  }
  await updateConfig((current) => ({
    ...current,
    googleDriveAccessToken: tokens.access_token,
    googleDriveTokenExpiry: Date.now() + Number(tokens.expires_in || 3600) * 1000
  }));
  return tokens.access_token;
}

async function findGoogleDriveChildFolderId(parentUrl, productName) {
  const parentId = getGoogleDriveFolderId(parentUrl);
  if (!parentId || !productName) return null;

  const accessToken = await getGoogleDriveAccessToken();
  const query = `'${parentId}' in parents and name = '${escapeGoogleDriveQueryValue(productName)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name)",
    pageSize: "10",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true"
  });
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Không thể tìm thư mục sản phẩm trên Google Drive.");
  const folders = data.files || [];
  if (!folders.length) return null;
  if (folders.length > 1) {
    throw new Error(`Có nhiều thư mục con tên "${productName}" trong Google Drive. Hãy đổi tên để mỗi sản phẩm có một thư mục riêng.`);
  }
  return folders[0].id;
}

async function resolveDriveFolderUrl(folderPath, suppliedParentUrl, productName) {
  if (suppliedParentUrl && !getGoogleDriveFolderId(suppliedParentUrl)) {
    throw new Error("Link Google Drive thư mục cha không hợp lệ. Hãy dán link có dạng drive.google.com/drive/u/0/folders/<ID>.");
  }
  // The local product folder is the source of truth. Its Drive File Provider
  // metadata maps to the child folder's real remote ID, not the parent's ID.
  const driveId = await getDriveFolderId(folderPath);
  if (driveId) return toGoogleDriveFolderUrl(driveId);

  // Google Drive for macOS may not expose local metadata. OAuth provides a
  // reliable remote fallback from the true parent link and product folder name.
  if (suppliedParentUrl && productName) {
    const remoteChildId = await findGoogleDriveChildFolderId(suppliedParentUrl, productName);
    if (remoteChildId) return toGoogleDriveFolderUrl(remoteChildId);
  }
  return null;
}

// Helper: Query coordination page by title
async function findCoordinationPageByTitle(notion, productName) {
  const coordinationDbId = "9788b8a0-31cc-42d3-91be-4e26d6b8c8e8";
  const response = await notion.databases.query({
    database_id: coordinationDbId,
    filter: {
      property: "Tên sản phẩm",
      title: {
        equals: productName
      }
    }
  });
  if (response.results && response.results.length > 0) {
    return response.results[0];
  }
  return null;
}

// Generate single image on-demand using Playwright
app.post("/api/chrome/generate-single-image", async (req, res) => {
  const { productName, driveParent, driveUrl: suppliedDriveUrl, promptIndex, promptText, details, content, referenceImage, logoImageUrl } = req.body;
  if (!productName) {
    return res.status(400).json({ error: "Thiếu tên sản phẩm." });
  }
  if (!driveParent) {
    return res.status(400).json({ error: "Thiếu thư mục Google Drive." });
  }
  if (!promptIndex || !promptText) {
    return res.status(400).json({ error: "Thiếu prompt tạo ảnh." });
  }

  const config = await loadConfig();
  const port = config.chromeDebugPort || 9222;

  // Create folder inside Drive
  const targetFolder = path.join(driveParent, productName.replace(/[\\/:*?"<>|]/g, ""));
  addLog(`[Ảnh ${promptIndex}] Đang tạo thư mục sản phẩm: "${targetFolder}"...`, "info");
  
  try {
    await fs.mkdir(targetFolder, { recursive: true });
    
    // Only Prompt 1 uploads the reference image. Prompts 2-4 continue the same chat with text only.
    const shouldAttachReferenceImage = Number(promptIndex) === 1;
    let refImagePath = null;
    if (shouldAttachReferenceImage && referenceImage) {
      const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, "");
      refImagePath = path.join(targetFolder, "reference_image.png");
      await fs.writeFile(refImagePath, Buffer.from(base64Data, "base64"));
      addLog(`[Ảnh ${promptIndex}] Đã lưu ảnh sản phẩm gốc: reference_image.png`, "info");
    } else if (shouldAttachReferenceImage) {
      const existingRef = path.join(targetFolder, "reference_image.png");
      if (existsSync(existingRef)) {
        refImagePath = existingRef;
      }
    } else {
      addLog(`[Image ${promptIndex}] Continuing the current chat with text only; the product image is not uploaded again.`, "info");
    }

    const effectiveLogoUrl = String(logoImageUrl || config.logoImageUrl || "").trim();
    let logoImagePath = null;
    if (effectiveLogoUrl) {
      addLog(`[Ảnh ${promptIndex}] Đang tải logo thương hiệu từ Google Drive...`, "info");
      logoImagePath = await downloadGoogleDriveLogo(effectiveLogoUrl, targetFolder);
      addLog(`[Ảnh ${promptIndex}] Đã chuẩn bị logo để gắn ở góc trên bên phải.`, "success");
    }

    // Get Drive ID
    addLog(`[Ảnh ${promptIndex}] Đang lấy Google Drive ID...`, "info");
    const driveUrl = await resolveDriveFolderUrl(targetFolder, suppliedDriveUrl, productName);
    if (!driveUrl) {
      addLog(`[Ảnh ${promptIndex}] Không đọc được Google Drive ID trên máy này. Ảnh vẫn được lưu local; hãy dán link thư mục Drive thật trước khi đẩy bài lên Notion.`, "warning");
    }

    // Start background single image automation
    runSingleImageAutomationInBackground(port, refImagePath, logoImagePath, promptText, promptIndex, targetFolder, productName, driveUrl, details, content);

    res.json({
      success: true,
      message: driveUrl
        ? `Đã khởi chạy tiến trình sinh ảnh ${promptIndex} trong nền.`
        : `Đã khởi chạy sinh ảnh ${promptIndex}. Chưa có link Drive thật; hãy dán link thư mục sản phẩm trước khi đẩy Notion.`,
      driveUrl
    });
  } catch (err) {
    addLog(`Lỗi khởi chạy sinh ảnh: ${err.message}`, "error");
    res.status(500).json({ error: err.message });
  }
});

// Run single image Playwright automation in background
async function runSingleImageAutomationInBackground(port, refImagePath, logoImagePath, promptText, promptIndex, targetFolder, productName, driveUrl, details, content) {
  addLog(`[Ảnh ${promptIndex}] Đang kết nối đến Chrome Debugging Port ${port}...`, "info");
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://localhost:${port}`);
    const context = browser.contexts()[0];
    
    let page = context.pages().find((p) => p.url().includes("chatgpt.com"));
    if (!page) {
      addLog(`[Ảnh ${promptIndex}] Không tìm thấy tab ChatGPT. Đang mở tab mới...`, "info");
      page = await context.newPage();
      await page.goto("https://chatgpt.com");
      await page.waitForLoadState("load");
    }

    addLog(`[Ảnh ${promptIndex}] Đợi ô nhập liệu ChatGPT (#prompt-textarea) sẵn sàng...`, "info");
    await page.waitForSelector("#prompt-textarea", { timeout: 20000 });

    const sendSelectors = [
      'button[data-testid="send-button"]',
      'button[data-testid="fruitjuice-send-button"]',
      'button[aria-label="Send prompt"]',
      'button[aria-label="Gửi phản hồi"]',
      '#prompt-textarea ~ button'
    ];

    addLog(`[Ảnh ${promptIndex}] Đang chuẩn bị gửi Prompt: "${promptText.slice(0, 50)}..."`, "info");

    // 1. Upload the product reference (Prompt 1 only) and the brand logo (all prompts).
    const attachmentPaths = [refImagePath, logoImagePath].filter(Boolean);
    if (attachmentPaths.length) {
      addLog(`[Ảnh ${promptIndex}] Đang upload ${attachmentPaths.length} ảnh tham chiếu...`, "info");
      try {
        for (const attachmentPath of attachmentPaths) {
          const fileInput = await page.$('input[type="file"]');
          if (!fileInput) throw new Error("Không tìm thấy ô upload file của ChatGPT.");
          await fileInput.setInputFiles(attachmentPath);
          await new Promise((r) => setTimeout(r, 4000));
        }
      } catch (err) {
        throw new Error(`Không thể upload ảnh tham chiếu/logo: ${err.message}`);
      }
    }

    // Record existing assistant turns. Image URLs can change after lazy-loading,
    // so URL-only comparison can mistake the uploaded reference for a new result.
    let initialAssistantTurnKeys;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        initialAssistantTurnKeys = new Set(
          (await getChatGptConversationTurns(page))
            .filter((turn) => turn.authorRole === "assistant")
            .map((turn) => turn.turnKey)
        );
        break;
      } catch (error) {
        addLog(`[Ảnh ${promptIndex}] Chưa chụp được mốc lượt trả lời (lần ${attempt}/3): ${error.message}`, "warning");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!initialAssistantTurnKeys) {
      throw new Error("Không thể ghi nhận các lượt trả lời ChatGPT hiện có; đã dừng để tránh lưu nhầm ảnh mẫu.");
    }

    // 2. Fill prompt with dynamic placeholders
    const safeDetails = details || "";
    const keyPoints = extractKeyPoints(content || "");
    let promptProcessed = (promptText || "")
      .replace(/\{\{selected_keywords\}\}/g, safeDetails || productName)
      .replace(/\{\{selected_notion_content\}\}/g, keyPoints || ("Ảnh sản phẩm " + productName))
      .replace(/A1/g, "ảnh sản phẩm mẫu đã tải lên");

    promptProcessed += "\n\nYêu cầu bắt buộc về đầu ra: tạo ảnh vuông tỉ lệ 1:1 (square image), bố cục hiển thị trọn vẹn trong khung vuông, không tạo ảnh dọc hoặc ngang.";
    if (logoImagePath) {
      promptProcessed += "\n\nYêu cầu logo bắt buộc: file brand_logo đính kèm là logo thương hiệu chính thức. Đặt logo trong vùng phía trên bên phải nhưng dịch vào bên trái: mép phải của logo cách mép phải ảnh khoảng 7-9% chiều rộng, mép trên cách mép trên ảnh khoảng 5-7% chiều cao; chiều rộng logo khoảng 12-15% chiều rộng ảnh. Luôn chừa một vùng trống riêng cho logo. Tuyệt đối không để logo chồng lên tiêu đề, chữ, thông tin, biểu tượng quan trọng hoặc sản phẩm. Nếu vùng đặt logo đang có chữ, phải sắp xếp chữ sang trái hoặc xuống dưới để logo và toàn bộ nội dung đều dễ đọc. Giữ nguyên hình dạng, chữ, màu sắc và tỷ lệ của logo; không vẽ lại, không đổi chữ, không biến dạng và không tạo thêm logo khác.";
    }

    await page.focus("#prompt-textarea");
    
    // Clear existing text securely using native key presses
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");

    // Native text insertion via Playwright keyboard API (avoids CDP serialization entirely)
    await page.keyboard.insertText(promptProcessed);
    
    await new Promise((r) => setTimeout(r, 500));
    await page.keyboard.press("Space");
    await page.keyboard.press("Backspace");
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Send prompt
    let clicked = false;
    for (const sel of sendSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          clicked = true;
          addLog(`[Ảnh ${promptIndex}] Đã nhấn nút gửi prompt thành công.`, "info");
          break;
        }
      } catch (e) {}
    }
    if (!clicked) {
      await page.keyboard.press("Enter");
      addLog(`[Ảnh ${promptIndex}] Gửi bằng phím Enter.`, "info");
    }

    // 4. Wait for DALL-E image generation
    addLog(`[Ảnh ${promptIndex}] Đang đợi DALL-E sinh ảnh (tối đa 5 phút)...`, "info");
    let foundImage = false;
    const startTime = Date.now();

    while (Date.now() - startTime < 300000) {
      await new Promise((r) => setTimeout(r, 4000));
      
      try {
        const candidate = selectNewAssistantImage(
          await getChatGptConversationTurns(page),
          initialAssistantTurnKeys
        );
        if (!candidate) continue;

        const { image, src } = candidate;
        const imagePath = path.join(targetFolder, `${promptIndex}.png`);
        addLog(`[Ảnh ${promptIndex}] Đã tìm thấy ảnh trong lượt trả lời mới của ChatGPT. Đang tải ảnh về máy...`, "info");
        try {
          const savedAs = await saveChatGptImage(context, image, src, imagePath);
          if (await filesAreIdentical(refImagePath, imagePath) || await filesAreIdentical(logoImagePath, imagePath)) {
            await fs.unlink(imagePath).catch(() => {});
            addLog(`[Ảnh ${promptIndex}] Đã loại ảnh trùng với ảnh mẫu; tiếp tục chờ kết quả ChatGPT.`, "warning");
            continue;
          }
          addLog(`[Ảnh ${promptIndex}] Đã lưu ${promptIndex}.png (${savedAs === "original" ? "file kết quả ChatGPT chất lượng gốc" : "ảnh hiển thị kết quả ChatGPT"}).`, "success");
          foundImage = true;
          break;
        } catch (downloadErr) {
          addLog(`[Ảnh ${promptIndex}] Chưa lưu được ảnh: ${downloadErr.message}, đang đợi...`, "warning");
        }
      } catch (err) {
        addLog(`[Ảnh ${promptIndex}] Không thể kiểm tra ảnh mới: ${err.message}`, "warning");
      }
    }

    if (foundImage) {
      addLog(`[Ảnh ${promptIndex}] Đã tải về và lưu thành công: ${promptIndex}.png`, "success");

      const completedImageIndexes = await getCompletedPromptImageIndexes(targetFolder);
      if (completedImageIndexes.length < 4) {
        addLog(`[Ảnh ${promptIndex}] Đã có ${completedImageIndexes.length}/4 ảnh. Chưa đồng bộ Notion; chờ đủ 1.png đến 4.png.`, "info");
        return;
      }

      // 5. Only after all four generated images exist, update Notion to
      // "Content đang làm". The manual Push to Notion action also keeps this
      // status while checking "Content xong", so Content can revise the images.
      try {
        const coordinationDbId = "9788b8a0-31cc-42d3-91be-4e26d6b8c8e8";
        const notion = await getNotionClient();
        const mediaProperty = driveUrl ? { "Media sản phẩm": { url: driveUrl } } : {};
        
        const existingPage = await findCoordinationPageByTitle(notion, productName);
        if (existingPage) {
          addLog(`[Ảnh ${promptIndex}] Cập nhật trạng thái "Content đang làm" trên Notion...`, "info");
          await notion.pages.update({
            page_id: existingPage.id,
            properties: {
              ...mediaProperty,
              "Trạng thái": {
                select: {
                  name: "Content đang làm"
                }
              },
              "Content xong": {
                checkbox: false
              }
            }
          });
        } else {
          addLog(`[Ảnh ${promptIndex}] Tạo mới trang điều phối với trạng thái "Content đang làm" trên Notion...`, "info");
          await notion.pages.create({
            parent: { database_id: coordinationDbId },
            properties: {
              "Tên sản phẩm": {
                title: [
                  {
                    text: { content: productName }
                  }
                ]
              },
              ...mediaProperty,
              "Trạng thái": {
                select: {
                  name: "Content đang làm"
                }
              },
              "Content xong": {
                checkbox: false
              }
            }
          });
        }
        addLog(`[Ảnh ${promptIndex}] Đồng bộ trạng thái Notion thành công!`, "success");
      } catch (notionErr) {
        addLog(`[Ảnh ${promptIndex}] Cảnh báo đồng bộ Notion: ${notionErr.message}`, "warning");
      }

    } else {
      addLog(`[Ảnh ${promptIndex}] Lỗi: Không tải được ảnh hoặc quá thời gian chờ.`, "error");
    }

  } catch (err) {
    addLog(`[Ảnh ${promptIndex}] Lỗi Playwright: ${err.message}`, "error");
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

app.post("/api/facebook/start", async (req, res) => {
  try {
    const config = await loadConfig();
    const port = config.facebookDebugPort || 9223;
    const userDataDir = config.facebookUserDataDir || path.join(configDir, "facebook_profile");
    await fs.mkdir(userDataDir, { recursive: true });
    await launchChromeDebug(port, userDataDir, "https://www.facebook.com");
    res.json({ success: true, message: "Đã mở Facebook Debug. Hãy đăng nhập và chuyển đúng vào Page trước khi đăng bài." });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const COORDINATION_DATABASE_ID = "9788b8a0-31cc-42d3-91be-4e26d6b8c8e8";

// List products that are ready to be prepared for Facebook posting.
app.get("/api/facebook/pending-products", async (req, res) => {
  try {
    const notion = await getNotionClient();
    const products = await listFacebookProductsByStatus(notion, COORDINATION_DATABASE_ID, "Chưa đăng");
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: `Không thể quét danh sách Notion: ${err.message}` });
  }
});

app.get("/api/facebook/waiting-products", async (req, res) => {
  try {
    const notion = await getNotionClient();
    const products = await listFacebookProductsByStatus(notion, COORDINATION_DATABASE_ID, "Chờ đăng");
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: `Không thể quét bài Facebook Chờ đăng: ${err.message}` });
  }
});

app.post("/api/facebook/mark-waiting-as-published", async (req, res) => {
  try {
    const notion = await getNotionClient();
    const products = await listFacebookProductsByStatus(notion, COORDINATION_DATABASE_ID, "Chờ đăng");
    if (!products.length) return res.json({ success: true, updatedCount: 0, products: [] });

    const result = await markFacebookProductsAsPublished(notion, products);
    if (result.failures.length) {
      return res.status(500).json({
        error: `Đã cập nhật ${result.updatedCount}/${products.length} bài. ${result.failures.length} bài bị lỗi; hãy quét lại để thử tiếp.`,
        updatedCount: result.updatedCount,
        failures: result.failures
      });
    }

    addLog(`Đã xác nhận ${result.updatedCount} bài Facebook và chuyển Notion sang trạng thái “Đã đăng”.`, "success");
    res.json({ success: true, updatedCount: result.updatedCount, products });
  } catch (err) {
    res.status(500).json({ error: `Không thể cập nhật trạng thái Facebook: ${err.message}` });
  }
});

app.get("/api/facebook/product", async (req, res) => {
  try {
    const productName = String(req.query.productName || "").trim();
    if (!productName) return res.status(400).json({ error: "Thiếu tên sản phẩm." });
    const notion = await getNotionClient();
    const page = await findCoordinationPageByTitle(notion, productName);
    if (!page) return res.status(404).json({ error: "Không tìm thấy sản phẩm trong Notion." });
    res.json({ productName, pageId: page.id, webUrl: page.properties["Link web"]?.url || "", mediaUrl: page.properties["Media sản phẩm"]?.url || "" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/facebook/generate-content", async (req, res) => {
  try {
    const { productName, webUrl, template } = req.body;
    const config = await loadConfig();
    if (!config.openAiApiKey) return res.status(400).json({ error: "Chưa cấu hình OpenAI API Key." });
    const openai = new OpenAI({ apiKey: config.openAiApiKey });
    const response = await openai.chat.completions.create({ model: "gpt-4o-mini", temperature: 0.8, messages: [{ role: "system", content: "Bạn viết bài Facebook ngắn gọn cho Khải Hoàn Skincare. Không bịa công dụng, dùng ngôn từ an toàn. Trả về duy nhất nội dung bài đăng, có CTA và link web cuối bài." }, { role: "user", content: `Sản phẩm: ${productName}\nLink web: ${webUrl || "chưa có"}\nMẫu tham khảo:\n${template || "Không có mẫu; hãy viết bài bán hàng ngắn gọn, dễ đọc."}` }] });
    res.json({ content: response.choices[0].message.content.trim() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/api/facebook/publish", async (req, res) => {
  let browser;
  try {
    const { productName, content, driveParent } = req.body;
    const config = await loadConfig();
    if (!config.facebookPageUrl) return res.status(400).json({ error: "Chưa cấu hình URL Page Facebook." });
    const folder = await resolveProductImageFolder(driveParent || config.defaultDriveParent || "", productName);
    const imagePaths = (await listNumberedImages(folder)).map((file) => path.join(folder, file));
    if (!imagePaths.length) return res.status(400).json({ error: "Không tìm thấy ảnh 1.png đến 4.png trong thư mục sản phẩm." });
    browser = await chromium.connectOverCDP(`http://localhost:${config.facebookDebugPort || 9223}`);
    const context = browser.contexts()[0]; const page = context.pages()[0] || await context.newPage();
    await page.goto(config.facebookPageUrl, { waitUntil: "domcontentloaded" });
    const composer = page.locator('div[role="button"]').filter({ hasText: /Bạn đang nghĩ gì|What.?s on your mind|Tạo bài viết/i }).first();
    await composer.waitFor({ timeout: 30000 }); await composer.click();
    const dialog = page.locator('[role="dialog"]').last();
    // Facebook currently renders the composer editor outside the dialog subtree.
    // The comment box has an aria-label, while the post composer does not.
    const editor = page.locator('div[contenteditable="true"][role="textbox"]:not([aria-label])').last();
    await editor.waitFor({ timeout: 15000 }); await editor.click(); await page.keyboard.insertText(content);
    const fileInput = page.locator('input[type="file"][multiple]').last();
    await fileInput.setInputFiles(imagePaths); await page.waitForTimeout(5000);
    const notion = await getNotionClient();
    const record = await findCoordinationPageByTitle(notion, productName);
    if (!record) throw new Error("Không tìm thấy trang điều phối sản phẩm để lưu bài Facebook.");

    // Save exactly the content in the editor (including user edits) as a
    // separate Facebook article page, then link it to the product record.
    const contentDataSourceId = "22c70655-a9aa-80f5-a0b5-000b9dfd1d8b";
    const facebookBlocks = markdownToNotionBlocks(content);
    const facebookContentPage = await notion.pages.create({
      parent: { data_source_id: contentDataSourceId },
      properties: {
        "Tên tài liệu": { title: [{ text: { content: `${productName} FACEBOOK` } }] },
        "Status": { select: { name: "Hoàn thành" } }
      },
      children: facebookBlocks.slice(0, 100)
    });

    for (let i = 100; i < facebookBlocks.length; i += 100) {
      await notion.blocks.children.append({ block_id: facebookContentPage.id, children: facebookBlocks.slice(i, i + 100) });
    }

    const currentRelations = record.properties["Bài content Tây"]?.relation || [];
    const relatedContent = [...currentRelations, { id: facebookContentPage.id }]
      .filter((relation, index, list) => list.findIndex((item) => item.id === relation.id) === index);
    await notion.pages.update({
      page_id: record.id,
      properties: {
        "Bài content Tây": { relation: relatedContent },
        Facebook: { select: { name: "Chờ đăng" } }
      }
    });
    res.json({
      success: true,
      facebookContentPageUrl: facebookContentPage.url,
      message: "Đã đưa nội dung và ảnh vào form Facebook, lưu bài vào Notion và chuyển trạng thái thành Chờ đăng."
    });
  } catch (err) { res.status(err.code === "PRODUCT_IMAGE_FOLDER_NOT_FOUND" ? 400 : 500).json({ error: err.message }); }
  finally { if (browser) await browser.close(); }
});

// Sync Notion Databases
app.post("/api/notion/sync", async (req, res) => {
  const { productName, content, driveUrl, driveParent } = req.body;
  if (!productName || !content) {
    return res.status(400).json({ error: "Thiếu dữ liệu đồng bộ Notion (tên sản phẩm hoặc nội dung bài viết)." });
  }

  const contentDataSourceId = "22c70655-a9aa-80f5-a0b5-000b9dfd1d8b"; // Công việc của Tây
  const coordinationDbId = "9788b8a0-31cc-42d3-91be-4e26d6b8c8e8"; // Đăng sản phẩm đơn giản
  const coordinationDataSourceId = "4dcd280a-9505-49fb-9b63-33407108603a";

  addLog(`Đang khởi tạo kết nối Notion API...`, "info");
  
  try {
    const notion = await getNotionClient();
    const config = await loadConfig();
    if (!config.openAiApiKey) {
      throw new Error("Chưa cấu hình OpenAI API Key để tạo từ khóa SEO.");
    }

    addLog(`Đang nhờ AI tạo 2-3 từ khóa SEO cho sản phẩm: "${productName}"...`, "info");
    const finalKeywords = await generateSeoKeywords(config.openAiApiKey, productName, content);
    addLog(`Đã tạo từ khóa SEO: "${finalKeywords}"`, "success");

    // Always resolve the product child folder. The optional URL in the form is
    // the parent folder only and must never be written into Media sản phẩm.
    let finalDriveUrl = null;
    if (driveParent) {
      addLog(`Đang lấy Google Drive ID của thư mục sản phẩm để đồng bộ liên kết...`, "info");
      const targetFolder = path.join(driveParent, productName.replace(/[\\/:*?"<>|]/g, ""));
      finalDriveUrl = await resolveDriveFolderUrl(targetFolder, driveUrl, productName);
    }
    if (!finalDriveUrl) {
      throw new Error("Không tìm được thư mục con của sản phẩm trên Google Drive. Hãy kiểm tra tên thư mục, dán đúng link thư mục cha và bấm Kết nối Google Drive nếu metadata local bị thiếu.");
    }

    // 1. Create page in "Công việc của Tây" database containing the Markdown blocks
    addLog(`Đang tạo trang viết bài mới trong database "Công việc của Tây"...`, "info");
    const blocks = markdownToNotionBlocks(content);

    const contentPage = await notion.pages.create({
      parent: { data_source_id: contentDataSourceId },
      properties: {
        "Tên tài liệu": {
          title: [
            {
              text: { content: `${productName} WEB` }
            }
          ]
        },
        "Status": {
          select: {
            name: "Hoàn thành"
          }
        }
      },
      children: blocks.slice(0, 100)
    });

    const contentPageId = contentPage.id;
    addLog(`Đã tạo trang Công việc của Tây thành công (ID: ${contentPageId})`, "success");

    if (blocks.length > 100) {
      addLog(`Đang tiếp tục thêm các block văn bản còn lại vào trang...`, "info");
      for (let i = 100; i < blocks.length; i += 100) {
        await notion.blocks.children.append({
          block_id: contentPageId,
          children: blocks.slice(i, i + 100)
        });
      }
    }

    // 2. Create or Update coordination record in "Đăng sản phẩm đơn giản"
    addLog(`Đang tìm trang điều phối cho sản phẩm: "${productName}"...`, "info");
    const existingPage = await findCoordinationPageByTitle(notion, productName);
    
    let coordinationPageId;
    if (existingPage) {
      addLog(`Tìm thấy trang điều phối hiện tại (ID: ${existingPage.id}). Đang cập nhật trạng thái "Content đang làm"...`, "info");
      const updatedPage = await notion.pages.update({
        page_id: existingPage.id,
        properties: {
          "Bài content Tây": {
            relation: [
              {
                id: contentPageId
              }
            ]
          },
          "Từ khóa SEO Rank Math": {
            rich_text: [
              {
                text: { content: finalKeywords }
              }
            ]
          },
          "Media sản phẩm": {
            url: finalDriveUrl
          },
          "Trạng thái": {
            select: {
              name: "Content đang làm"
            }
          },
          "Facebook": {
            select: {
              name: "Chưa đăng"
            }
          },
          "Content xong": {
            checkbox: true
          }
        }
      });
      coordinationPageId = updatedPage.id;
    } else {
      addLog(`Không tìm thấy trang sẵn có. Đang tạo trang điều phối mới với trạng thái "Content đang làm"...`, "info");
      const createdPage = await notion.pages.create({
        parent: { data_source_id: coordinationDataSourceId },
        properties: {
          "Tên sản phẩm": {
            title: [
              {
                text: { content: productName }
              }
            ]
          },
          "Bài content Tây": {
            relation: [
              {
                id: contentPageId
              }
            ]
          },
          "Từ khóa SEO Rank Math": {
            rich_text: [
              {
                text: { content: finalKeywords }
              }
            ]
          },
          "Media sản phẩm": {
            url: finalDriveUrl
          },
          "Trạng thái": {
            select: {
              name: "Content đang làm"
            }
          },
          "Facebook": {
            select: {
              name: "Chưa đăng"
            }
          },
          "Content xong": {
            checkbox: true
          }
        }
      });
      coordinationPageId = createdPage.id;
    }

    addLog(`Đồng bộ Notion thành công! Trang điều phối ID: ${coordinationPageId}`, "success");
    addLog(`Hoàn tất đồng bộ toàn diện bài viết và trạng thái lên Notion.`, "success");

    res.json({
      success: true,
      contentPageUrl: contentPage.url,
      coordinationPageId: coordinationPageId
    });
  } catch (err) {
    addLog(`Lỗi đồng bộ Notion: ${err.message}`, "error");
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, "127.0.0.1", () => {
  addLog(`Server chạy tại: http://localhost:${PORT}`, "info");
  
  // Launch GUI App Mode automatically
  if (process.versions.electron) {
    console.log("[GUI] Chạy trong môi trường Electron. Bỏ qua mở Chrome App Mode.");
    return;
  }
  
  try {
    const url = `http://localhost:${PORT}`;
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "C:\\Users\\datdt", "AppData\\Local");
    const profileDir = path.join(localAppData, "NotionProductCreator", "app_profile");
    
    const fsSync = require("fs");
    if (!fsSync.existsSync(profileDir)) {
      fsSync.mkdirSync(profileDir, { recursive: true });
    }

    const paths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    ];
    let chromeExecutable = null;
    for (const p of paths) {
      if (fsSync.existsSync(p)) {
        chromeExecutable = p;
        break;
      }
    }

    const startTime = Date.now();
    let browserProcess;

    if (chromeExecutable) {
      console.log(`[GUI] Đang mở Chrome App Mode: ${url}`);
      browserProcess = spawn(chromeExecutable, [
        `--app=${url}`,
        `--user-data-dir=${profileDir}`,
        "--window-size=1320,880",
        "--no-first-run",
        "--no-default-browser-check"
      ], { detached: false, stdio: "ignore" });
    } else {
      const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
      if (fsSync.existsSync(edgePath)) {
        console.log(`[GUI] Đang mở Edge App Mode: ${url}`);
        browserProcess = spawn(edgePath, [
          `--app=${url}`,
          `--user-data-dir=${profileDir}`,
          "--window-size=1320,880",
          "--no-first-run",
          "--no-default-browser-check"
        ], { detached: false, stdio: "ignore" });
      } else {
        console.log("[GUI] Mở bằng trình duyệt mặc định...");
        exec(`start ${url}`);
        return;
      }
    }

    if (browserProcess) {
      browserProcess.on("exit", () => {
        const duration = (Date.now() - startTime) / 1000;
        if (duration > 3.0) {
          console.log("[GUI] Trình duyệt đã đóng. Tắt server...");
          process.exit(0);
        } else {
          console.log(`[GUI] Trình duyệt đóng quá nhanh (${duration.toFixed(2)}s). Giữ server chạy tiếp.`);
        }
      });
      
      browserProcess.on("error", (err) => {
        console.error("[GUI] Lỗi tiến trình trình duyệt:", err);
      });
    }
  } catch (err) {
    console.error("[GUI] Lỗi khi tự động mở giao diện:", err);
  }
});
