import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import pngToIco from "png-to-ico";
import sharp from "sharp";

const rootDir = process.cwd();
const publicDir = path.join(rootDir, "public");

const iconSvgPath = path.join(rootDir, "app", "icon.svg");
const appleIconSvgPath = path.join(rootDir, "app", "apple-icon.svg");

const renderPngBuffer = async (inputPath: string, size: number) =>
  sharp(inputPath, { density: 768 })
    .resize(size, size, { fit: "contain", withoutEnlargement: false })
    .png()
    .toBuffer();

const renderPngFile = async (inputPath: string, size: number, outputName: string) => {
  const outputPath = path.join(publicDir, outputName);
  const buffer = await renderPngBuffer(inputPath, size);
  await writeFile(outputPath, buffer);
  return buffer;
};

const run = async () => {
  await mkdir(publicDir, { recursive: true });

  await renderPngFile(iconSvgPath, 192, "icon-192.png");
  await renderPngFile(iconSvgPath, 512, "icon-512.png");
  await renderPngFile(appleIconSvgPath, 180, "apple-touch-icon.png");

  const favicon16 = await renderPngBuffer(iconSvgPath, 16);
  const favicon32 = await renderPngBuffer(iconSvgPath, 32);
  const faviconIco = await pngToIco([favicon16, favicon32]);

  await writeFile(path.join(publicDir, "favicon.ico"), faviconIco);

  console.log("Generated favicon and PWA icons in /public.");
};

run().catch((error) => {
  console.error("Failed to generate icon assets:", error);
  process.exit(1);
});
