const COMPOSER_TEXT = /Bạn đang nghĩ gì|What.?s on your mind|Tạo bài viết|Create post/i;
const SWITCH_TO_PAGE_TEXT = /^(?:Chuyển ngay|Switch now)$/i;

function getFacebookComposer(page) {
  return page.locator('div[role="button"]')
    .filter({ hasText: COMPOSER_TEXT })
    .first();
}

function createComposerError(switched) {
  const message = switched
    ? "Đã chuyển sang danh tính Page nhưng Facebook chưa hiển thị khung tạo bài. Hãy tải lại Page rồi thử lại."
    : "Không tìm thấy khung tạo bài Facebook. Hãy chắc chắn tài khoản có quyền quản trị Page và đã chuyển sang danh tính Page.";
  const error = new Error(message);
  error.code = "FACEBOOK_COMPOSER_NOT_FOUND";
  return error;
}

async function ensureFacebookPageComposer(page, { timeoutMs = 45000 } = {}) {
  let composer = getFacebookComposer(page);
  if (await composer.isVisible().catch(() => false)) {
    return { composer, switched: false };
  }

  const switchButton = page.getByRole("button", { name: SWITCH_TO_PAGE_TEXT }).first();
  const shouldSwitch = await switchButton.isVisible().catch(() => false);
  if (shouldSwitch) {
    await switchButton.click();
    composer = getFacebookComposer(page);
  }

  try {
    await composer.waitFor({ state: "visible", timeout: timeoutMs });
  } catch {
    throw createComposerError(shouldSwitch);
  }

  return { composer, switched: shouldSwitch };
}

module.exports = {
  COMPOSER_TEXT,
  SWITCH_TO_PAGE_TEXT,
  ensureFacebookPageComposer,
  getFacebookComposer
};
