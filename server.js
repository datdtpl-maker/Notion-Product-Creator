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
const { exec, execSync, spawn } = require("child_process");
const { promisify } = require("util");
const { Client: NotionClient } = require("@notionhq/client");
const OpenAI = require("openai");
const { chromium } = require("playwright");

const execAsync = promisify(exec);

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
const configDir = isElectron
  ? path.join(userConfigBaseDir, "NotionProductCreator")
  : appDir;

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(appDir, "public")));

const CONFIG_PATH = path.join(configDir, "config.json");
const LEGACY_CONFIG_PATH = isElectron
  ? path.join(process.env.APPDATA || appDir, "Programs", "NotionProductCreator", "config.json")
  : null;

// System logs buffer for frontend polling
let logs = [];
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
    temperature: 0.9,
    messages: [
      {
        role: "system",
        content: "Bạn là chuyên gia SEO dược mỹ phẩm. Chỉ trả về 2 hoặc 3 từ khóa SEO tiếng Việt ngắn, ngăn cách bằng dấu phẩy. Từ khóa phải liên quan trực tiếp đến tên sản phẩm và công dụng được cung cấp. Không đánh số, không giải thích, không dùng hashtag, không bịa công dụng."
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

async function getChatGptContentImages(page) {
  const images = page.locator("img");
  const count = await images.count();
  const contentImages = [];

  for (let index = 0; index < count; index++) {
    const image = images.nth(index);
    const src = await image.getAttribute("src");
    if (isChatGptContentImageSource(src)) {
      contentImages.push({ image, src });
    }
  }

  return contentImages;
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
  let cfg = {
    openAiApiKey: "",
    notionApiKey: "",
    defaultDriveParent: "",
    chromeDebugPort: 9222,
    chromeUserDataDir: path.join(configDir, "chatgpt_profile"),
    prompts: []
  };
  try {
    const configPath = [CONFIG_PATH, LEGACY_CONFIG_PATH].find((candidate) => candidate && existsSync(candidate));
    if (configPath) {
      const data = await fs.readFile(configPath, "utf8");
      cfg = { ...cfg, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error("Lỗi đọc config:", err);
  }

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
  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
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
  const cfg = await loadConfig();
  res.json(cfg);
});

// Save configuration
app.post("/api/config", async (req, res) => {
  try {
    const newCfg = req.body;
    const cfg = await loadConfig();
    const merged = { ...cfg, ...newCfg };
    await saveConfig(merged);
    res.json({ success: true, config: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test OpenAI API Key
app.post("/api/openai/check", async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: "Vui lòng cung cấp API Key." });
  }
  try {
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

// Helper: Query user.drive.id via PowerShell
async function getDriveFolderId(folderPath) {
  try {
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Content -Path '${folderPath}' -Stream 'user.drive.id'"`;
    const { stdout } = await execAsync(cmd);
    const driveId = stdout.trim();
    if (driveId && !driveId.startsWith("local")) {
      return driveId;
    }
  } catch (err) {
    // Ignore error
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
  const { productName, driveParent, promptIndex, promptText, details, content, referenceImage } = req.body;
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

    // Get Drive ID
    addLog(`[Ảnh ${promptIndex}] Đang lấy Google Drive ID...`, "info");
    let driveId = await getDriveFolderId(targetFolder);
    if (!driveId) {
      driveId = "local_unsynced_" + Date.now();
    }
    const driveUrl = `https://drive.google.com/drive/folders/${driveId}`;

    // Start background single image automation
    runSingleImageAutomationInBackground(port, refImagePath, promptText, promptIndex, targetFolder, productName, driveUrl, details, content);

    res.json({
      success: true,
      message: `Đã khởi chạy tiến trình sinh ảnh ${promptIndex} trong nền.`,
      driveUrl
    });
  } catch (err) {
    addLog(`Lỗi khởi chạy sinh ảnh: ${err.message}`, "error");
    res.status(500).json({ error: err.message });
  }
});

// Run single image Playwright automation in background
async function runSingleImageAutomationInBackground(port, refImagePath, promptText, promptIndex, targetFolder, productName, driveUrl, details, content) {
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

    // 1. Upload reference image if available (with robust try-catch)
    if (refImagePath) {
      addLog(`[Ảnh ${promptIndex}] Đang upload ảnh mẫu reference_image.png...`, "info");
      try {
        const fileInput = await page.$('input[type="file"]');
        if (fileInput) {
          await fileInput.setInputFiles(refImagePath);
          // Wait 5 seconds for upload to complete natively without polling CDP isEnabled()
          await new Promise((r) => setTimeout(r, 5000));
        }
      } catch (err) {
        addLog(`[Ảnh ${promptIndex}] Bỏ qua lỗi upload ảnh mẫu: ${err.message}`, "warning");
      }
    }

    // The baseline must be captured after the reference image upload. Otherwise
    // that uploaded image is mistaken for the image generated by ChatGPT.
    let initialImageSources = new Set();
    try {
      initialImageSources = new Set((await getChatGptContentImages(page)).map(({ src }) => src));
    } catch (e) {
      addLog(`[Ảnh ${promptIndex}] Lỗi chụp mốc ảnh ban đầu: ${e.message}`, "warning");
    }

    // 2. Fill prompt with dynamic placeholders
    const safeDetails = details || "";
    const keyPoints = extractKeyPoints(content || "");
    let promptProcessed = (promptText || "")
      .replace(/\{\{selected_keywords\}\}/g, safeDetails || productName)
      .replace(/\{\{selected_notion_content\}\}/g, keyPoints || ("Ảnh sản phẩm " + productName))
      .replace(/A1/g, "ảnh sản phẩm mẫu đã tải lên");

    promptProcessed += "\n\nYêu cầu bắt buộc về đầu ra: tạo ảnh vuông tỉ lệ 1:1 (square image), bố cục hiển thị trọn vẹn trong khung vuông, không tạo ảnh dọc hoặc ngang.";

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
        const newImages = (await getChatGptContentImages(page))
          .filter(({ src }) => !initialImageSources.has(src));

        if (newImages.length === 0) {
          continue;
        }

        const { image, src } = newImages.at(-1);
        const imagePath = path.join(targetFolder, `${promptIndex}.png`);
        addLog(`[Ảnh ${promptIndex}] Đã tìm thấy ảnh mới. Đang tải ảnh về máy...`, "info");
        try {
          const savedAs = await saveChatGptImage(context, image, src, imagePath);
          addLog(`[Ảnh ${promptIndex}] Đã lưu ${promptIndex}.png (${savedAs === "original" ? "ảnh gốc" : "ảnh hiển thị"}).`, "success");
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
      // "Content đang làm". The manual Push to Notion action is the only path
      // that changes the status to "Báo IT đăng" and checks "Content xong".
      try {
        const coordinationDbId = "9788b8a0-31cc-42d3-91be-4e26d6b8c8e8";
        const notion = await getNotionClient();
        
        const existingPage = await findCoordinationPageByTitle(notion, productName);
        if (existingPage) {
          addLog(`[Ảnh ${promptIndex}] Cập nhật trạng thái "Content đang làm" trên Notion...`, "info");
          await notion.pages.update({
            page_id: existingPage.id,
            properties: {
              "Media sản phẩm": {
                url: driveUrl
              },
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
              "Media sản phẩm": {
                url: driveUrl
              },
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

// List products that are ready to be prepared for Facebook posting.
app.get("/api/facebook/pending-products", async (req, res) => {
  try {
    const coordinationDbId = "9788b8a0-31cc-42d3-91be-4e26d6b8c8e8";
    const notion = await getNotionClient();
    const products = [];
    let startCursor;

    do {
      const response = await notion.databases.query({
        database_id: coordinationDbId,
        page_size: 100,
        start_cursor: startCursor,
        filter: {
          property: "Facebook",
          select: { equals: "Chưa đăng" }
        }
      });

      for (const page of response.results) {
        const productName = (page.properties["Tên sản phẩm"]?.title || [])
          .map((item) => item.plain_text)
          .join("")
          .trim();
        if (!productName) continue;
        products.push({
          pageId: page.id,
          productName,
          webUrl: page.properties["Link web"]?.url || "",
          mediaUrl: page.properties["Media sản phẩm"]?.url || ""
        });
      }
      startCursor = response.has_more ? response.next_cursor : undefined;
    } while (startCursor);

    products.sort((a, b) => a.productName.localeCompare(b.productName, "vi"));
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: `Không thể quét danh sách Notion: ${err.message}` });
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
    const folder = path.join(driveParent || config.defaultDriveParent || "", productName.replace(/[\\/:*?\"<>|]/g, ""));
    const imagePaths = (await fs.readdir(folder)).filter((file) => /^\d+\.(png|jpe?g|webp)$/i.test(file)).sort().map((file) => path.join(folder, file));
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
        Facebook: { select: { name: "Đã đăng" } }
      }
    });
    res.json({
      success: true,
      facebookContentPageUrl: facebookContentPage.url,
      message: "Đã đưa nội dung và ảnh vào form Facebook, đồng thời lưu bài Facebook vào Notion."
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

    // Try to resolve Google Drive folder URL if not passed explicitly
    let finalDriveUrl = driveUrl;
    if (!finalDriveUrl && driveParent) {
      addLog(`Đang lấy Google Drive ID để đồng bộ liên kết...`, "info");
      const targetFolder = path.join(driveParent, productName.replace(/[\\/:*?"<>|]/g, ""));
      let driveId = await getDriveFolderId(targetFolder);
      if (!driveId) {
        driveId = "local_unsynced_" + Date.now();
      }
      finalDriveUrl = `https://drive.google.com/drive/folders/${driveId}`;
    }
    if (!finalDriveUrl) {
      finalDriveUrl = "https://drive.google.com";
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
      addLog(`Tìm thấy trang điều phối hiện tại (ID: ${existingPage.id}). Đang cập nhật trạng thái "Báo IT đăng"...`, "info");
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
              name: "Báo IT đăng"
            }
          },
          "Content xong": {
            checkbox: true
          }
        }
      });
      coordinationPageId = updatedPage.id;
    } else {
      addLog(`Không tìm thấy trang sẵn có. Đang tạo trang điều phối mới với trạng thái "Báo IT đăng"...`, "info");
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
              name: "Báo IT đăng"
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
app.listen(PORT, () => {
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
