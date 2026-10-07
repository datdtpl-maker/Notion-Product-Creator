document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const openaiKeyInput = document.getElementById("openai-key");
  const notionKeyInput = document.getElementById("notion-key");
  const googleDriveClientIdInput = document.getElementById("google-drive-client-id");
  const googleDriveClientSecretInput = document.getElementById("google-drive-client-secret");
  const btnToggleGoogleDriveSecret = document.getElementById("btn-toggle-google-drive-secret");
  const btnConnectGoogleDrive = document.getElementById("btn-connect-google-drive");
  const btnDisconnectGoogleDrive = document.getElementById("btn-disconnect-google-drive");
  const googleDriveStatus = document.getElementById("google-drive-status");
  const btnToggleNotionKey = document.getElementById("btn-toggle-notion-key");
  const btnCheckKey = document.getElementById("btn-check-key");
  const driveParentInput = document.getElementById("drive-parent");
  const btnSelectFolder = document.getElementById("btn-select-folder");
  const productDriveUrlInput = document.getElementById("product-drive-url");
  const btnSaveDriveParentUrl = document.getElementById("btn-save-drive-parent-url");
  const logoImageUrlInput = document.getElementById("logo-image-url");
  const btnSaveLogoImageUrl = document.getElementById("btn-save-logo-image-url");
  const btnClearProductCache = document.getElementById("btn-clear-product-cache");
  const systemConfigCard = document.getElementById("system-config-card");
  const systemConfigBody = document.getElementById("system-config-body");
  const btnToggleSystemConfig = document.getElementById("btn-toggle-system-config");
  const systemConfigToggleLabel = document.getElementById("system-config-toggle-label");
  
  const prodNameInput = document.getElementById("prod-name");
  const prodCategoryInput = document.getElementById("prod-category");
  const prodPriceInput = document.getElementById("prod-price");
  const prodDetailsInput = document.getElementById("prod-details");
  
  const imageDropzone = document.getElementById("image-dropzone");
  const refImageInput = document.getElementById("ref-image");
  const dropzoneText = document.getElementById("dropzone-text");
  const previewContainer = document.getElementById("preview-container");
  const imgPreview = document.getElementById("img-preview");
  const btnRemoveImg = document.getElementById("btn-remove-img");
  
  const btnGenerateContent = document.getElementById("btn-generate-content");
  const articleContentTextarea = document.getElementById("article-content");
  
  // 4 Prompts inputs & displays
  const promptInputs = [
    {
      titleInput: document.getElementById("prompt-title-1"),
      titleDisp: document.getElementById("prompt-title-disp-1"),
      contentInput: document.getElementById("prompt-1")
    },
    {
      titleInput: document.getElementById("prompt-title-2"),
      titleDisp: document.getElementById("prompt-title-disp-2"),
      contentInput: document.getElementById("prompt-2")
    },
    {
      titleInput: document.getElementById("prompt-title-3"),
      titleDisp: document.getElementById("prompt-title-disp-3"),
      contentInput: document.getElementById("prompt-3")
    },
    {
      titleInput: document.getElementById("prompt-title-4"),
      titleDisp: document.getElementById("prompt-title-disp-4"),
      contentInput: document.getElementById("prompt-4")
    }
  ];
  
  const btnPushNotion = document.getElementById("btn-push-notion");
  const btnSaveKey = document.getElementById("btn-save-key");
  const btnStartChrome = document.getElementById("btn-start-chrome");
  const btnLoginChrome = document.getElementById("btn-login-chrome");
  const chromeLoginHint = document.getElementById("chrome-login-hint");
  let chatGptReady = false;
  let imageGenerationBusy = false;
  const btnCheckChrome = document.getElementById("btn-check-chrome");
  const btnClearLogs = document.getElementById("btn-clear-logs");
  const logBox = document.getElementById("log-box");
  
  const chromeStatusBadge = document.getElementById("chrome-status");
  const chromeStatusText = chromeStatusBadge.querySelector(".status-text");

  const btnThemeToggle = document.getElementById("btn-theme-toggle");
  const facebookPageUrlInput = document.getElementById("facebook-page-url");
  const facebookMediaParentInput = document.getElementById("facebook-media-parent");
  const btnSelectFacebookMedia = document.getElementById("btn-select-facebook-media");
  const facebookTemplateInput = document.getElementById("facebook-template");
  const facebookPromptSelect = document.getElementById("facebook-prompt-select");
  const facebookPromptNameInput = document.getElementById("facebook-prompt-name");
  const facebookPromptContentInput = document.getElementById("facebook-prompt-content");
  const facebookPromptStatus = document.getElementById("facebook-prompt-status");
  const facebookPromptCounter = document.getElementById("facebook-prompt-counter");
  const btnAddFacebookPrompt = document.getElementById("btn-add-facebook-prompt");
  const btnSaveFacebookPrompt = document.getElementById("btn-save-facebook-prompt");
  const btnDeleteFacebookPrompt = document.getElementById("btn-delete-facebook-prompt");
  const btnExportFacebookPrompts = document.getElementById("btn-export-facebook-prompts");
  const btnImportFacebookPrompts = document.getElementById("btn-import-facebook-prompts");
  const facebookPromptsImportFile = document.getElementById("facebook-prompts-import-file");
  const facebookPendingProducts = document.getElementById("facebook-pending-products");
  const btnRefreshFacebookProducts = document.getElementById("btn-refresh-facebook-products");
  const btnConfirmFacebookPublished = document.getElementById("btn-confirm-facebook-published");
  const facebookContentInput = document.getElementById("facebook-content");
  const facebookProductInfo = document.getElementById("facebook-product-info");
  const facebookLogBox = document.getElementById("facebook-log-box");
  const completionModal = document.getElementById("completion-modal");
  const completionTitle = document.getElementById("completion-title");
  const completionMessage = document.getElementById("completion-message");
  const completionNotionLink = document.getElementById("completion-notion-link");
  const btnCloseCompletion = document.getElementById("btn-close-completion");

  let referenceImageBase64 = null;
  let currentLogsLength = 0;
  let facebookProduct = null;
  let pendingFacebookProducts = [];
  let currentProductDriveUrl = "";
  let openAiApiKeyConfigured = false;
  let notionApiKeyConfigured = false;
  let googleDriveClientSecretConfigured = false;
  let productDriveUrlSaveTimer = null;
  let lastSavedGoogleDriveParentUrl = "";
  let facebookPrompts = [];
  let selectedFacebookPromptId = "";

  const defaultFacebookPrompt = {
    id: "khai-hoan-default",
    name: "Prompt mặc định Khải Hoàn",
    content: "Bạn viết bài Facebook ngắn gọn cho Khải Hoàn Skincare. Không bịa công dụng, dùng ngôn từ an toàn. Trả về duy nhất nội dung bài đăng, có CTA và link web cuối bài."
  };

  // --- Functions ---
  let completionReturnFocus = null;

  function updateNotionConfigStatus() {
    const badge = document.getElementById('notion-status');
    badge.className = `status-badge ${notionApiKeyConfigured ? 'configured' : 'offline'}`;
    badge.querySelector('.status-text').textContent = notionApiKeyConfigured ? 'Notion: Đã lưu token' : 'Notion: Chưa cấu hình';
  }

  function closeCompletionPopup() {
    completionModal.hidden = true;
    document.querySelector('.app-container').inert = false;
    if (completionReturnFocus?.isConnected) completionReturnFocus.focus();
  }

  function showCompletionPopup({ title, message, notionUrl, notionLabel = "Mở trên Notion", returnFocus }) {
    if (completionModal.hidden) completionReturnFocus = returnFocus || document.activeElement;
    completionTitle.textContent = title;
    completionMessage.textContent = message;
    completionNotionLink.hidden = !notionUrl;
    if (notionUrl) {
      completionNotionLink.href = notionUrl;
      completionNotionLink.textContent = notionLabel;
    }
    completionModal.hidden = false;
    document.querySelector('.app-container').inert = true;
    btnCloseCompletion.focus();
  }

  function setFacebookPromptStatus(message, state = "saved") {
    facebookPromptStatus.textContent = message;
    facebookPromptStatus.dataset.state = state;
  }

  function updateFacebookPromptCounter() {
    facebookPromptCounter.textContent = `${facebookPromptContentInput.value.length.toLocaleString("vi-VN")} / 20.000`;
  }

  function getSelectedFacebookPrompt() {
    return facebookPrompts.find((prompt) => prompt.id === selectedFacebookPromptId) || facebookPrompts[0] || null;
  }

  function createFacebookPromptId() {
    if (window.crypto?.randomUUID) return `facebook-${window.crypto.randomUUID()}`;
    return `facebook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function renderFacebookPromptOptions() {
    facebookPromptSelect.innerHTML = "";
    for (const prompt of facebookPrompts) {
      const option = document.createElement("option");
      option.value = prompt.id;
      option.textContent = prompt.name;
      facebookPromptSelect.appendChild(option);
    }
    facebookPromptSelect.value = selectedFacebookPromptId;
  }

  function loadSelectedFacebookPromptIntoEditor() {
    const prompt = getSelectedFacebookPrompt();
    facebookPromptNameInput.value = prompt?.name || "";
    facebookPromptContentInput.value = prompt?.content || "";
    facebookPromptSelect.value = prompt?.id || "";
    updateFacebookPromptCounter();
  }

  function syncFacebookPromptEditorToState() {
    const prompt = getSelectedFacebookPrompt();
    if (!prompt) return;
    prompt.name = facebookPromptNameInput.value.slice(0, 120);
    prompt.content = facebookPromptContentInput.value.slice(0, 20000);
    const selectedOption = facebookPromptSelect.querySelector(`option[value="${CSS.escape(prompt.id)}"]`);
    if (selectedOption) selectedOption.textContent = prompt.name.trim() || "Prompt chưa đặt tên";
    updateFacebookPromptCounter();
  }

  function validateFacebookPromptLibrary(prompts = facebookPrompts) {
    if (!Array.isArray(prompts) || prompts.length === 0) throw new Error("Thư viện cần có ít nhất một prompt.");
    if (prompts.length > 50) throw new Error("Thư viện chỉ hỗ trợ tối đa 50 prompt.");
    for (const [index, prompt] of prompts.entries()) {
      if (!String(prompt.name || "").trim()) throw new Error(`Prompt ${index + 1} chưa có tên.`);
      if (!String(prompt.content || "").trim()) throw new Error(`Prompt “${prompt.name || index + 1}” chưa có nội dung.`);
      if (String(prompt.content).length > 20000) throw new Error(`Prompt “${prompt.name}” vượt quá 20.000 ký tự.`);
    }
  }

  function normalizeImportedFacebookPrompts(rawPrompts) {
    if (!Array.isArray(rawPrompts)) throw new Error("File không chứa danh sách prompt hợp lệ.");
    const usedIds = new Set();
    const prompts = rawPrompts.slice(0, 50).map((item, index) => {
      const name = String(item?.name || "").trim().slice(0, 120);
      const content = String(item?.content || "").trim().slice(0, 20000);
      let id = String(item?.id || createFacebookPromptId()).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
      if (!id) id = `facebook-import-${index + 1}`;
      const baseId = id;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
      usedIds.add(id);
      return { id, name, content };
    });
    validateFacebookPromptLibrary(prompts);
    return prompts;
  }

  async function persistFacebookPromptLibrary(message = "Đã lưu thư viện prompt trên máy này.") {
    syncFacebookPromptEditorToState();
    validateFacebookPromptLibrary();
    await saveConfig();
    setFacebookPromptStatus("Đã lưu", "saved");
    appendLocalLog(message, "success");
  }

  function setSystemConfigCollapsed(collapsed, { persist = true } = {}) {
    systemConfigCard.classList.toggle("is-collapsed", collapsed);
    systemConfigBody.hidden = collapsed;
    btnToggleSystemConfig.setAttribute("aria-expanded", String(!collapsed));
    btnToggleSystemConfig.setAttribute("aria-label", collapsed ? "Mở rộng Cấu hình hệ thống" : "Thu nhỏ Cấu hình hệ thống");
    systemConfigToggleLabel.textContent = collapsed ? "Mở rộng" : "Thu nhỏ";
    if (persist) localStorage.setItem("systemConfigCollapsed", String(collapsed));
  }

  function setupSystemConfigToggle() {
    const collapsed = localStorage.getItem("systemConfigCollapsed") !== "false";
    setSystemConfigCollapsed(collapsed, { persist: false });
    btnToggleSystemConfig.addEventListener("click", () => {
      setSystemConfigCollapsed(!systemConfigCard.classList.contains("is-collapsed"));
    });
  }

  btnCloseCompletion.addEventListener("click", closeCompletionPopup);
  completionModal.addEventListener("click", (event) => {
    if (event.target === completionModal) closeCompletionPopup();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !completionModal.hidden) closeCompletionPopup();
    if (event.key === "Tab" && !completionModal.hidden) {
      const first = completionNotionLink.hidden ? btnCloseCompletion : completionNotionLink;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        btnCloseCompletion.focus();
      } else if (!event.shiftKey && document.activeElement === btnCloseCompletion) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  // Dynamically calculate and display the auto-save subfolder path
  function updateTargetFolderDisplay() {
    const cleanName = prodNameInput.value.trim().replace(/[\\/:*?"<>|]/g, "");
    const driveParent = driveParentInput.value.trim();
    const targetProductFolderInput = document.getElementById("target-product-folder");
    if (targetProductFolderInput) {
      if (driveParent && cleanName) {
        const separatorChar = driveParent.includes("\\") ? "\\" : "/";
        const separator = driveParent.endsWith(separatorChar) ? "" : separatorChar;
        targetProductFolderInput.value = driveParent + separator + cleanName;
      } else {
        targetProductFolderInput.value = driveParent || "";
      }
    }
  }

  // Load initial config
  async function loadConfig() {
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      if (!res.ok) throw new Error(config.error || "Không thể tải cấu hình.");
      
      openAiApiKeyConfigured = Boolean(config.openAiApiKeyConfigured);
      notionApiKeyConfigured = Boolean(config.notionApiKeyConfigured);
      updateNotionConfigStatus();
      if (localStorage.getItem('systemConfigCollapsed') === null && (!openAiApiKeyConfigured || !notionApiKeyConfigured)) {
        setSystemConfigCollapsed(false, { persist: false });
      }
      openaiKeyInput.value = "";
      notionKeyInput.value = "";
      openaiKeyInput.placeholder = openAiApiKeyConfigured ? "Đã lưu an toàn — nhập mới để thay đổi" : "Nhập OpenAI API Key";
      notionKeyInput.placeholder = notionApiKeyConfigured ? "Đã lưu an toàn — nhập mới để thay đổi" : "Nhập Notion Access Token";
      googleDriveClientIdInput.value = config.googleDriveClientId || "";
      googleDriveClientSecretConfigured = Boolean(config.googleDriveClientSecretConfigured);
      googleDriveClientSecretInput.value = "";
      googleDriveClientSecretInput.placeholder = googleDriveClientSecretConfigured
        ? "Đã lưu — nhập mới để thay đổi"
        : "Nhập Client Secret";
      driveParentInput.value = config.defaultDriveParent || "";
      productDriveUrlInput.value = config.googleDriveParentUrl || "";
      logoImageUrlInput.value = config.logoImageUrl || "";
      lastSavedGoogleDriveParentUrl = productDriveUrlInput.value.trim();
      facebookPageUrlInput.value = config.facebookPageUrl || "";
      facebookMediaParentInput.value = config.facebookMediaParent || config.defaultDriveParent || "";
      facebookTemplateInput.value = config.facebookTemplate || "";
      facebookPrompts = Array.isArray(config.facebookPrompts) && config.facebookPrompts.length
        ? config.facebookPrompts.map((prompt) => ({ ...prompt }))
        : [{ ...defaultFacebookPrompt }];
      selectedFacebookPromptId = facebookPrompts.some((prompt) => prompt.id === config.selectedFacebookPromptId)
        ? config.selectedFacebookPromptId
        : facebookPrompts[0].id;
      renderFacebookPromptOptions();
      loadSelectedFacebookPromptIntoEditor();
      setFacebookPromptStatus("Đã lưu", "saved");
      
      if (config.prompts && config.prompts.length >= 4) {
        for (let i = 0; i < 4; i++) {
          const item = config.prompts[i];
          if (item) {
            // Older configurations stored prompts as strings; newer ones include title/content.
            const prompt = typeof item === "string" ? { content: item } : item;
            const originalContent = prompt.content || "";
            const continuationInstruction = "Tiếp tục trong đúng cuộc trò chuyện hiện tại. Dùng lại ảnh sản phẩm đã được đính kèm ở Prompt 1 làm ảnh tham chiếu; không cần tải lại ảnh. Nếu sản phẩm xuất hiện trong thiết kế, giữ đúng bao bì, logo, tên, màu sắc và chữ trên sản phẩm.";
            const contentWithContext = i > 0 && !originalContent.startsWith("Tiếp tục trong đúng cuộc trò chuyện hiện tại.")
              ? `${continuationInstruction}\n\n${originalContent}`
              : originalContent;
            promptInputs[i].titleInput.value = prompt.title || `Ảnh ${i+1}`;
            promptInputs[i].titleDisp.textContent = prompt.title || `Ảnh ${i+1}`;
            promptInputs[i].contentInput.value = contentWithContext;
          }
        }
      }
      updateTargetFolderDisplay();
      await refreshGoogleDriveStatus();
    } catch (err) {
      document.querySelector('#notion-status .status-text').textContent = 'Không tải được cấu hình';
      console.error("Lỗi load config:", err);
    }
  }

  // Save config changes
  async function saveConfig() {
    const config = {
      openAiApiKey: openaiKeyInput.value.trim(),
      notionApiKey: notionKeyInput.value.trim(),
      googleDriveClientId: googleDriveClientIdInput.value.trim(),
      defaultDriveParent: driveParentInput.value.trim(),
      googleDriveParentUrl: productDriveUrlInput.value.trim(),
      logoImageUrl: logoImageUrlInput.value.trim(),
      facebookPageUrl: facebookPageUrlInput.value.trim(),
      facebookMediaParent: facebookMediaParentInput.value.trim(),
      facebookTemplate: facebookTemplateInput.value.trim(),
      facebookPrompts: facebookPrompts.map((prompt) => ({ ...prompt })),
      selectedFacebookPromptId,
      prompts: promptInputs.map(p => ({
        title: p.titleInput.value.trim(),
        content: p.contentInput.value.trim()
      }))
    };
    const clientSecret = googleDriveClientSecretInput.value.trim();
    if (clientSecret) config.googleDriveClientSecret = clientSecret;
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config)
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Không thể lưu cấu hình.");
      }
      const result = await response.json();
      openAiApiKeyConfigured = Boolean(result.config?.openAiApiKeyConfigured);
      notionApiKeyConfigured = Boolean(result.config?.notionApiKeyConfigured);
      updateNotionConfigStatus();
      googleDriveClientSecretConfigured = Boolean(result.config?.googleDriveClientSecretConfigured);
      lastSavedGoogleDriveParentUrl = productDriveUrlInput.value.trim();
      if (config.openAiApiKey) {
        openaiKeyInput.value = "";
        openaiKeyInput.placeholder = "Đã lưu an toàn — nhập mới để thay đổi";
      }
      if (config.notionApiKey) {
        notionKeyInput.value = "";
        notionKeyInput.placeholder = "Đã lưu an toàn — nhập mới để thay đổi";
      }
      if (clientSecret) {
        googleDriveClientSecretInput.value = "";
        googleDriveClientSecretInput.placeholder = "Đã lưu — nhập mới để thay đổi";
      }
    } catch (err) {
      console.error("Lỗi lưu config:", err);
      throw err;
    }
  }

  async function persistGoogleDriveParentUrl({ silent = false } = {}) {
    clearTimeout(productDriveUrlSaveTimer);
    const googleDriveParentUrl = productDriveUrlInput.value.trim();
    if (googleDriveParentUrl === lastSavedGoogleDriveParentUrl) return;
    const response = await fetch("/api/config/google-drive-parent", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ googleDriveParentUrl })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Không thể lưu link thư mục cha.");
    lastSavedGoogleDriveParentUrl = googleDriveParentUrl;
    if (!silent) appendLocalLog("Đã lưu link Google Drive thư mục cha trên máy này.", "success");
  }

  async function refreshGoogleDriveStatus() {
    try {
      const response = await fetch("/api/google-drive/status");
      const status = await response.json();
      if (status.connected) {
        googleDriveStatus.textContent = "Đã kết nối";
        btnConnectGoogleDrive.textContent = "Kết nối lại";
        btnDisconnectGoogleDrive.hidden = false;
      } else if (status.configured && !status.clientSecretConfigured) {
        googleDriveStatus.textContent = "Thiếu Client Secret";
        btnConnectGoogleDrive.textContent = "Kết nối Google Drive";
        btnDisconnectGoogleDrive.hidden = true;
      } else if (status.configured) {
        googleDriveStatus.textContent = "Chưa cấp quyền";
        btnConnectGoogleDrive.textContent = "Kết nối Google Drive";
        btnDisconnectGoogleDrive.hidden = true;
      } else {
        googleDriveStatus.textContent = "Chưa nhập Client ID";
        btnConnectGoogleDrive.textContent = "Kết nối Google Drive";
        btnDisconnectGoogleDrive.hidden = true;
      }
    } catch {
      googleDriveStatus.textContent = "Không kiểm tra được";
    }
  }

  async function connectGoogleDrive() {
    const clientId = googleDriveClientIdInput.value.trim();
    const hasClientSecret = Boolean(googleDriveClientSecretInput.value.trim()) || googleDriveClientSecretConfigured;
    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      alert("Hãy nhập Google Drive OAuth Client ID dạng ...apps.googleusercontent.com.");
      return;
    }
    if (!hasClientSecret) {
      alert("Hãy nhập Google Drive OAuth Client Secret.");
      return;
    }
    btnConnectGoogleDrive.disabled = true;
    try {
      await saveConfig();
      const response = await fetch("/api/google-drive/start-auth", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể bắt đầu kết nối Google Drive.");

      const popup = window.open(data.authUrl, "google-drive-oauth", "width=620,height=760");
      if (!popup) throw new Error("Trình duyệt đã chặn cửa sổ đăng nhập Google. Hãy cho phép popup rồi thử lại.");
      googleDriveStatus.textContent = "Đang chờ cấp quyền…";
      appendLocalLog("Đã mở cửa sổ đăng nhập để kết nối Google Drive.", "info");

      const timer = window.setInterval(async () => {
        await refreshGoogleDriveStatus();
        if (googleDriveStatus.textContent === "Đã kết nối") {
          window.clearInterval(timer);
          appendLocalLog("Google Drive đã sẵn sàng tìm đúng thư mục sản phẩm từ link thư mục cha.", "success");
        }
      }, 1500);
      window.setTimeout(() => window.clearInterval(timer), 5 * 60 * 1000);
    } catch (err) {
      googleDriveStatus.textContent = "Kết nối thất bại";
      appendLocalLog(`Kết nối Google Drive thất bại: ${err.message}`, "error");
      alert(err.message);
    } finally {
      btnConnectGoogleDrive.disabled = false;
    }
  }

  async function disconnectGoogleDrive() {
    const confirmed = window.confirm("Ngắt kết nối tài khoản Google Drive hiện tại? Client ID và các cấu hình khác vẫn được giữ lại.");
    if (!confirmed) return;

    btnDisconnectGoogleDrive.disabled = true;
    try {
      const response = await fetch("/api/google-drive/disconnect", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể ngắt kết nối Google Drive.");
      await refreshGoogleDriveStatus();
      appendLocalLog(data.message, "success");
      alert(`${data.message}\n\nKhi kết nối lại, Google sẽ hiển thị màn hình chọn tài khoản.`);
    } catch (err) {
      appendLocalLog(`Ngắt kết nối Google Drive thất bại: ${err.message}`, "error");
      alert(err.message);
    } finally {
      btnDisconnectGoogleDrive.disabled = false;
    }
  }

  // Append a log line locally
  function appendLocalLog(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const logItem = document.createElement("div");
    logItem.className = `log-item ${type}`;
    logItem.innerHTML = `
      <span class="log-time">[${timestamp}]</span>
      <span class="log-message">${message}</span>
    `;
    logBox.appendChild(logItem);
    logBox.scrollTop = logBox.scrollHeight;
  }

  // Fetch real-time logs from backend
  async function fetchLogs() {
    try {
      const res = await fetch("/api/logs");
      const backendLogs = await res.json();
      
      if (backendLogs.length !== currentLogsLength) {
        logBox.innerHTML = "";
        backendLogs.forEach(log => {
          const logItem = document.createElement("div");
          logItem.className = `log-item ${log.type}`;
          logItem.innerHTML = `
            <span class="log-time">[${log.timestamp}]</span>
            <span class="log-message">${log.message}</span>
          `;
          logBox.appendChild(logItem);
        });
        logBox.scrollTop = logBox.scrollHeight;
        if (facebookLogBox) {
          facebookLogBox.innerHTML = logBox.innerHTML;
          facebookLogBox.scrollTop = facebookLogBox.scrollHeight;
        }
        currentLogsLength = backendLogs.length;
      }
    } catch (err) {
      console.error("Lỗi polling logs:", err);
    }
  }

  // Check Chrome status
  async function checkChromeStatus() {
    try {
      const res = await fetch("/api/chrome/status");
      const data = await res.json();
      const singleGenBtns = document.querySelectorAll(".btn-generate-single");
      chatGptReady = Boolean(data.ready);
      if (data.online) {
        chromeStatusBadge.className = `status-badge ${chatGptReady ? 'online' : 'offline'}`;
        chromeStatusText.textContent = chatGptReady ? 'ChatGPT: Sẵn sàng' : 'Chrome: Chưa khóa tab';
        singleGenBtns.forEach(btn => btn.disabled = !chatGptReady || imageGenerationBusy);
      } else {
        chromeStatusBadge.className = "status-badge offline";
        chromeStatusText.textContent = "Chrome Debug: Offline";
        singleGenBtns.forEach(btn => btn.disabled = true);
      }
    } catch (err) {
      chatGptReady = false;
      document.querySelectorAll('.btn-generate-single').forEach(btn => { btn.disabled = true; });
      console.error("Lỗi check Chrome status:", err);
    }
  }

  // Handle image upload & preview
  function handleImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      referenceImageBase64 = e.target.result;
      imgPreview.src = referenceImageBase64;
      dropzoneText.style.display = "none";
      previewContainer.style.display = "block";
      appendLocalLog(`Đã tải lên ảnh mẫu thành công: ${file.name}`, "info");
    };
    reader.readAsDataURL(file);
  }

  // Setup Collapsible Prompts Logic
  function setupCollapsiblePrompts() {
    for (let i = 1; i <= 4; i++) {
      const header = document.getElementById(`prompt-header-${i}`);
      const content = document.getElementById(`prompt-content-${i}`);
      
      header.addEventListener("click", () => {
        const isActive = header.classList.contains("active");
        header.setAttribute('aria-expanded', String(!isActive));
        
        // Toggle this one
        if (isActive) {
          header.classList.remove("active");
          content.style.display = "none";
        } else {
          header.classList.add("active");
          content.style.display = "block";
        }
      });
    }

    // Save individual prompt buttons
    document.querySelectorAll(".btn-save-prompt").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute("data-index")) - 1;
        const target = promptInputs[index];
        const newTitle = target.titleInput.value.trim() || `Ảnh ${index + 1}`;
        const newContent = target.contentInput.value.trim();

        // Update display title
        target.titleDisp.textContent = newTitle;
        
        // Save config
        await saveConfig();
        appendLocalLog(`Đã lưu thay đổi cho Prompt ${index + 1}: "${newTitle}"`, "success");
        alert(`Đã lưu Prompt ${index + 1} thành công!`);
      });
    });
  }

  // Setup expand/collapse toggle for textareas
  function setupTextareaExpander() {
    const btnToggleExpandArticle = document.getElementById("btn-toggle-expand-article");
    if (btnToggleExpandArticle) {
      btnToggleExpandArticle.addEventListener("click", () => {
        const expanded = articleContentTextarea.classList.toggle("expanded");
        btnToggleExpandArticle.textContent = expanded ? "Thu nhỏ" : "Phóng to";
        btnToggleExpandArticle.setAttribute('aria-expanded', String(expanded));
        appendLocalLog(expanded ? "Đã phóng to ô soạn thảo bài viết." : "Đã thu nhỏ ô soạn thảo bài viết.", "info");
      });
    }

    document.querySelectorAll(".btn-toggle-expand-prompt").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const index = btn.getAttribute("data-index");
        const textarea = document.getElementById(`prompt-${index}`);
        if (textarea) {
          const expanded = textarea.classList.toggle("expanded");
          btn.textContent = expanded ? "Thu nhỏ" : "Phóng to";
          btn.setAttribute('aria-expanded', String(expanded));
          appendLocalLog(expanded ? `Đã phóng to ô nhập Prompt ${index}.` : `Đã thu nhỏ ô nhập Prompt ${index}.`, "info");
        }
      });
    });
  }

  // Setup Theme Toggle Logic
  function setupThemeToggle() {
    const savedTheme = localStorage.getItem("theme") || "light";
    if (savedTheme === "light") {
      document.body.classList.add("light-mode");
      btnThemeToggle.textContent = "Giao diện tối";
    } else {
      document.body.classList.remove("light-mode");
      btnThemeToggle.textContent = "Giao diện sáng";
    }

    btnThemeToggle.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-mode");
      if (isLight) {
        localStorage.setItem("theme", "light");
        btnThemeToggle.textContent = "Giao diện tối";
        appendLocalLog("Đã chuyển sang giao diện Sáng.", "info");
      } else {
        localStorage.setItem("theme", "dark");
        btnThemeToggle.textContent = "Giao diện sáng";
        appendLocalLog("Đã chuyển sang giao diện Tối.", "info");
      }
    });
  }

  // Use the operating system's native dialog so users can choose any disk or
  // mounted Google Drive folder on both Windows and macOS.
  async function openFolderPicker(target = "website") {
    const input = target === "facebook" ? facebookMediaParentInput : driveParentInput;
    try {
      const res = await fetch("/api/system/select-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: input.value.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể mở hộp chọn thư mục.");
      if (data.canceled) return;

      input.value = data.path;
      await saveConfig();
      if (target === "website") updateTargetFolderDisplay();
      appendLocalLog(`Đã chọn thư mục ${target === "facebook" ? "ảnh Facebook" : "sản phẩm & ảnh"}: ${data.path}`, "success");
    } catch (err) {
      appendLocalLog(err.message, "error");
      alert(err.message);
    }
  }

  btnSelectFolder.addEventListener("click", () => openFolderPicker("website"));
  btnSelectFacebookMedia.addEventListener("click", () => openFolderPicker("facebook"));

  // --- Event Listeners ---

  // Check OpenAI Key
  btnCheckKey.addEventListener("click", async () => {
    const apiKey = openaiKeyInput.value.trim();
    if (!apiKey && !openAiApiKeyConfigured) {
      alert("Vui lòng nhập OpenAI API Key trước.");
      return;
    }
    btnCheckKey.disabled = true;
    appendLocalLog("Đang kết nối kiểm tra OpenAI API Key...", "info");
    try {
      const res = await fetch("/api/openai/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey })
      });
      const data = await res.json();
      if (res.ok) {
        appendLocalLog(data.message, "success");
        alert(data.message);
        if (apiKey) await saveConfig();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      appendLocalLog(err.message, "error");
      alert(err.message);
    } finally {
      btnCheckKey.disabled = false;
    }
  });

  // Save OpenAI Key directly
  if (btnSaveKey) {
    btnSaveKey.addEventListener("click", async () => {
      const apiKey = openaiKeyInput.value.trim();
      const notionApiKey = notionKeyInput.value.trim();
      if (!apiKey && !notionApiKey && !openAiApiKeyConfigured && !notionApiKeyConfigured) {
        alert("Vui lòng nhập OpenAI API Key hoặc Notion Access Token trước khi lưu.");
        return;
      }
      appendLocalLog("Đang lưu API Keys trên máy này...", "info");
      try {
        await saveConfig();
        appendLocalLog("Đã lưu OpenAI API Key và Notion Access Token thành công!", "success");
        alert("Đã lưu API Keys thành công trên máy này!");
      } catch (err) {
        appendLocalLog(`Không thể lưu API Keys: ${err.message}`, "error");
        alert(`Không thể lưu API Keys: ${err.message}`);
      }
    });
  }

  productDriveUrlInput.addEventListener("input", () => {
    clearTimeout(productDriveUrlSaveTimer);
    productDriveUrlSaveTimer = setTimeout(async () => {
      try {
        await persistGoogleDriveParentUrl();
      } catch (err) {
        appendLocalLog(`Không thể lưu link thư mục cha: ${err.message}`, "error");
      }
    }, 400);
  });
  productDriveUrlInput.addEventListener("change", () => persistGoogleDriveParentUrl().catch((err) => {
    appendLocalLog(`Không thể lưu link thư mục cha: ${err.message}`, "error");
  }));
  productDriveUrlInput.addEventListener("blur", () => persistGoogleDriveParentUrl({ silent: true }).catch(() => {}));
  btnSaveDriveParentUrl.addEventListener("click", async () => {
    const originalLabel = btnSaveDriveParentUrl.textContent;
    btnSaveDriveParentUrl.disabled = true;
    btnSaveDriveParentUrl.textContent = "Đang lưu...";
    try {
      await persistGoogleDriveParentUrl({ silent: true });
      appendLocalLog("Đã lưu link Google Drive thư mục cha trên máy này.", "success");
      btnSaveDriveParentUrl.textContent = "✓ Đã lưu link thư mục cha";
    } catch (err) {
      appendLocalLog(`Không thể lưu link thư mục cha: ${err.message}`, "error");
      alert(`Không thể lưu link thư mục cha: ${err.message}`);
      btnSaveDriveParentUrl.textContent = originalLabel;
      btnSaveDriveParentUrl.disabled = false;
    } finally {
      if (btnSaveDriveParentUrl.textContent.startsWith("✓")) {
        setTimeout(() => {
          btnSaveDriveParentUrl.textContent = originalLabel;
          btnSaveDriveParentUrl.disabled = false;
        }, 1800);
      }
    }
  });
  window.addEventListener("beforeunload", () => {
    const googleDriveParentUrl = productDriveUrlInput.value.trim();
    if (googleDriveParentUrl === lastSavedGoogleDriveParentUrl) return;
    const payload = new Blob([JSON.stringify({ googleDriveParentUrl })], { type: "application/json" });
    navigator.sendBeacon("/api/config/google-drive-parent", payload);
  });

  btnSaveLogoImageUrl.addEventListener("click", async () => {
    const originalLabel = btnSaveLogoImageUrl.textContent;
    btnSaveLogoImageUrl.disabled = true;
    btnSaveLogoImageUrl.textContent = "Đang lưu...";
    try {
      const response = await fetch("/api/config/logo-image", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoImageUrl: logoImageUrlInput.value.trim() })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Không thể lưu link hình logo.");
      appendLocalLog("Đã lưu link hình logo dùng cho cả 4 ảnh.", "success");
      btnSaveLogoImageUrl.textContent = "✓ Đã lưu link hình logo";
      setTimeout(() => {
        btnSaveLogoImageUrl.textContent = originalLabel;
        btnSaveLogoImageUrl.disabled = false;
      }, 1800);
    } catch (err) {
      appendLocalLog(`Không thể lưu link hình logo: ${err.message}`, "error");
      alert(`Không thể lưu link hình logo: ${err.message}`);
      btnSaveLogoImageUrl.textContent = originalLabel;
      btnSaveLogoImageUrl.disabled = false;
    }
  });

  btnToggleNotionKey.addEventListener("click", () => {
    const isHidden = notionKeyInput.type === "password";
    notionKeyInput.type = isHidden ? "text" : "password";
    btnToggleNotionKey.textContent = isHidden ? "Ẩn" : "Hiện";
    btnToggleNotionKey.setAttribute("aria-pressed", String(isHidden));
    btnToggleNotionKey.setAttribute("aria-label", isHidden ? "Ẩn Notion Access Token" : "Hiện Notion Access Token");
  });

  btnToggleGoogleDriveSecret.addEventListener("click", () => {
    const isHidden = googleDriveClientSecretInput.type === "password";
    googleDriveClientSecretInput.type = isHidden ? "text" : "password";
    btnToggleGoogleDriveSecret.textContent = isHidden ? "Ẩn" : "Hiện";
    btnToggleGoogleDriveSecret.setAttribute("aria-pressed", String(isHidden));
    btnToggleGoogleDriveSecret.setAttribute("aria-label", isHidden ? "Ẩn Google Drive Client Secret" : "Hiện Google Drive Client Secret");
  });

  btnConnectGoogleDrive.addEventListener("click", connectGoogleDrive);
  btnDisconnectGoogleDrive.addEventListener("click", disconnectGoogleDrive);

  // Image upload click/drop
  imageDropzone.addEventListener("click", (event) => {
    if (event.target !== refImageInput) refImageInput.click();
  });
  refImageInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
      handleImageFile(e.target.files[0]);
    }
  });
  
  imageDropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    imageDropzone.style.borderColor = "var(--primary)";
  });
  imageDropzone.addEventListener("dragleave", () => {
    imageDropzone.style.borderColor = "var(--surface-border)";
  });
  imageDropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    imageDropzone.style.borderColor = "var(--surface-border)";
    if (e.dataTransfer.files.length > 0) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  // Remove image
  btnRemoveImg.addEventListener("click", (e) => {
    e.stopPropagation();
    referenceImageBase64 = null;
    refImageInput.value = "";
    imgPreview.src = "";
    previewContainer.style.display = "none";
    dropzoneText.style.display = "flex";
    appendLocalLog("Đã gỡ bỏ ảnh mẫu sản phẩm.", "info");
  });

  // Generate article content
  btnGenerateContent.addEventListener("click", async () => {
    const productName = prodNameInput.value.trim();
    const details = prodDetailsInput.value.trim();
    const category = prodCategoryInput.value.trim();
    const price = prodPriceInput.value.trim();
    const driveParent = driveParentInput.value.trim();

    if (!productName) {
      alert("Vui lòng nhập tên sản phẩm trước.");
      return;
    }

    btnGenerateContent.disabled = true;
    btnGenerateContent.textContent = "Đang viết bài…";
    articleContentTextarea.setAttribute('aria-busy', 'true');

    try {
      await saveConfig();
      const res = await fetch("/api/openai/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, details, category, price, driveParent })
      });
      const data = await res.json();
      if (res.ok) {
        articleContentTextarea.value = data.content;
        btnPushNotion.disabled = false;
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      alert(`Lỗi: ${err.message}`);
    } finally {
      btnGenerateContent.disabled = false;
      btnGenerateContent.textContent = "Tạo bài viết bằng AI →";
      articleContentTextarea.setAttribute('aria-busy', 'false');
    }
  });

  async function runChromeAction(route) {
    const buttons = [btnLoginChrome, btnStartChrome, btnCheckChrome];
    buttons.forEach(button => { button.disabled = true; });
    try {
      let res = await fetch(route, { method: 'POST' });
      let data = await res.json();
      if (route === '/api/chrome/start' && data.code === 'CHROME_PROFILE_RESTART_REQUIRED') {
        if (!window.confirm(data.error)) {
          chromeLoginHint.textContent = 'Đã hủy chuyển chế độ. Profile đăng nhập vẫn giữ nguyên; khi sẵn sàng, bấm Kết nối Chrome Debug.';
          return;
        }
        chromeLoginHint.textContent = 'Đang chuyển profile sang Chrome Debug, giữ nguyên tài khoản...';
        res = await fetch(route, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restartProfile: true })
        });
        data = await res.json();
      }
      if (res.ok) {
        chromeLoginHint.textContent = data.message;
        appendLocalLog(data.message, data.ready ? 'success' : 'info');
        await checkChromeStatus();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      chromeLoginHint.textContent = err.message;
      appendLocalLog(err.message, "error");
      alert(err.message);
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
  }
  btnLoginChrome.addEventListener('click', () => runChromeAction('/api/chrome/login'));
  btnStartChrome.addEventListener('click', () => runChromeAction('/api/chrome/start'));
  btnCheckChrome.addEventListener('click', () => runChromeAction('/api/chrome/connect'));

  // Clear local logs
  btnClearLogs.addEventListener("click", async () => {
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      logBox.innerHTML = "";
      currentLogsLength = 0;
    } catch (err) {
      console.error(err);
    }
  });

  btnClearProductCache.addEventListener("click", async () => {
    const confirmed = window.confirm("Xóa dữ liệu của sản phẩm đang làm để bắt đầu sản phẩm mới? API key, Notion token, Google Drive OAuth, link thư mục cha, link logo và 4 prompt vẫn được giữ lại.");
    if (!confirmed) return;

    try {
      const response = await fetch("/api/app/clear-product-cache", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể xóa cache sản phẩm.");

      prodNameInput.value = "";
      prodCategoryInput.value = "Trị mụn";
      prodPriceInput.value = "350.000";
      prodDetailsInput.value = "";
      articleContentTextarea.value = "";
      currentProductDriveUrl = "";
      referenceImageBase64 = null;
      refImageInput.value = "";
      imgPreview.src = "";
      previewContainer.style.display = "none";
      dropzoneText.style.display = "flex";
      facebookProduct = null;
      facebookContentInput.value = "";
      facebookProductInfo.textContent = "Chưa tải dữ liệu sản phẩm.";
      logBox.innerHTML = "";
      if (facebookLogBox) facebookLogBox.innerHTML = "";
      currentLogsLength = 0;
      updateTargetFolderDisplay();
      appendLocalLog("Đã xóa cache sản phẩm. Có thể bắt đầu sản phẩm mới.", "success");
      showCompletionPopup({
        title: "Đã xóa cache sản phẩm",
        returnFocus: btnClearProductCache,
        message: "Dữ liệu sản phẩm hiện tại đã được làm mới. API key, Notion token, Google Drive OAuth, link thư mục cha, link logo và prompt vẫn được giữ lại."
      });
    } catch (err) {
      appendLocalLog(`Xóa cache sản phẩm thất bại: ${err.message}`, "error");
      alert(err.message);
    }
  });

  // Setup single prompt generate buttons
  document.querySelectorAll(".btn-generate-single").forEach(btn => {
    const start = Number(btn.getAttribute('data-index'));
    btn.textContent = `Sinh ảnh ${start}`;
    btn.title = 'Tạo một ảnh, tự lưu đúng thư mục rồi chờ bạn chọn prompt tiếp theo.';
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const productName = prodNameInput.value.trim();
      const driveParent = driveParentInput.value.trim();
      const index = btn.getAttribute("data-index");
      const promptText = promptInputs[parseInt(index) - 1].contentInput.value.trim();
      const details = prodDetailsInput.value.trim();
      const content = articleContentTextarea.value.trim();

      if (!productName) {
        alert("Vui lòng điền Tên sản phẩm trước khi tạo ảnh.");
        return;
      }
      if (!driveParent) {
        alert("Vui lòng chọn Thư mục Google Drive.");
        return;
      }
      if (!promptText) {
        alert("Nội dung prompt tạo ảnh trống.");
        return;
      }

      // Check Chrome status first
      await checkChromeStatus();
      if (!chatGptReady) {
        alert('ChatGPT chưa sẵn sàng. Đăng nhập rồi bấm Kiểm tra và khóa tab trước khi sinh ảnh.');
        return;
      }

      const imageButtons = document.querySelectorAll('.btn-generate-single');
      imageGenerationBusy = true;
      btn.textContent = `Đang tạo ảnh ${index}…`;
      btn.setAttribute('aria-busy', 'true');
      imageButtons.forEach(button => { button.disabled = true; });
      appendLocalLog(`============== KHỞI CHẠY TẠO ẢNH ${index} ==============`, "info");
      try {
        await saveConfig();
        const res = await fetch("/api/chrome/generate-single-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productName,
            driveParent,
            driveUrl: productDriveUrlInput.value.trim() || currentProductDriveUrl,
            promptIndex: index,
            promptText,
            details,
            content,
            referenceImage: index === "1" ? referenceImageBase64 : null,
            logoImageUrl: logoImageUrlInput.value.trim()
          })
        });
        const data = await res.json();
        if (res.ok) {
          if (data.driveUrl) {
            currentProductDriveUrl = data.driveUrl;
          }
          appendLocalLog(data.message, "success");
          appendLocalLog(`Đang tạo riêng ảnh ${index}. Tool sẽ tự lưu kết quả và dừng; giữ nguyên tab ChatGPT trong lúc chạy.`, 'info');
          while (true) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const statusResponse = await fetch('/api/chrome/image-job');
            if (!statusResponse.ok) throw new Error('Không đọc được tiến độ tạo ảnh. Kiểm tra nhật ký trước khi chạy lại.');
            const job = await statusResponse.json();
            if (job.id !== data.jobId) throw new Error('Phiên tạo ảnh đã thay đổi. Kiểm tra nhật ký của tool.');
            if (job.status === 'failed') throw new Error(job.error);
            if (job.status === 'completed') {
              showCompletionPopup({
                title: `Đã lưu ảnh ${index}`,
                returnFocus: document.getElementById(`prompt-header-${index}`),
                message: `Ảnh đã được lưu tại: ${job.savedPath}. Bạn có thể chọn prompt tiếp theo.`
              });
              break;
            }
          }
        } else {
          throw new Error(data.error || `Lỗi khi yêu cầu sinh ảnh ${index}`);
        }
      } catch (err) {
        appendLocalLog(`Lỗi sinh ảnh ${index}: ${err.message}`, "error");
        alert(`Lỗi: ${err.message}`);
      } finally {
        imageGenerationBusy = false;
        btn.textContent = `Sinh ảnh ${index}`;
        btn.setAttribute('aria-busy', 'false');
        await checkChromeStatus();
      }
    });
  });

  // Push article content to Notion
  btnPushNotion.addEventListener("click", async () => {
    const productName = prodNameInput.value.trim();
    const driveParent = driveParentInput.value.trim();
    const content = articleContentTextarea.value.trim();

    if (!productName || !content) {
      alert("Thiếu tên sản phẩm hoặc nội dung bài viết.");
      return;
    }

    btnPushNotion.disabled = true;
    btnPushNotion.textContent = "Đang gửi Notion…";
    appendLocalLog("============== ĐẨY BÀI VIẾT LÊN NOTION ==============", "info");

    try {
      await saveConfig();
      appendLocalLog("Đang đồng bộ bài viết và thiết lập trạng thái 'Content đang làm' trên Notion...", "info");
      const notionRes = await fetch("/api/notion/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName, content, driveParent, driveUrl: productDriveUrlInput.value.trim() || currentProductDriveUrl })
      });
      const notionData = await notionRes.json();
      if (!notionRes.ok) {
        throw new Error(notionData.error || "Lỗi đồng bộ Notion.");
      }

      appendLocalLog("Đồng bộ bài viết lên Notion thành công!", "success");
      appendLocalLog("============== HOÀN THÀNH QUY TRÌNH NOTION ==============", "success");
      showCompletionPopup({
        title: "Đã đẩy bài Website lên Notion",
        returnFocus: btnPushNotion,
        message: "Bài viết đã được lưu trên Notion. Trạng thái: Content đang làm; Facebook: Chưa đăng.",
        notionUrl: notionData.contentPageUrl,
        notionLabel: "Mở bài Website trên Notion"
      });
    } catch (err) {
      appendLocalLog(`Lỗi đồng bộ Notion: ${err.message}`, "error");
      alert(`Đồng bộ thất bại: ${err.message}`);
    } finally {
      btnPushNotion.disabled = false;
      btnPushNotion.textContent = "Đẩy bài lên Notion ↗";
    }
  });

  document.querySelectorAll(".product-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const isFacebook = tab.dataset.productTab === "facebook";
      document.querySelectorAll(".product-tab").forEach((item) => {
        item.classList.toggle("active", item === tab);
        item.setAttribute('aria-pressed', String(item === tab));
      });
      document.querySelector('.skip-link').href = isFacebook ? '#facebook-pending-products' : '#prod-name';
      document.getElementById("website-panel").hidden = isFacebook;
      document.getElementById("facebook-panel").hidden = !isFacebook;
      if (isFacebook) loadPendingFacebookProducts();
    });
  });

  facebookPromptSelect.addEventListener("change", () => {
    syncFacebookPromptEditorToState();
    selectedFacebookPromptId = facebookPromptSelect.value;
    loadSelectedFacebookPromptIntoEditor();
    setFacebookPromptStatus("Chưa lưu", "dirty");
  });

  facebookPromptNameInput.addEventListener("input", () => {
    syncFacebookPromptEditorToState();
    setFacebookPromptStatus("Chưa lưu", "dirty");
  });

  facebookPromptContentInput.addEventListener("input", () => {
    syncFacebookPromptEditorToState();
    setFacebookPromptStatus("Chưa lưu", "dirty");
  });

  btnAddFacebookPrompt.addEventListener("click", () => {
    syncFacebookPromptEditorToState();
    if (facebookPrompts.length >= 50) return alert("Thư viện chỉ hỗ trợ tối đa 50 prompt.");
    const newPrompt = {
      id: createFacebookPromptId(),
      name: `Prompt mới ${facebookPrompts.length + 1}`,
      content: ""
    };
    facebookPrompts.push(newPrompt);
    selectedFacebookPromptId = newPrompt.id;
    renderFacebookPromptOptions();
    loadSelectedFacebookPromptIntoEditor();
    setFacebookPromptStatus("Chưa lưu", "dirty");
    facebookPromptNameInput.focus();
    facebookPromptNameInput.select();
  });

  btnSaveFacebookPrompt.addEventListener("click", async () => {
    btnSaveFacebookPrompt.disabled = true;
    try {
      await persistFacebookPromptLibrary();
    } catch (err) {
      setFacebookPromptStatus("Lỗi lưu", "error");
      alert(err.message);
    } finally {
      btnSaveFacebookPrompt.disabled = false;
    }
  });

  btnDeleteFacebookPrompt.addEventListener("click", async () => {
    syncFacebookPromptEditorToState();
    const prompt = getSelectedFacebookPrompt();
    if (!prompt) return;
    if (facebookPrompts.length === 1) return alert("Cần giữ lại ít nhất một prompt trong thư viện.");
    if (!window.confirm(`Xóa prompt “${prompt.name || "chưa đặt tên"}”?`)) return;

    const previousPrompts = facebookPrompts.map((item) => ({ ...item }));
    const previousSelectedId = selectedFacebookPromptId;
    const removedIndex = facebookPrompts.findIndex((item) => item.id === prompt.id);
    facebookPrompts.splice(removedIndex, 1);
    selectedFacebookPromptId = facebookPrompts[Math.min(removedIndex, facebookPrompts.length - 1)].id;
    renderFacebookPromptOptions();
    loadSelectedFacebookPromptIntoEditor();
    try {
      await persistFacebookPromptLibrary(`Đã xóa prompt “${prompt.name}”.`);
    } catch (err) {
      facebookPrompts = previousPrompts;
      selectedFacebookPromptId = previousSelectedId;
      renderFacebookPromptOptions();
      loadSelectedFacebookPromptIntoEditor();
      setFacebookPromptStatus("Lỗi xóa", "error");
      alert(err.message);
    }
  });

  btnExportFacebookPrompts.addEventListener("click", () => {
    try {
      syncFacebookPromptEditorToState();
      validateFacebookPromptLibrary();
      const payload = {
        format: "notion-product-creator-facebook-prompts",
        version: 1,
        exportedAt: new Date().toISOString(),
        selectedPromptId: selectedFacebookPromptId,
        prompts: facebookPrompts
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "notion-product-creator-facebook-prompts.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      appendLocalLog(`Đã xuất ${facebookPrompts.length} prompt Facebook.`, "success");
    } catch (err) {
      setFacebookPromptStatus("Không thể xuất", "error");
      alert(err.message);
    }
  });

  btnImportFacebookPrompts.addEventListener("click", () => facebookPromptsImportFile.click());

  facebookPromptsImportFile.addEventListener("change", async () => {
    const file = facebookPromptsImportFile.files?.[0];
    facebookPromptsImportFile.value = "";
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("File prompt không được vượt quá 1 MB.");
      const payload = JSON.parse(await file.text());
      const importedPrompts = normalizeImportedFacebookPrompts(Array.isArray(payload) ? payload : payload.prompts);
      if (!window.confirm(`Nhập ${importedPrompts.length} prompt và thay thế thư viện hiện tại?`)) return;
      facebookPrompts = importedPrompts;
      selectedFacebookPromptId = facebookPrompts.some((prompt) => prompt.id === payload.selectedPromptId)
        ? payload.selectedPromptId
        : facebookPrompts[0].id;
      renderFacebookPromptOptions();
      loadSelectedFacebookPromptIntoEditor();
      await persistFacebookPromptLibrary(`Đã nhập và lưu ${facebookPrompts.length} prompt Facebook.`);
    } catch (err) {
      setFacebookPromptStatus("Lỗi nhập file", "error");
      alert(`Không thể nhập thư viện prompt: ${err.message}`);
    }
  });

  document.getElementById("btn-save-facebook-config").addEventListener("click", async () => {
    try {
      await persistFacebookPromptLibrary("Đã lưu cấu hình Page Facebook và thư viện prompt.");
    } catch (err) {
      setFacebookPromptStatus("Lỗi lưu", "error");
      alert(err.message);
    }
  });

  document.getElementById("btn-start-facebook").addEventListener("click", async () => {
    const res = await fetch("/api/facebook/start", { method: "POST" });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Không thể mở Facebook Debug.");
    appendLocalLog(data.message, "success");
  });

  function selectFacebookProduct(product) {
    facebookProduct = product;
    facebookContentInput.value = "";
    facebookProductInfo.textContent = `Sản phẩm: ${product.productName}\nLink web: ${product.webUrl || "Chưa có"}\nMedia: ${product.mediaUrl || "Chưa có"}`;
    appendLocalLog(`Đã chọn sản phẩm chờ đăng Facebook: ${product.productName}.`, "success");
  }

  function renderPendingFacebookProducts() {
    facebookPendingProducts.innerHTML = "";
    if (pendingFacebookProducts.length === 0) {
      facebookPendingProducts.textContent = "Không có sản phẩm nào có trạng thái Facebook: Chưa đăng.";
      return;
    }

    for (const product of pendingFacebookProducts) {
      const item = document.createElement("label");
      item.className = "facebook-pending-product";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "facebook-pending-product";
      input.checked = facebookProduct?.pageId === product.pageId;
      input.addEventListener("change", () => selectFacebookProduct(product));
      const text = document.createElement("span");
      text.textContent = product.productName;
      item.append(input, text);
      facebookPendingProducts.appendChild(item);
    }
  }

  async function loadPendingFacebookProducts() {
    btnRefreshFacebookProducts.disabled = true;
    facebookPendingProducts.textContent = "Đang quét sản phẩm có trạng thái Facebook: Chưa đăng...";
    try {
      const res = await fetch("/api/facebook/pending-products");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể quét Notion.");
      pendingFacebookProducts = data.products || [];
      if (facebookProduct && !pendingFacebookProducts.some((product) => product.pageId === facebookProduct.pageId)) {
        facebookProduct = null;
        facebookContentInput.value = "";
        facebookProductInfo.textContent = "Chưa chọn sản phẩm.";
      }
      renderPendingFacebookProducts();
      appendLocalLog(`Đã quét ${pendingFacebookProducts.length} sản phẩm chờ đăng Facebook từ Notion.`, "success");
    } catch (err) {
      facebookPendingProducts.textContent = err.message;
      appendLocalLog(err.message, "error");
    } finally {
      btnRefreshFacebookProducts.disabled = false;
    }
  }

  btnRefreshFacebookProducts.addEventListener("click", loadPendingFacebookProducts);

  async function confirmWaitingFacebookProducts() {
    const originalLabel = btnConfirmFacebookPublished.textContent;
    btnConfirmFacebookPublished.disabled = true;
    btnConfirmFacebookPublished.textContent = "Đang quét Chờ đăng...";
    try {
      const waitingResponse = await fetch("/api/facebook/waiting-products");
      const waitingData = await waitingResponse.json();
      if (!waitingResponse.ok) throw new Error(waitingData.error || "Không thể quét bài Chờ đăng.");

      const waitingProducts = waitingData.products || [];
      if (!waitingProducts.length) {
        showCompletionPopup({
          title: "Không có bài Chờ đăng",
          message: "Notion hiện không có sản phẩm nào cần chuyển trạng thái Facebook sang Đã đăng."
        });
        return;
      }

      const visibleNames = waitingProducts.slice(0, 8).map((product) => `• ${product.productName}`).join("\n");
      const remainingText = waitingProducts.length > 8 ? `\n• ... và ${waitingProducts.length - 8} bài khác` : "";
      const confirmed = window.confirm(
        `Tìm thấy ${waitingProducts.length} bài Facebook đang ở trạng thái “Chờ đăng”:\n\n` +
        `${visibleNames}${remainingText}\n\n` +
        "Chỉ tiếp tục nếu bạn đã bấm Đăng các bài này trên Facebook. Chuyển tất cả sang “Đã đăng”?"
      );
      if (!confirmed) return;

      btnConfirmFacebookPublished.textContent = "Đang cập nhật Notion...";
      const updateResponse = await fetch("/api/facebook/mark-waiting-as-published", { method: "POST" });
      const updateData = await updateResponse.json();
      if (!updateResponse.ok) throw new Error(updateData.error || "Không thể cập nhật trạng thái Facebook.");

      appendLocalLog(`Đã chuyển ${updateData.updatedCount} bài Facebook từ Chờ đăng sang Đã đăng.`, "success");
      showCompletionPopup({
        title: "Đã cập nhật Notion",
        message: `Hoàn thành: ${updateData.updatedCount} bài Facebook đã được chuyển từ “Chờ đăng” sang “Đã đăng”.`
      });
      await loadPendingFacebookProducts();
    } catch (err) {
      appendLocalLog(err.message, "error");
      alert(err.message);
    } finally {
      btnConfirmFacebookPublished.disabled = false;
      btnConfirmFacebookPublished.textContent = originalLabel;
    }
  }

  btnConfirmFacebookPublished.addEventListener("click", confirmWaitingFacebookProducts);

  document.getElementById("btn-generate-facebook").addEventListener("click", async (event) => {
    if (!facebookProduct) return alert("Hãy lấy dữ liệu sản phẩm từ Notion trước.");
    syncFacebookPromptEditorToState();
    const activePrompt = getSelectedFacebookPrompt();
    if (!activePrompt?.content.trim()) return alert("Hãy nhập nội dung prompt trước khi tạo bài bằng AI.");

    const button = event.currentTarget;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "AI đang viết bài...";
    try {
      const res = await fetch("/api/facebook/generate-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: facebookProduct.productName,
          webUrl: facebookProduct.webUrl,
          template: facebookTemplateInput.value.trim(),
          prompt: activePrompt.content.trim()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể tạo bài Facebook.");
      facebookContentInput.value = data.content;
      appendLocalLog(`Đã tạo bài Facebook bằng prompt “${activePrompt.name}”.`, "success");
    } catch (err) {
      alert(err.message);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  document.getElementById("btn-publish-facebook").addEventListener("click", async () => {
    if (!facebookProduct || !facebookContentInput.value.trim()) return alert("Hãy lấy dữ liệu Notion và tạo nội dung bài đăng trước.");
    if (!facebookPageUrlInput.value.trim()) return alert("Nhập URL Page Facebook trước.");
    await saveConfig();
    const res = await fetch("/api/facebook/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: facebookProduct.productName, content: facebookContentInput.value.trim(), driveParent: facebookMediaParentInput.value.trim() }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Không thể đăng Facebook.");
    appendLocalLog(data.message, "success");
    showCompletionPopup({
      title: "Đã chuẩn bị bài Facebook",
      message: "Nội dung và ảnh đã được đưa vào form Facebook, lưu trên Notion và chuyển trạng thái thành Chờ đăng. Hãy kiểm tra rồi bấm đăng trên Facebook.",
      notionUrl: data.facebookContentPageUrl,
      notionLabel: "Mở bài Facebook trên Notion"
    });
    await loadPendingFacebookProducts();
  });

  // --- Initializations ---
  loadConfig();
  checkChromeStatus();
  setupCollapsiblePrompts();
  setupTextareaExpander();
  setupThemeToggle();
  setupSystemConfigToggle();

  // Disable spellcheck globally to remove wavy red underlines
  document.querySelectorAll("input, textarea").forEach(el => {
    el.setAttribute("spellcheck", "false");
  });

  // Listen to input changes for target folder path display
  prodNameInput.addEventListener("input", updateTargetFolderDisplay);
  driveParentInput.addEventListener("change", updateTargetFolderDisplay);
  
  // Poll logs and Chrome status periodically
  setInterval(fetchLogs, 1000);
  setInterval(checkChromeStatus, 4000);
});
