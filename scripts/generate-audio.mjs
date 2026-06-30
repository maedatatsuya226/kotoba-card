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
    process.stdout.write(`[${generated + 1}] ${card.id} (${card.reading}) ... `);
    const wav = await synthesize(card.reading);
    await writeFile(outPath, wav);
    console.log(`${(wav.length / 1024).toFixed(1)} KB`);
    generated++;
  }

  console.log(`\nDone: generated=${generated}, skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
