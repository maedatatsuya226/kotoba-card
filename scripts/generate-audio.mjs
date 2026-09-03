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
  body_teeth:      '歯',        // 「は」だけだと助詞「ワ」と読まれる
  job_nurse:       '看護師',     // 「かんごし」だと「カンゴ」+「シ」に分割される
  music_harmonica: 'ハーモニカ',  // 「はーもにか」だと「ワーモニカ」と読まれる(カタカナで回避)
  action_cry:      '泣く',      // ひらがなの「なく」は別アクセントになる
  action_jump:     '跳ぶ',      // 語義を固定
  action_stand:    '立つ',      // 語義を固定
  action_wash:     '洗う',      // ひらがなの「あらう」は「アラア」に崩れる
  action_wear:     '着る',      // ひらがなだと「切る」側のアクセントになる
};

// 辞書上の自動解析では意図した抑揚にならない語の個別調整。
const TTS_PARAM_OVERRIDES = {
  // 文脈を付けて解析した自然な発音から、対象語だけを合成する。
  action_cry:  { contextText: '悲しくて泣く', phraseIndex: 1 },
  action_jump: { contextText: '子どもが高く跳ぶ', phraseIndex: 1, moraStart: -2 },
  action_sleep: { contextText: '布団で寝る', phraseIndex: 1 },
  // 単独の「着る」は不自然に高くなるため、「服を着る」で解析した第2アクセント句だけを合成する。
  action_wear: { contextText: '服を着る', phraseIndex: 1 },
};

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

// reading のモーラ数(拗音は2文字1モーラ)
function moraCount(s) {
  const small = /[ゃゅょぁぃぅぇぉっャュョァィゥェォッ]/;
  let n = 0, i = 0;
  while (i < s.length) {
    if (i + 1 < s.length && small.test(s[i + 1])) i += 2;
    else i += 1;
    n += 1;
  }
  return n;
}

async function synthesize(text, {
  speedScale,
  postPhonemeLength,
  intonationScale = 1.0,
  accent,
  contextText,
  phraseIndex,
  moraStart,
}) {
  const queryText = contextText ?? text;
  const q = await fetch(
    `${ENGINE}/audio_query?text=${encodeURIComponent(queryText)}&speaker=${SPEAKER_ID}`,
    { method: 'POST' }
  );
  if (!q.ok) throw new Error(`audio_query ${q.status}: ${await q.text()}`);
  const query = await q.json();
  if (phraseIndex != null) {
    const phrase = query.accent_phrases[phraseIndex];
    if (!phrase) throw new Error(`accent phrase ${phraseIndex} not found for: ${queryText}`);
    if (moraStart != null) {
      phrase.moras = phrase.moras.slice(moraStart);
      phrase.accent = Math.min(phrase.accent, phrase.moras.length);
    }
    query.accent_phrases = [phrase];
  }
  query.speedScale = speedScale;
  query.postPhonemeLength = postPhonemeLength;
  query.intonationScale = intonationScale;
  if (accent != null && query.accent_phrases.length > 0) {
    query.accent_phrases[0].accent = accent;
  }

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
    // 情景カード等は cards.json 側の tts_text (漢字文) を優先。次に本ファイルの上書き表
    const ttsText = card.tts_text ?? TTS_OVERRIDES[card.id] ?? card.reading;
    // 1モーラ語は再生時間が短くて高齢患者に聞き取りにくいので、
    // 速度を遅めにし、後ろに無音を追加してリリースを聞き取りやすくする
    const mora = moraCount(card.reading);
    const params = mora <= 1
      ? { speedScale: 0.80, postPhonemeLength: 0.4 }
      : { speedScale: 0.95, postPhonemeLength: 0.1 };
    Object.assign(params, TTS_PARAM_OVERRIDES[card.id]);
    const tag = ttsText === card.reading ? card.reading : `${card.reading} → ${ttsText}`;
    process.stdout.write(`[${generated + 1}] ${card.id} (${tag}, ${mora}mora) ... `);
    const wav = await synthesize(ttsText, params);
    await writeFile(outPath, wav);
    console.log(`${(wav.length / 1024).toFixed(1)} KB`);
    generated++;
  }

  console.log(`\nDone: generated=${generated}, skipped=${skipped}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
