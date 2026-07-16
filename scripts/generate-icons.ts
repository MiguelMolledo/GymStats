/**
 * Genera los iconos de la PWA a partir de un SVG dibujado por código:
 * fondo #030303 con glow índigo radial y un glifo de mancuerna minimalista.
 *
 * Salidas (en /public):
 *   icons/icon-192.png        (192x192, any)
 *   icons/icon-512.png        (512x512, any)
 *   icons/maskable-512.png    (512x512, maskable · glifo en safe-zone ~80%)
 *   apple-touch-icon.png      (180x180, sin transparencia)
 *   ../src/app/favicon.ico    (32x32 · convención App Router)
 *
 * Uso: npx tsx scripts/generate-icons.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const PUBLIC = path.resolve(process.cwd(), "public");
const ICONS = path.join(PUBLIC, "icons");
const APP_DIR = path.resolve(process.cwd(), "src/app");

const BG = "#030303";
const INDIGO = "#6366f1";

/**
 * Construye el SVG del icono. `scale` (0-1) controla el tamaño del glifo dentro
 * del lienzo: para maskable usamos ~0.62 para respetar la safe-zone.
 */
function iconSvg(size: number, scale: number, withBleed: boolean): string {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  // Radio del glow: en maskable llenamos todo el lienzo para que el fondo
  // no deje esquinas vacías al recortarse en círculo/squircle.
  const glowR = withBleed ? s * 0.75 : s * 0.55;

  // Geometría de la mancuerna, centrada, escalada por `scale`.
  const g = s * scale; // ancho útil del glifo
  const barH = g * 0.14; // grosor de la barra
  const barW = g * 0.9; // largo de la barra
  const plateW = g * 0.16; // ancho de los discos internos
  const plateH = g * 0.62; // alto discos internos
  const capW = g * 0.11; // ancho topes externos
  const capH = g * 0.4; // alto topes externos
  const r = barH / 2;

  const left = cx - barW / 2;
  const right = cx + barW / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="70%">
      <stop offset="0%" stop-color="${INDIGO}" stop-opacity="0.55"/>
      <stop offset="45%" stop-color="${INDIGO}" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a5b4fc"/>
      <stop offset="100%" stop-color="${INDIGO}"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="${BG}"/>
  <circle cx="${cx}" cy="${cy * 0.9}" r="${glowR}" fill="url(#glow)"/>
  <g fill="url(#metal)">
    <!-- barra central -->
    <rect x="${left + capW + plateW - r}" y="${cy - barH / 2}" width="${
      barW - 2 * (capW + plateW) + 2 * r
    }" height="${barH}" rx="${r}"/>
    <!-- discos internos -->
    <rect x="${left + capW}" y="${cy - plateH / 2}" width="${plateW}" height="${plateH}" rx="${
      plateW * 0.32
    }"/>
    <rect x="${right - capW - plateW}" y="${cy - plateH / 2}" width="${plateW}" height="${plateH}" rx="${
      plateW * 0.32
    }"/>
    <!-- topes externos -->
    <rect x="${left}" y="${cy - capH / 2}" width="${capW}" height="${capH}" rx="${
      capW * 0.4
    }"/>
    <rect x="${right - capW}" y="${cy - capH / 2}" width="${capW}" height="${capH}" rx="${
      capW * 0.4
    }"/>
  </g>
</svg>`;
}

async function svgToPng(svg: string, size: number, out: string) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
}

async function main() {
  await mkdir(ICONS, { recursive: true });

  // Iconos "any" (glifo grande, sin recorte de sistema).
  await svgToPng(iconSvg(192, 0.72, false), 192, path.join(ICONS, "icon-192.png"));
  await svgToPng(iconSvg(512, 0.72, false), 512, path.join(ICONS, "icon-512.png"));

  // Maskable: glifo dentro de la safe-zone (~62%) y fondo a sangre.
  await svgToPng(
    iconSvg(512, 0.5, true),
    512,
    path.join(ICONS, "maskable-512.png"),
  );

  // Apple touch icon: 180x180, opaco (iOS ignora transparencia y pone negro).
  await svgToPng(iconSvg(180, 0.72, false), 180, path.join(PUBLIC, "apple-touch-icon.png"));

  // Favicon 32x32 (PNG dentro de .ico). Va en src/app por la convención de
  // App Router (Next lo enlaza automáticamente como <link rel="icon">).
  await sharp(Buffer.from(iconSvg(32, 0.78, false)))
    .resize(32, 32)
    .toFormat("png")
    .toFile(path.join(APP_DIR, "favicon.ico"));

  console.log(
    "Iconos generados en /public/icons, /public/apple-touch-icon.png y /src/app/favicon.ico",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
