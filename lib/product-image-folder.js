const fs = require("fs").promises;
const path = require("path");

const NUMBERED_IMAGE_PATTERN = /^\d+\.(png|jpe?g|webp)$/i;

function normalizeProductName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^sp\s+/, "");
}

async function listNumberedImages(folder) {
  try {
    const entries = await fs.readdir(folder, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && NUMBERED_IMAGE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  }
}

function scoreFolderName(folderName, productName) {
  const folderTokens = normalizeProductName(folderName).split(" ").filter(Boolean);
  const productTokens = normalizeProductName(productName).split(" ").filter(Boolean);
  if (!folderTokens.length || !productTokens.length) return 0;
  if (folderTokens.join(" ") === productTokens.join(" ")) return 100000;

  let commonPrefixLength = 0;
  const limit = Math.min(folderTokens.length, productTokens.length);
  while (commonPrefixLength < limit && folderTokens[commonPrefixLength] === productTokens[commonPrefixLength]) {
    commonPrefixLength += 1;
  }

  const shorterNameIsPrefix = commonPrefixLength === limit;
  if (shorterNameIsPrefix && commonPrefixLength >= 3) {
    return 50000 + commonPrefixLength * 100 + limit;
  }

  const productTokenSet = new Set(productTokens);
  const matchingTokens = folderTokens.filter((token) => productTokenSet.has(token)).length;
  const folderCoverage = matchingTokens / folderTokens.length;
  if (matchingTokens >= 3 && folderCoverage >= 0.8) {
    return 10000 + Math.round(folderCoverage * 1000) + matchingTokens;
  }
  return 0;
}

function createFolderError(message) {
  const error = new Error(message);
  error.code = "PRODUCT_IMAGE_FOLDER_NOT_FOUND";
  return error;
}

async function resolveProductImageFolder(parentFolder, productName) {
  const root = path.resolve(String(parentFolder || "").trim());
  if (!String(parentFolder || "").trim()) {
    throw createFolderError("Chưa chọn thư mục gốc ảnh Facebook.");
  }

  if ((await listNumberedImages(root)).length > 0) return root;

  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      throw createFolderError(`Thư mục ảnh Facebook không tồn tại: ${root}`);
    }
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const score = scoreFolderName(entry.name, productName);
    if (!score) continue;
    const fullPath = path.join(root, entry.name);
    if ((await listNumberedImages(fullPath)).length > 0) {
      candidates.push({ fullPath, name: entry.name, score });
    }
  }

  candidates.sort((left, right) => right.score - left.score || right.name.length - left.name.length);
  if (!candidates.length) {
    throw createFolderError(
      `Không tìm thấy thư mục ảnh phù hợp với sản phẩm “${productName}” trong “${root}”. ` +
      "Hãy chọn thư mục cha chứa các thư mục sản phẩm hoặc chọn trực tiếp thư mục có ảnh 1.png, 2.png..."
    );
  }
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    throw createFolderError(
      `Có nhiều thư mục ảnh cùng khớp với sản phẩm “${productName}”: ` +
      `${candidates.slice(0, 3).map((candidate) => candidate.name).join(", ")}. Hãy chọn trực tiếp thư mục sản phẩm.`
    );
  }
  return candidates[0].fullPath;
}

module.exports = { listNumberedImages, normalizeProductName, resolveProductImageFolder, scoreFolderName };
