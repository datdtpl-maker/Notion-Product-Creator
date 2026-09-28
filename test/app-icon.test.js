const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('Windows and macOS installers use the Product Creator icon, not the Electron default', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const html = await fs.readFile(path.join(root, 'public/index.html'), 'utf8');
  assert.equal(pkg.build.win.icon, 'public/favicon.ico');
  assert.equal(pkg.build.mac.icon, 'public/app-icon.icns');
  assert.equal(pkg.build.nsis.installerIcon, pkg.build.win.icon);
  assert.equal(pkg.build.nsis.uninstallerIcon, pkg.build.win.icon);
  assert.match(html, /class="logo-icon" src="app-icon.png"/);
  const png = await fs.readFile(path.join(root, 'public/app-icon.png'));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), png.readUInt32BE(20));
  assert.ok(png.readUInt32BE(16) >= 1024);

  const ico = await fs.readFile(path.join(root, pkg.build.win.icon));
  assert.equal(ico.readUInt32LE(0), 0x00010000);
  const sizes = [];
  for (let i = 0; i < ico.readUInt16LE(4); i++) sizes.push(ico[6 + i * 16] || 256);
  for (const size of [16, 32, 48, 256]) assert.ok(sizes.includes(size), `Windows icon includes ${size}px`);
  assert.deepEqual(await fs.readFile(path.join(root, 'app_icon.ico')), ico);

  const icns = await fs.readFile(path.join(root, pkg.build.mac.icon));
  assert.equal(icns.toString('ascii', 0, 4), 'icns');
  assert.equal(icns.readUInt32BE(4), icns.length);
  const representations = [];
  for (let offset = 8; offset < icns.length;) {
    representations.push(icns.toString('ascii', offset, offset + 4));
    const length = icns.readUInt32BE(offset + 4);
    assert.ok(length > 8 && offset + length <= icns.length);
    offset += length;
  }
  assert.ok(representations.includes('ic10'), 'macOS icon includes 1024px Retina representation');
});
