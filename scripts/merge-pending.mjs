#!/usr/bin/env node
// data/pending/*.json の生成リストのうち、画像 (images/<category>/<id>.png) が
// 用意できたカードだけを data/cards.json に取り込み、カテゴリが未登録なら
// data/categories.json にも追加する。取り込んだカードは pending から削除する。
// 使い方: node scripts/merge-pending.mjs
// その後:  node scripts/generate-audio.mjs   (音声の差分生成)
//          sw.js の CACHE_NAME と app.js の APP_VERSION を上げる

import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PENDING_DIR = path.join(ROOT, 'data/pending');
const CARDS_PATH = path.join(ROOT, 'data/cards.json');
const CATS_PATH = path.join(ROOT, 'data/categories.json');

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

// cards.json は1カード1行の手書き整形なので、JSON.stringify で丸ごと書き直さず
// 末尾の `]` の手前に同じ形式の行を差し込む
function cardLine(card) {
  const order = ['id', 'pair', 'pairs', 'level', 'image', 'type', 'category', 'japanese_label', 'kanji_label', 'reading', 'tts_text', 'familiarity', 'english_prompt'];
  const parts = order.filter((k) => card[k] !== undefined).map((k) => `"${k}": ${JSON.stringify(card[k])}`);
  return `  { ${parts.join(', ')} }`;
}

async function main() {
  const cardsText = await readFile(CARDS_PATH, 'utf8');
  const cards = JSON.parse(cardsText);
  const knownIds = new Set(cards.map((c) => c.id));
  const cats = JSON.parse(await readFile(CATS_PATH, 'utf8'));
  const knownCats = new Set(cats.map((c) => c.id));

  const files = (await readdir(PENDING_DIR)).filter((f) => f.endsWith('.json'));
  const newLines = [];
  let merged = 0, waiting = 0;

  for (const f of files) {
    const p = path.join(PENDING_DIR, f);
    const pending = JSON.parse(await readFile(p, 'utf8'));
    const remain = [];
    for (const card of pending.cards) {
      // image を持つカードは既存の絵を流用する (受動文など)。その絵があれば取り込める
      const img = path.join(ROOT, 'images', card.category, `${card.image ?? card.id}.png`);
      if (!(await exists(img))) { remain.push(card); waiting++; continue; }
      if (knownIds.has(card.id)) { console.log(`skip (already in cards.json): ${card.id}`); continue; }
      newLines.push(cardLine(card));
      knownIds.add(card.id);
      merged++;
      if (pending.category && !knownCats.has(pending.category.id)) {
        cats.push(pending.category);
        knownCats.add(pending.category.id);
        console.log(`category added: ${pending.category.id} (${pending.category.label})`);
      }
    }
    pending.cards = remain;
    await writeFile(p, JSON.stringify(pending, null, 2) + '\n');
  }

  if (newLines.length > 0) {
    const closing = cardsText.lastIndexOf(']');
    const head = cardsText.slice(0, closing).replace(/\s+$/, '');
    const updated = `${head},\n\n${newLines.join(',\n')}\n]\n`;
    JSON.parse(updated); // 壊れていないことを確認してから書く
    await writeFile(CARDS_PATH, updated);
    await writeFile(CATS_PATH, JSON.stringify(cats, null, 2).replace(/\n\s*("[a-z]+":)/g, ' $1').replace(/\n\s*\}/g, ' }') + '\n');
  }
  console.log(`\nmerged=${merged}, waiting for images=${waiting}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
