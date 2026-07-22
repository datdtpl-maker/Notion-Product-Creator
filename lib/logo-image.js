const fs = require("node:fs/promises");
const path = require("node:path");

const MAX_LOGO_BYTES = 10 * 1024 * 1024;

function getGoogleDriveFileId(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (host !== "drive.google.com" && host !== "drive.usercontent.google.com") return null;

    const filePathMatch = url.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return filePathMatch?.[1] || url.searchParams.get("id") || null;
  } catch {
    return null;
  }
}

function detectImageExtension(contentType, buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "png";
  if (buffer.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) return "jpg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";

  if (contentType.includes("image/png")) return "png";
  if (contentType.includes("image/jpeg")) return "jpg";
  if (contentType.includes("image/webp")) return "webp";
  return null;
}

async function downloadGoogleDriveLogo(logoUrl, targetFolder, fetchImpl = fetch) {
  const fileId = getGoogleDriveFileId(logoUrl);
  if (!fileId) {
    throw new Error("Link logo phải là link file Google Drive hợp lệ dạng drive.google.com/file/d/...");
  }

  const downloadUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`;
  const response = await fetchImpl(downloadUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`Không tải được logo từ Google Drive (HTTP ${response.status}).`);

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_LOGO_BYTES) throw new Error("File logo vượt quá giới hạn 10 MB.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("File logo tải về bị rỗng.");
  if (buffer.length > MAX_LOGO_BYTES) throw new Error("File logo vượt quá giới hạn 10 MB.");

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const extension = detectImageExtension(contentType, buffer);
  if (!extension) throw new Error("File logo phải là ảnh PNG, JPG hoặc WebP.");

  const logoPath = path.join(targetFolder, `brand_logo.${extension}`);
  await fs.writeFile(logoPath, buffer);
  return logoPath;
}

module.exports = { MAX_LOGO_BYTES, getGoogleDriveFileId, detectImageExtension, downloadGoogleDriveLogo };
