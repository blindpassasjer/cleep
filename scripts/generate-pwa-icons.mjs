import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
const src = path.join(publicDir, 'favicon.svg');

async function writeIcon(fileName, size) {
  const filePath = path.join(publicDir, fileName);
  await sharp(src, { density: 1024 }).resize(size, size).png().toFile(filePath);
  console.log(`Generated ${fileName} (${size}x${size})`);
}

await writeIcon('pwa-192.png', 192);
await writeIcon('pwa-512.png', 512);
await writeIcon('pwa-maskable-512.png', 512);
await writeIcon('apple-touch-icon.png', 180);
