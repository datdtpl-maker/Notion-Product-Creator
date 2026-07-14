const { execSync } = require("child_process");
const { existsSync } = require("fs");
const path = require("path");

// Playwright serializes functions passed to the browser. `pkg` compiles source
// to V8 bytecode, so those functions lose their original source text and fail
// with "Passed function is not well-serializable". Electron keeps app code as
// normal JavaScript inside app.asar, which is compatible with Playwright.
function build() {
  console.log("=== BUILD NOTION PRODUCT CREATOR (ELECTRON) ===");
  execSync("npm run electron-build", { stdio: "inherit", cwd: __dirname });

  const outputDir = path.join(__dirname, "dist-electron");
  if (!existsSync(outputDir)) {
    throw new Error(`Không tìm thấy thư mục build: ${outputDir}`);
  }

  console.log(`\nHoàn thành. Bộ cài đặt mới nằm tại: ${outputDir}`);
}

build();
