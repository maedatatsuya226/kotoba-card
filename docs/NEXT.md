# NEXT — 次のセッションで再開するための引き継ぎ

最終更新: 2026-06-30

このファイルは別のPCや次のセッションで作業を再開する時、まず読むためのもの。完了したら該当項目を削除する。

## 直近のセッション状況

- アプリは Cloudflare Pages にデプロイ済み: https://kotoba-card.pages.dev/
- リポジトリ: https://github.com/maedatatsuya226/kotoba-card
- ブランチ: `main`（直接コミット運用）
- PWA化済み、iPad のホーム画面追加でオフライン動作可能

## 直近完了：音声を VOICEVOX 事前生成 wav に切替

iPad voice 精緻化を検討する中で、AivisSpeech 試作 → Anneli の権利問題発覚 → VOICEVOX に着地。`No.7 アナウンス`(styleId=30) で142語の wav を事前生成して `audio/[category]/[id].wav` に同梱、Web Speech はフォールバックとして残存。詳細は `docs/DECISIONS.md` §2。

このセッションで追加されたもの：
- `audio/` 配下 142件の wav（4.9MB、git管理）
- `scripts/generate-audio.mjs` 本生成スクリプト（差分のみ / `--force` で全件再生成）
- `scripts/audition.mjs` 試聴用（git管理、`audition_out/` は gitignore）
- `app.js` の `speak()` を wav 再生 + Web Speech フォールバック化
- `sw.js` の `CACHE_NAME=v2`、audio をプリキャッシュに追加

### 残作業

- [ ] **コミット & push**（手動でレビューしてから）
- [ ] **iPad 実機（院内）で確認**: PWA キャッシュが更新されるか、オフライン再生できるか
- [ ] ST に試聴してもらい、`No.7 アナウンス` で違和感のある単語があれば洗い出し
  - 該当語があれば VOICEVOX GUI でアクセント手動補正 → 該当 wav を差替え（部分再生成 or `--force`）

### 将来の小タスク（必要になれば）

- 設定画面に話者セレクタ追加（事前生成済みの複数話者を切替可能にする）。今は単一話者運用。
- `pickBestVoice()` は wav が落ちた時のフォールバック専用なので、必要なら O-ren/Hattori 優先に微調整可能

## それ以外の保留事項

`docs/ROADMAP.md` に整理済み：
- 音声品質向上（VOICEVOX / OpenAI TTS）
- デザイン強化（3ティア）
- 機能追加（結果記録・動詞カード等）

## 別PCでの再開手順

```sh
# 1. クローン
git clone https://github.com/maedatatsuya226/kotoba-card.git
cd kotoba-card

# 2. ローカルプレビュー（任意）
npx serve .   # or python -m http.server 8000

# 3. 編集してコミット & プッシュ
git add .
git commit -m "..."
git push
```

## 重要：このセッションで決まったこと

詳細は `docs/DECISIONS.md` を参照。要約：

- Vanilla JS で実装、ビルドステップなし
- 画像は 512px PNG palette mode（93%圧縮済、平均55KB）
- ヒント機能はモーラ単位でタップ開示
- PWA化済（Service Worker キャッシュ150アセット）
- デザインは「高齢患者考慮の控えめ」方針
