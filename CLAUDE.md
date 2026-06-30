# CLAUDE.md

このファイルは Claude Code が新規セッション開始時に自動参照する規約・前提です。

## プロジェクト概要

ST絵カード呼称トレーニング — 言語聴覚士(ST)が失語症等の患者に対して呼称訓練を行うための Web アプリ。患者に絵カードを見せて呼称してもらい、ヒント表示・答え表示・音声合成で訓練を支援する。

- 想定環境: **iPad Safari**（院内で ST が患者に見せる）
- 配信: Cloudflare Pages（GitHub `main` ブランチ自動デプロイ）
- 患者情報: 保存しない（セッション完結型）

## 技術スタック

| レイヤ | 採用 |
|--------|------|
| フロントエンド | **Vanilla JS（ビルド不要）** |
| 音声 | Web Speech API (`ja-JP`, iPadのKyoko Enhanced優先) |
| 画像 | PNG 事前同梱（GPT Image 2.0 で生成済、sharp で 512px に最適化済） |
| オフライン化 | Service Worker（PWA、ホーム画面追加で完全オフライン動作） |
| ホスティング | Cloudflare Pages |
| データ | 静的 JSON（`data/cards.json`, `data/categories.json`） |

## ディレクトリ構成

```
/
├── index.html              # 4画面を1ファイルで切替
├── style.css               # CSS変数ベースのデザイン
├── app.js                  # 状態管理・ルーティング・TTS・SW登録
├── sw.js                   # Service Worker（PWAオフライン化）
├── manifest.json           # PWAマニフェスト
├── data/
│   ├── cards.json          # 全142語のカードデータ
│   └── categories.json     # 13カテゴリ定義
├── images/
│   ├── app/                # アプリアイコン
│   └── [category]/[id].png # カード画像（katakana/hiraganaどちらでも id は英数字）
├── docs/
│   ├── DECISIONS.md        # 設計判断ログ（なぜそうしたか）
│   └── ROADMAP.md          # 将来の検討事項
├── ST絵カード呼称アプリ_仕様書.md
└── codex_image_generation_guide.md
```

## 開発ルール

### 必須

- **ビルドステップを追加しない**（Cloudflare Pages の「Build command 空欄」を維持）
- **新しい依存パッケージを安易に追加しない**（Vanilla JS で書ける範囲で書く）
- **画像追加時は必ず最適化**（512px以下、80KB以下目安、PNG palette）
- **拗音(ゃゅょ)・促音(っ)を含む文字処理は2文字1ユニットで扱う**（ヒント機能等）
- **Service Worker を更新したら `CACHE_NAME` のバージョン番号を上げる**（`v1` → `v2`）

### 避ける

- React / Vue / Svelte 等のフレームワーク導入（仕様書通り、シンプルさ優先）
- TypeScript 化（過剰、JS の `'use strict'` で十分）
- 派手なアニメーション・装飾（高齢患者の集中を妨げない）
- 患者情報の保存・送信（プライバシー・院内ポリシー）

## 主要機能の場所

| 機能 | 場所 |
|------|------|
| 画面切替 | `app.js` `showScreen()` |
| カテゴリ・親密度・問題数フィルタ | `app.js` `getFilteredCards()` |
| ヒント生成（モーラ単位分割） | `app.js` `getCharUnits()` / `showHint()` |
| Web Speech voice 選定 | `app.js` `pickBestVoice()` |
| iOS Safari TTS ウォームアップ | `app.js` `warmUpSpeech()` |
| 画像先読み | `app.js` `preloadUpcomingImages()` |
| SW キャッシュ戦略 | `sw.js`（cache-first + network fallback） |

## ローカル動作確認

```sh
npx serve .   # http://localhost:3000
```

または `.claude/launch.json` の `static` 設定で preview MCP 経由。

## デプロイ

```sh
git push origin main
# → Cloudflare Pages が自動再デプロイ（30秒〜1分）
```

リポジトリ: https://github.com/maedatatsuya226/kotoba-card

## 判断ログを読む

セッション開始時の参照順：

1. **`docs/NEXT.md`** — 前回のセッションで進行中だった作業（存在すれば最優先で確認）
2. **`docs/DECISIONS.md`** — なぜこの実装になっているか（判断ログ）
3. **`docs/ROADMAP.md`** — 他に検討した選択肢、将来やる候補

これらに書いてある判断を覆す提案は、理由を明示してから行うこと。NEXT.md の項目が完了したら、該当部分を削除してから次の作業に進む。
