# NEXT — 次のセッションで再開するための引き継ぎ

最終更新: 2026-09-07

このファイルは別のPCや次のセッションで作業を再開する時、まず読むためのもの。完了したら該当項目を削除する。

## ⚠️ 今は `next` ブランチで作業中(本番にはまだ出さない)

v32〜v33(短文理解のレベル分け・情景絵30枚)は **`next` ブランチ**にある。本番(Cloudflare Pages)は `main` だけを配信するので、`main` にプッシュするまでアプリには反映されない。**音声を揃えて確認するまで `main` にはマージしない。**

### Mac でやること(音声生成)

```sh
git fetch origin
git checkout next            # main ではなく next
node scripts/generate-audio.mjs   # VOICEVOX 起動中に。未生成の 36 件だけ作られる
git add audio
git commit -m "Add audio for level-graded scene cards"
git push origin next         # ← main に push しないこと
```

- 対象 36 件 = 受動文 6(既存の絵を流用)+ 新しい情景文 30。すべて `tts_text`(漢字文)で合成される
- 文が長いので、試聴して区切り・アクセントが不自然な文は `TTS_PARAM_OVERRIDES` / `TTS_OVERRIDES` で調整して該当 wav を削除→再実行
- 終わったら Windows 側で `next` を確認し、`main` にマージしてプッシュ(その時点で本番に配信)

### Windows 側で最後にやること

```sh
git fetch origin && git checkout main && git merge --ff-only origin/next
# APP_VERSION / CACHE_NAME を上げてコミット → git push origin main
```

## 進行中: スタッフFB第2弾への対応

FB原文は `~/Downloads/ことばカードFB第２弾.doc`(リポジトリ外)。3項目に整理して順に対応する。

### 1. 誤答の記録・復習・分析 — 完了(v29)

- 呼称で×の後に「誤りの種類」(喚語困難/新造語/語性錯語/音韻性錯語/保続)を任意で記録
- 終了画面に「間違えた ことば」一覧(種類つき)と「間違えた語で もう一度」ボタン
- 終了画面に文字数別・カテゴリ別の正答内訳(保存なし)
- [ ] iPad 実機で確認、ST の使用感を聞く

### 2. 文字チップ課題(かな選択) — 完了(v30)

- ホームに4つ目の入口「ならべる」+ プリセット2つ(文字数あり / なし)
- ダミーは似た音(清濁・同じ行・拗音の入れ替え)から。難易度は詳細設定の「ダミーの文字」「文字数の提示」「語の長さ」
- 終了画面の集計・復習は選択と共通(`firstTry` / `missed`)。情景カードは対象外
- [ ] iPad 実機で確認(チップの押しやすさ、誤答後のリセットの間)。ST の使用感を聞く

### 3. 短文理解のレベル分け — アプリ側完了(v32)、**画像30枚の生成待ち**

- 情景カードに `level`(simple 単文 / semantic 意味 / reversible 語順 / particle 助詞 / relative 関係節)。詳細設定「文のレベル」で絞り込み(情景を選んでいる時だけ表示)
- カードは `image` で別カードの絵を流用できる。受動文6文は既存の絵で取り込み済み(助詞レベルは今すぐ使える)。`pairs`(配列)で対の絵を複数指定可
- 選択モードは同じ絵を使うカードを選択肢に並べない(受動/能動で答えが2つにならないように)
- **残作業**:
  - [ ] Codex で `data/pending/scene-levels.json` の30枚を生成(ガイド §11.1)。意味12・語順8・使役4・関係節6
  - [ ] `node scripts/optimize-images.mjs images/scene` → `node scripts/merge-pending.mjs` → Mac で `node scripts/generate-audio.mjs`(受動文6件 + 新30件)
  - [ ] バージョンを上げてプッシュ。iPad で「文のレベル」ごとに確認
  - [ ] 関係節の絵は「誰が転んだか」が一目で分かるか特に確認。分かりにくければプロンプトを直して再生成

## 完了: 課題構成の再整理(v28)

- ホーム: 「話す / 選ぶ / つなぐ」+ 7つの課題プリセット。設定は基本(総問題数・難易度)+詳細(折りたたみ・要約行)。制限時間はスライダー。情景説明は3段階評価
- [ ] iPad 実機で確認、プリセット初期値(`app.js` の `TASK_PRESETS`)を ST の要望で調整

## 保留(次の候補)

- 名詞カードの増量(スタッフから追加語リストを集める)。`data/pending/` に置けば `merge-pending.mjs` で取り込める
- 追加音声(動作・情景)の実機での通し試聴。違和感がある語は `scripts/generate-audio.mjs` の個別調整で再生成
