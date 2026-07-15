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
  const btnClearProductCache = document.getElementById("btn-clear-product-cache");
  
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
  const facebookPendingProducts = document.getElementById("facebook-pending-products");
  const btnRefreshFacebookProducts = document.getElementById("btn-refresh-facebook-products");
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

  // --- Functions ---

  function closeCompletionPopup() {
    completionModal.hidden = true;
  }

  function showCompletionPopup({ title, message, notionUrl, notionLabel = "Mở trên Notion" }) {
    completionTitle.textContent = title;
    completionMessage.textContent = message;
    completionNotionLink.hidden = !notionUrl;
    if (notionUrl) {
      completionNotionLink.href = notionUrl;
      completionNotionLink.textContent = notionLabel;
    }
    completionModal.hidden = false;
    btnCloseCompletion.focus();
  }

  btnCloseCompletion.addEventListener("click", closeCompletionPopup);
  completionModal.addEventListener("click", (event) => {
    if (event.target === completionModal) closeCompletionPopup();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !completionModal.hidden) closeCompletionPopup();
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
      lastSavedGoogleDriveParentUrl = productDriveUrlInput.value.trim();
      facebookPageUrlInput.value = config.facebookPageUrl || "";
      facebookMediaParentInput.value = config.facebookMediaParent || config.defaultDriveParent || "";
      facebookTemplateInput.value = config.facebookTemplate || "";
      
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
      facebookPageUrl: facebookPageUrlInput.value.trim(),
      facebookMediaParent: facebookMediaParentInput.value.trim(),
      facebookTemplate: facebookTemplateInput.value.trim(),
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
    if (!silent) appendLocalLog("Đã tự động lưu link Google Drive thư mục cha trên máy này.", "success");
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
      if (data.online) {
        chromeStatusBadge.className = "status-badge online";
        chromeStatusText.textContent = "Chrome Debug: Online";
        singleGenBtns.forEach(btn => btn.disabled = false);
      } else {
        chromeStatusBadge.className = "status-badge offline";
        chromeStatusText.textContent = "Chrome Debug: Offline";
        singleGenBtns.forEach(btn => btn.disabled = true);
      }
    } catch (err) {
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
      
      header.addEventListener("click", (e) => {
        // Prevent click events from input fields inside collapse headers if any
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "BUTTON") {
          return;
        }

        const isActive = header.classList.contains("active");
        
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
        btnToggleExpandArticle.textContent = expanded ? "🔍 Thu nhỏ" : "🔍 Phóng to";
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
          btn.textContent = expanded ? "🔍 Thu nhỏ" : "🔍 Phóng to";
          appendLocalLog(expanded ? `Đã phóng to ô nhập Prompt ${index}.` : `Đã thu nhỏ ô nhập Prompt ${index}.`, "info");
        }
      });
    });
  }

  // Setup Theme Toggle Logic
  function setupThemeToggle() {
    const savedTheme = localStorage.getItem("theme") || "dark";
    if (savedTheme === "light") {
      document.body.classList.add("light-mode");
      btnThemeToggle.textContent = "🌙 Chế độ Tối";
    } else {
      document.body.classList.remove("light-mode");
      btnThemeToggle.textContent = "☀️ Chế độ Sáng";
    }

    btnThemeToggle.addEventListener("click", () => {
      const isLight = document.body.classList.toggle("light-mode");
      if (isLight) {
        localStorage.setItem("theme", "light");
        btnThemeToggle.textContent = "🌙 Chế độ Tối";
        appendLocalLog("Đã chuyển sang giao diện Sáng.", "info");
      } else {
        localStorage.setItem("theme", "dark");
        btnThemeToggle.textContent = "☀️ Chế độ Sáng";
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
  window.addEventListener("beforeunload", () => {
    const googleDriveParentUrl = productDriveUrlInput.value.trim();
    if (googleDriveParentUrl === lastSavedGoogleDriveParentUrl) return;
    const payload = new Blob([JSON.stringify({ googleDriveParentUrl })], { type: "application/json" });
    navigator.sendBeacon("/api/config/google-drive-parent", payload);
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
  imageDropzone.addEventListener("click", () => refImageInput.click());
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
    articleContentTextarea.value = "Đang tạo nội dung bài viết bằng AI. Vui lòng chờ...";
    await saveConfig();

    try {
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
      articleContentTextarea.value = `Lỗi tạo bài viết: ${err.message}`;
      alert(`Lỗi: ${err.message}`);
    } finally {
      btnGenerateContent.disabled = false;
    }
  });

  // Start Chrome Debug
  btnStartChrome.addEventListener("click", async () => {
    btnStartChrome.disabled = true;
    appendLocalLog("Đang gửi lệnh khởi chạy Chrome Debug Port 9222 qua Windows shell...", "info");
    try {
      const res = await fetch("/api/chrome/start", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        appendLocalLog(data.message, "success");
        setTimeout(checkChromeStatus, 2500);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      appendLocalLog(err.message, "error");
      alert(err.message);
    } finally {
      btnStartChrome.disabled = false;
    }
  });

  // Check Chrome status button
  btnCheckChrome.addEventListener("click", async () => {
    btnCheckChrome.disabled = true;
    await checkChromeStatus();
    btnCheckChrome.disabled = false;
  });

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
    const confirmed = window.confirm("Xóa dữ liệu của sản phẩm đang làm để bắt đầu sản phẩm mới? API key, Notion token, Google Drive OAuth, link thư mục cha và 4 prompt vẫn được giữ lại.");
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
        message: "Dữ liệu sản phẩm hiện tại đã được làm mới. API key, Notion token, Google Drive OAuth, link thư mục cha và prompt vẫn được giữ lại."
      });
    } catch (err) {
      appendLocalLog(`Xóa cache sản phẩm thất bại: ${err.message}`, "error");
      alert(err.message);
    }
  });

  // Setup single prompt generate buttons
  document.querySelectorAll(".btn-generate-single").forEach(btn => {
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
      if (chromeStatusBadge.classList.contains("offline")) {
        alert("Trình duyệt Chrome Debug đang Offline. Hãy nhấn Khởi động Chrome Debug trước!");
        return;
      }

      btn.disabled = true;
      appendLocalLog(`============== KHỞI CHẠY TẠO ẢNH ${index} ==============`, "info");
      await saveConfig();

      try {
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
            referenceImage: index === "1" ? referenceImageBase64 : null
          })
        });
        const data = await res.json();
        if (res.ok) {
          if (data.driveUrl) {
            currentProductDriveUrl = data.driveUrl;
          }
          appendLocalLog(data.message, "success");
          alert(`Đã gửi lệnh sinh ảnh ${index} lên ChatGPT! Trình duyệt đang tự động hóa để tải ảnh về.`);
        } else {
          throw new Error(data.error || `Lỗi khi yêu cầu sinh ảnh ${index}`);
        }
      } catch (err) {
        appendLocalLog(`Lỗi sinh ảnh ${index}: ${err.message}`, "error");
        alert(`Lỗi: ${err.message}`);
      } finally {
        btn.disabled = false;
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
    appendLocalLog("============== ĐẨY BÀI VIẾT LÊN NOTION ==============", "info");
    await saveConfig();

    try {
      appendLocalLog("Đang đồng bộ bài viết và thiết lập trạng thái 'Báo IT đăng' trên Notion...", "info");
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
        message: "Bài viết đã được lưu trên Notion và chuyển sang trạng thái sẵn sàng đăng website.",
        notionUrl: notionData.contentPageUrl,
        notionLabel: "Mở bài Website trên Notion"
      });
    } catch (err) {
      appendLocalLog(`Lỗi đồng bộ Notion: ${err.message}`, "error");
      alert(`Đồng bộ thất bại: ${err.message}`);
    } finally {
      btnPushNotion.disabled = false;
    }
  });

  document.querySelectorAll(".product-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const isFacebook = tab.dataset.productTab === "facebook";
      document.querySelectorAll(".product-tab").forEach((item) => item.classList.toggle("active", item === tab));
      document.getElementById("website-panel").hidden = isFacebook;
      document.getElementById("facebook-panel").hidden = !isFacebook;
      if (isFacebook) loadPendingFacebookProducts();
    });
  });

  document.getElementById("btn-save-facebook-config").addEventListener("click", async () => {
    await saveConfig();
    appendLocalLog("Đã lưu cấu hình Page Facebook.", "success");
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

  document.getElementById("btn-generate-facebook").addEventListener("click", async () => {
    if (!facebookProduct) return alert("Hãy lấy dữ liệu sản phẩm từ Notion trước.");
    const res = await fetch("/api/facebook/generate-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productName: facebookProduct.productName, webUrl: facebookProduct.webUrl, template: facebookTemplateInput.value.trim() }) });
    const data = await res.json();
    if (!res.ok) return alert(data.error || "Không thể tạo bài Facebook.");
    facebookContentInput.value = data.content;
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
