const { app, BrowserWindow } = require("electron");
const path = require("path");

// Khởi chạy máy chủ Express trong nền
require("./server.js");

function createWindow() {
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

  // Tắt thanh Menu mặc định (File, Edit, Selection...)
  win.setMenuBarVisibility(false);

  // Load URL của Express Server chạy tại cổng 3000
  win.loadURL("http://127.0.0.1:3000");

  win.on("closed", () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
