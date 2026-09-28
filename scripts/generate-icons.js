const fs = require('node:fs/promises');
const path = require('node:path');
const { convertIcon } = require('app-builder-lib/out/util/iconConverter');

// Reuse the pinned Electron Builder converter; no separate graphics dependency.
async function main() {
  const root = path.resolve(__dirname, '..');
  const source = path.join(root, 'public', 'app-icon.png');
  for (const format of ['ico', 'icns']) {
    const { icons, isFallback } = await convertIcon({
      sources: [source], fallbackSources: [], roots: [root], format,
      outDir: path.join(root, 'dist-electron', 'icon-assets', format)
    });
    if (isFallback || icons.length !== 1) throw new Error(`Cannot generate ${format} from app-icon.png`);
    const destination = path.join(root, 'public', format === 'ico' ? 'favicon.ico' : 'app-icon.icns');
    await fs.copyFile(icons[0].file, destination);
    if (format === 'ico') await fs.copyFile(destination, path.join(root, 'app_icon.ico'));
    console.log(`Generated ${path.relative(root, destination)}`);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
