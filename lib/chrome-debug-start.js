const { readDebugEndpoint } = require('./chatgpt-session');
const { isChromeProfileOpen, closeChromeProfile, listChromeProfileProcesses } = require('./chrome-login');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function ensureChromeDebug({ port, profileDir, restartProfile, launch, onProgress = () => {} }, dependencies = {}) {
  const readEndpoint = dependencies.readEndpoint || readDebugEndpoint;
  const isProfileOpen = dependencies.isProfileOpen || isChromeProfileOpen;
  const closeProfile = dependencies.closeProfile || closeChromeProfile;
  const wait = dependencies.wait || sleep;
  const probe = () => readEndpoint(port).catch(error => {
    if (error.code === 'CHROME_DEBUG_UNAVAILABLE') return null;
    throw error;
  });
  let endpoint = await probe();
  if (endpoint) return endpoint;
  if (await isProfileOpen(profileDir)) {
    if (restartProfile !== true) {
      throw Object.assign(new Error('Profile Chrome của tool vẫn đang chạy ở chế độ đăng nhập. Cho phép tool đóng đúng profile này rồi mở lại ở chế độ Debug? Tài khoản và cookie được giữ nguyên. Hãy lưu nội dung đang nhập trong các tab của profile này trước khi tiếp tục.'), { code: 'CHROME_PROFILE_RESTART_REQUIRED' });
    }
    onProgress('Đang đóng đúng profile Chrome của tool để chuyển sang Debug; giữ nguyên cookie và tài khoản...');
    await closeProfile(profileDir);
    if (await isProfileOpen(profileDir)) throw new Error('Profile Chrome chưa thoát. Tool đã dừng, không mở thêm trình duyệt.');
  }
  onProgress('Đang mở Chrome Debug với profile đã cấu hình...');
  await launch(port, profileDir, 'https://chatgpt.com', true);
  for (let attempt = 0; attempt < 30 && !endpoint; attempt++) {
    await wait(500);
    endpoint = await probe();
  }
  if (!endpoint) throw new Error(`Chrome đã được yêu cầu khởi động nhưng cổng Debug ${port} chưa phản hồi. Tool chưa kết nối và chưa gửi prompt. Hãy kiểm tra thông báo từ Chrome/macOS rồi thử Kết nối Chrome Debug lại.`);
  return endpoint;
}

async function ensureChromeManual({ profileDir, restartProfile, launch, onProgress = () => {} }, dependencies = {}) {
  const isProfileOpen = dependencies.isProfileOpen || isChromeProfileOpen;
  const closeProfile = dependencies.closeProfile || closeChromeProfile;
  const isDebugProfile = dependencies.isDebugProfile || (async dir => (await listChromeProfileProcesses(dir)).some(item => /(?:^|\s)--(?:remote-debugging-(?:port|pipe)|enable-automation)(?:=|\s|$)/.test(item.command)));
  const alreadyOpen = await isProfileOpen(profileDir);
  if (alreadyOpen && await isDebugProfile(profileDir)) {
    if (restartProfile !== true) throw Object.assign(new Error('Cho phép đóng đúng profile Chrome của tool và mở lại ở chế độ đăng nhập thủ công? Hãy lưu nội dung đang nhập trước. Cookie và tài khoản được giữ nguyên; tool không tự xác minh hoặc gửi prompt.'), { code: 'CHROME_PROFILE_RESTART_REQUIRED' });
    onProgress('Đang quay về Chrome đăng nhập thủ công, giữ nguyên tài khoản và cookie...');
    await closeProfile(profileDir);
    if (await isProfileOpen(profileDir)) throw new Error('Profile Chrome chưa thoát. Tool đã dừng, không mở thêm trình duyệt.');
  } else if (alreadyOpen) return { state: 'manual', alreadyOpen: true };
  // Do not attach to or close an unrelated Debug endpoint on the same port.
  await launch(null, profileDir, 'https://chatgpt.com', false);
  return { state: 'manual', alreadyOpen: false };
}

module.exports = { ensureChromeDebug, ensureChromeManual };
