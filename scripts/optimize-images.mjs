#!/usr/bin/env node
// 画像最適化: 生成した PNG を 512px 以下・パレットPNG に変換して上書きする
// 前提: リポジトリ直下で `npm install --no-save sharp` 済み (node_modules は gitignore)
// 使い方: node scripts/optimize-images.mjs images/action          (ディレクトリ内の png すべて)
//         node scripts/optimize-images.mjs images/nature/nature_mountain.png  (個別)
// 規約 (CLAUDE.md): 512px 以下、80KB 以下目安、PNG palette

import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_SIZE = 512;
const TARGET_KB = 80;

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.error('sharp が見つかりません。リポジトリ直下で `npm install --no-save sharp` を実行してください。');
  process.exit(1);
}

async function collect(target) {
  const s = await stat(target);
  if (s.isFile()) return [target];
  const names = await readdir(target);
  return names.filter((n) => n.toLowerCase().endsWith('.png')).map((n) => path.join(target, n));
}

async function optimize(file) {
  const input = await readFile(file);
  const before = input.length;
  const out = await sharp(input)
    .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toBuffer();
  await writeFile(file, out);
  const kb = out.length / 1024;
  const flag = kb > TARGET_KB ? '  <- 目安超過' : '';
  console.log(`${path.relative(process.cwd(), file)}: ${(before / 1024).toFixed(0)}KB -> ${kb.toFixed(0)}KB${flag}`);
}

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error('使い方: node scripts/optimize-images.mjs <ディレクトリ or PNGファイル>...');
  process.exit(1);
}
for (const t of targets) {
  for (const f of await collect(t)) await optimize(f);
}
