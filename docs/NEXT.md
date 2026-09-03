# NEXT — 次のセッションで再開するための引き継ぎ

最終更新: 2026-09-03

このファイルは別のPCや次のセッションで作業を再開する時、まず読むためのもの。完了したら該当項目を削除する。

## 進行中: 動作絵(動詞)・情景絵の追加

スタッフFB(2026-09)への対応。アプリ側の準備は完了、**画像の生成待ち**。

### できていること

- 生成リスト: `data/pending/action.json`(動詞20語)、`data/pending/scene.json`(情景14枚、うち4組は主語/目的語を入れ替えた対)
- 画像生成の指示プロンプト: `codex_image_generation_guide.md` §10(コピペ用)
- スクリプト: `scripts/optimize-images.mjs`(512px・パレットPNG化)、`scripts/merge-pending.mjs`(画像ができたカードだけ cards.json / categories.json に取り込む)、`scripts/generate-audio.mjs`(`tts_text` 対応済み、情景文は漢字で合成)
- アプリ: `type: "scene"` のカードは呼称モードでヒントを出さず模範文として表示、長文用の文字サイズ、選択モードで `pair` の絵を必ず選択肢に含める(= 短文理解課題になる)

### 残作業

- [ ] Codex アプリで動作絵20枚を生成(ガイド §10.1)→ 目視チェック
- [ ] 情景絵14枚を生成(§10.2)→ 対の2枚を並べて「誰が誰に」だけが違うか確認
- [ ] `npm install --no-save sharp` → `node scripts/optimize-images.mjs images/action images/scene`
- [ ] `node scripts/merge-pending.mjs` → `node scripts/generate-audio.mjs`(VOICEVOX 起動中)
- [ ] `sw.js` の `CACHE_NAME` と `app.js` の `APP_VERSION` を上げてコミット・プッシュ
- [ ] iPad で確認: 呼称(動作/情景)、選択で情景カテゴリのみ→対の絵が選択肢に出るか
- [ ] STに試してもらい、分かりにくい絵は §4.3 の要領で個別再生成

### 保留(次の候補)

- 名詞カードの増量(スタッフから追加語リストを集める)。仕組みは既存のまま使える
- 情景絵の「模範文を隠しておいて、患者が説明した後に表示」など出題の細かい流れは、STの使用感を聞いてから調整
