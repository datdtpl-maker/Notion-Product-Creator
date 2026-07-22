const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { getGoogleDriveFileId, downloadGoogleDriveLogo } = require("../lib/logo-image");

test("extracts a logo file ID only from supported Google Drive URLs", () => {
  assert.equal(
    getGoogleDriveFileId("https://drive.google.com/file/d/1N3ushR0ex_Nkr1hH9FkcaJnP90TStp60/view"),
    "1N3ushR0ex_Nkr1hH9FkcaJnP90TStp60"
  );
  assert.equal(getGoogleDriveFileId("https://drive.google.com/open?id=file_123"), "file_123");
  assert.equal(getGoogleDriveFileId("https://example.com/file/d/file_123/view"), null);
});

test("downloads a validated PNG logo into the product folder", async (t) => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "npc-logo-"));
  t.after(() => fs.rm(folder, { recursive: true, force: true }));
  const png = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const fetchCalls = [];
  const fetchImpl = async (url) => {
    fetchCalls.push(url);
    return new Response(png, { status: 200, headers: { "content-type": "image/png" } });
  };

  const logoPath = await downloadGoogleDriveLogo(
    "https://drive.google.com/file/d/file_123/view",
    folder,
    fetchImpl
  );

  assert.equal(path.basename(logoPath), "brand_logo.png");
  assert.deepEqual(await fs.readFile(logoPath), png);
  assert.match(fetchCalls[0], /drive\.usercontent\.google\.com\/download\?id=file_123/);
});
