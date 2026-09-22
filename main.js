const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");

let mainWindow = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  // Chỉ phiên Electron đầu tiên được phép khởi chạy Express.
  const { serverReady } = require("./server.js");

  async function createWindow() {
    const { port } = await serverReady;
    const win = new BrowserWindow({
      width: 1320,
      height: 880,
      title: "Notion Product Creator",
      icon: path.join(__dirname, "public", "favicon.ico"),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });

    mainWindow = win;
    win.setMenuBarVisibility(false);
    await win.loadURL(`http://127.0.0.1:${port}`);

    win.on("closed", () => {
      if (mainWindow === win) mainWindow = null;
    });
  }

  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady()
    .then(createWindow)
    .catch((error) => {
      dialog.showErrorBox(
        "Không thể mở Notion Product Creator",
        `Máy chủ nội bộ không khởi động được: ${error.message}`
      );
      app.quit();
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch((error) => {
        dialog.showErrorBox("Không thể mở cửa sổ", error.message);
      });
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
