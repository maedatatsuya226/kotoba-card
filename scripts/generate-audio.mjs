#!/usr/bin/env node
// 本生成: cards.json 全件を VOICEVOX (No.7 アナウンス) で wav 化
// 前提: VOICEVOX アプリ起動中 (http://127.0.0.1:50021)
// 使い方: node scripts/generate-audio.mjs           (差分のみ生成)
//        node scripts/generate-audio.mjs --force   (全件再生成)
// 出力:   audio/<category>/<id>.wav

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ENGINE = 'http://127.0.0.1:50021';
const SPEAKER_ID = 30; // No.7 アナウンス
const ROOT = path.resolve(import.meta.dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'audio');
const FORCE = process.argv.includes('--force');

// reading 通りに合成するとアクセント/読みが崩れる語を漢字等で上書き。
// 規約上 reading は「ヒント機能等で使うかな表記」のままにし、TTS にだけ別テキストを渡す。
// 追加時は本ファイルにエントリを足し、該当 wav を削除して再実行すれば差分生成される。
const TTS_OVERRIDES = {
  body_teeth: '歯',    // 「は」だけだと助詞「ワ」と読まれる
  job_nurse:  '看護師', // 「かんごし」だと「カンゴ」+「シ」に分割される
};

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function synthesize(text) {
  const q = await fetch(
    `${ENGINE}/audio_query?text=${encodeURIComponent(text)}&speaker=${SPEAKER_ID}`,
    { method: 'POST' }
  );
  if (!q.ok) throw new Error(`audio_query ${q.status}: ${await q.text()}`);
  const query = await q.json();
  query.speedScale = 0.95; // 単語呼称用に少しゆっくり

  const s = await fetch(`${ENGINE}/synthesis?speaker=${SPEAKER_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis ${s.status}: ${await s.text()}`);
  return Buffer.from(await s.arrayBuffer());
}

async function main() {
  const cards = JSON.parse(await readFile(path.join(ROOT, 'data/cards.json'), 'utf8'));
  console.log(`Total: ${cards.length} cards`);

  let generated = 0, skipped = 0;
  for (const card of cards) {
    const dir = path.join(AUDIO_DIR, card.category);
    const outPath = path.join(dir, `${card.id}.wav`);
    if (!FORCE && await exists(outPath)) { skipped++; continue; }

    await mkdir(dir, { recursive: true });
    const ttsText = TTS_OVERRIDES[card.id] ?? card.reading;
    const tag = ttsText === card.reading ? card.reading : `${card.reading} → ${ttsText}`;
    process.stdout.write(`[${generated + 1}] ${card.id} (${tag}) ... `);
    const wav = await synthesize(ttsText);
    await writeFile(outPath, wav);
    console.log(`${(wav.length / 1024).toFixed(1)} KB`);
    generated++;
  }

  console.log(`\nDone: generated=${generated}, skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
