# ST絵カード呼称トレーニング

言語聴覚士(ST)の呼称訓練を支援する Web アプリ。患者に絵を見せて呼称してもらい、答えを文字と音声(Web Speech API)で提示します。

- セッション完結型（患者情報の保存はなし）
- Vanilla JS / ビルド不要
- Cloudflare Pages で配信

## ディレクトリ構成

```
/
├── index.html
├── style.css
├── app.js
├── data/
│   ├── cards.json      # 出題語データ
│   └── categories.json # カテゴリ定義
└── images/
    └── [category]/[id].png
```

## ローカルでの動作確認

ビルドステップはありません。任意の静的サーバで配信すれば動きます。

```sh
# Node 同梱の serve（推奨）
npx serve .

# または Python が入っていれば
python -m http.server 8000
```

ブラウザで `http://localhost:3000`（または 8000）を開いてください。Chrome / Edge / Safari で動作確認推奨です。Web Speech API の `ja-JP` 音声がインストールされている必要があります。

## Cloudflare Pages へのデプロイ

GitHub 連携で運用します。

1. このディレクトリを新規 GitHub リポジトリに push
2. Cloudflare ダッシュボード → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
3. リポジトリを選択
4. ビルド設定:
   - **Framework preset**: None
   - **Build command**: 空欄
   - **Build output directory**: `/`
5. **Save and Deploy**

以降は `main` ブランチへの push で自動デプロイされます。

## データの編集

- 出題語の追加・編集: `data/cards.json` を編集（`id` は `[category]_[name]` 形式、画像ファイルパスと一致させる）
- カテゴリの追加: `data/categories.json` に項目追加 + 画像ディレクトリ作成
- 親密度 `familiarity`: `"high"`(やさしい) / `"mid"`(ふつう) / `"low"`(むずかしい)

詳細は `ST絵カード呼称アプリ_仕様書.md` を参照。
