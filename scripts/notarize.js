const path = require("path");

module.exports = async function notarizeMacApp(context) {
  if (context.electronPlatformName !== "darwin") return;

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env;
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log("[macOS] Bỏ qua notarization vì chưa cấu hình Apple Developer secrets.");
    return;
  }

  const { notarize } = require("@electron/notarize");
  const appName = context.packager.appInfo.productFilename;
  await notarize({
    appPath: path.join(context.appOutDir, `${appName}.app`),
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID
  });
  console.log("[macOS] Đã notarize ứng dụng thành công.");
};
