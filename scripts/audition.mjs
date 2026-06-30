#!/usr/bin/env node
// 試聴用: VOICEVOX エンジンで代表語の wav を生成する
// 前提: VOICEVOX アプリ起動中 (http://127.0.0.1:50021)
// 使い方:  node scripts/audition.mjs
// 出力:    scripts/audition_out/<speaker>/<word>.wav

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ENGINE = 'http://127.0.0.1:50021';
const OUT_DIR = path.join(import.meta.dirname, 'audition_out');

// ST業務で「呼称しにくい/アクセントが揺れやすい」代表語を選定
const WORDS = [
  'りんご',       // 基本・高頻度
  'でんしゃ',     // 拗音 + 撥音
  'きゅうきゅうしゃ', // 拗音 + 長音 + 連続
  'ちょうちょ',   // 拗音始まり
  'えんぴつ',     // 撥音 + 促音的
  'ぞう',         // 長音1
  'らっぱ',       // 促音
  'たまご',       // 平板アクセント
];

// 試したい話者×スタイル (id は /speakers API で取得した値)
// 医療現場・呼称訓練向けに、落ち着いた大人ボイス中心で選定
const VOICES = [
  { label: 'No.7-アナウンス',   styleId: 30 },  // ナレーション特化・第一候補
  { label: 'No.7-読み聞かせ',   styleId: 31 },  // 同上・柔らかめ
  { label: '冥鳴ひまり',         styleId: 14 },  // 落ち着いた女性
  { label: '青山龍星-しっとり', styleId: 84 },  // 落ち着いた男性
  { label: '九州そら-ノーマル', styleId: 16 },  // 比較用
];

async function synthesizeOne(text, styleId) {
  // 1. audio_query でクエリ生成
  const q = await fetch(
    `${ENGINE}/audio_query?text=${encodeURIComponent(text)}&speaker=${styleId}`,
    { method: 'POST' }
  );
  if (!q.ok) throw new Error(`audio_query failed: ${q.status} ${await q.text()}`);
  const query = await q.json();

  // 単語1語の呼称用に少しゆっくり目に
  query.speedScale = 0.95;

  // 2. synthesis で wav 生成
  const s = await fetch(`${ENGINE}/synthesis?speaker=${styleId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis failed: ${s.status} ${await s.text()}`);
  return Buffer.from(await s.arrayBuffer());
}

async function main() {
  for (const v of VOICES) {
    const dir = path.join(OUT_DIR, v.label);
    await mkdir(dir, { recursive: true });
    for (const word of WORDS) {
      process.stdout.write(`[${v.label}] ${word} ... `);
      const wav = await synthesizeOne(word, v.styleId);
      await writeFile(path.join(dir, `${word}.wav`), wav);
      console.log(`${(wav.length / 1024).toFixed(1)} KB`);
    }
  }
  console.log(`\n完了: ${OUT_DIR}`);
  console.log('Finder で開く:  open scripts/audition_out');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
