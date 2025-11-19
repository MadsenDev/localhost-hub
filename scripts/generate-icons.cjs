const fs = require('node:fs');
const path = require('node:path');
const png2icons = require('png2icons');

const projectRoot = path.resolve(__dirname, '..');
const buildDir = path.join(projectRoot, 'buildResources');
const desktopDir = path.join(projectRoot, 'public', 'logo-icons', 'desktop');
const desktopIcon = path.join(desktopDir, 'icon-512.png');
const marketingIcon = path.join(projectRoot, 'public', 'logo-icons', 'ios', 'AppIcon~ios-marketing.png');
const windowsIcon = path.join(projectRoot, 'public', 'logo-icons', 'windows', 'app.ico');

if (!fs.existsSync(desktopIcon)) {
  throw new Error(`Desktop icon not found at ${desktopIcon}`);
}
if (!fs.existsSync(windowsIcon)) {
  throw new Error(`Windows icon not found at ${windowsIcon}`);
}

fs.mkdirSync(buildDir, { recursive: true });

const iconPngTarget = path.join(buildDir, 'icon.png');
const iconIcoTarget = path.join(buildDir, 'icon.ico');
const iconIcnsTarget = path.join(buildDir, 'icon.icns');
const linuxIconDir = path.join(buildDir, 'linux-icons');

fs.copyFileSync(desktopIcon, iconPngTarget);
fs.copyFileSync(windowsIcon, iconIcoTarget);

const icnsSource = fs.existsSync(marketingIcon) ? marketingIcon : desktopIcon;
const pngBuffer = fs.readFileSync(icnsSource);
const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BICUBIC, 0, false);

if (!icnsBuffer) {
  throw new Error('Failed to generate ICNS file from source PNG');
}

fs.writeFileSync(iconIcnsTarget, icnsBuffer);

fs.rmSync(linuxIconDir, { recursive: true, force: true });
fs.mkdirSync(linuxIconDir, { recursive: true });

const linuxIcons = [
  { file: 'icon-16.png', size: '16x16' },
  { file: 'icon-24.png', size: '24x24' },
  { file: 'icon-32.png', size: '32x32' },
  { file: 'icon-48.png', size: '48x48' },
  { file: 'icon-64.png', size: '64x64' },
  { file: 'icon-128.png', size: '128x128' },
  { file: 'icon-256.png', size: '256x256' },
  { file: 'icon-512.png', size: '512x512' }
];

linuxIcons.forEach(({ file, size }) => {
  const source = path.join(desktopDir, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing desktop icon variant: ${source}`);
  }
  const target = path.join(linuxIconDir, `${size}.png`);
  fs.copyFileSync(source, target);
});

console.log('Generated icons in buildResources/:');
console.log(`- ${iconPngTarget}`);
console.log(`- ${iconIcoTarget}`);
console.log(`- ${iconIcnsTarget}`);
console.log(`- ${linuxIconDir}/*`);

