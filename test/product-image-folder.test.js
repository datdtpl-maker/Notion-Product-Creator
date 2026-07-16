const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { resolveProductImageFolder } = require("../lib/product-image-folder");

test("finds a shortened product folder with an SP prefix", async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "npc-facebook-images-"));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));

  const actualFolder = path.join(parent, "SP LSI AKNIX Intense Purifying Care Grade 1");
  await fs.mkdir(actualFolder);
  await fs.writeFile(path.join(actualFolder, "1.png"), "image");

  const resolved = await resolveProductImageFolder(
    parent,
    "LSI AKNIX INTENSE PURIFYING CARE GRADE 1 - KEM TRỊ MỤN ẨN, MỤN ĐẦU ĐEN VÀ KIỂM SOÁT DẦU"
  );

  assert.equal(resolved, actualFolder);
});

test("accepts the product folder itself when it contains numbered images", async (t) => {
  const productFolder = await fs.mkdtemp(path.join(os.tmpdir(), "npc-direct-product-"));
  t.after(() => fs.rm(productFolder, { recursive: true, force: true }));
  await fs.writeFile(path.join(productFolder, "1.jpg"), "image");

  const resolved = await resolveProductImageFolder(productFolder, "Any Product Name");
  assert.equal(resolved, productFolder);
});
