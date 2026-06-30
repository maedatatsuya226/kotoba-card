# ST絵カード呼称トレーニングアプリ 仕様書

## 1. プロジェクト概要

言語聴覚士(ST)による呼称訓練を支援するWebアプリ。患者に絵を見せて呼称してもらい、答えを文字と音声で提示する。

- **対象ユーザー**: ST、リハ患者(STの操作下で使用)
- **利用環境**: 院内のPC・タブレット(ブラウザ)
- **配信形態**: Cloudflare Pages(GitHub連携)
- **患者情報の入力・保存はなし**(セッション完結型)

## 2. 機能要件

### 2.1 基本機能
- カテゴリ複数選択(コア6 + 拡張7、計13)
- 問題数のスライダー設定(5〜50問、5問刻み)
- ランダム出題ON/OFF
- 絵の表示 → 「答えを見る」ボタン → 文字+音声(TTS) → 「次へ」
- セッション終了画面(「お疲れさまでした」+ 再挑戦ボタン)

### 2.2 非機能要件
- レスポンシブ対応(タブレット・PC)
- オフライン動作は不要(Cloudflareから常時配信)
- 認証は不要(URL直アクセス)

## 3. 画面構成

### 3.1 スタート画面
- アプリタイトル
- 「はじめる」ボタン

### 3.2 設定画面
- カテゴリ複数選択チェックボックス
- **親密度フィルタ(複数選択)**: 高(やさしい) / 中(ふつう) / 低(むずかしい)
  - デフォルトは全選択
  - ST業界では「親密度」が標準用語、UI上は「やさしい/ふつう/むずかしい」と併記
- 問題数スライダー(5〜50、5刻み)
- ランダム出題トグル
- 「スタート」ボタン
- 設定変更時に「該当する問題数: N語」をリアルタイム表示

### 3.3 出題画面
- 進捗表示(例: 3 / 10)
- 絵の表示エリア
- 「答えを見る」ボタン
- 答えの表示エリア(文字)+ 音声自動再生(speechSynthesis、`ja-JP`)
- 「もう一度再生」ボタン
- 「次へ」ボタン

### 3.4 終了画面
- 「お疲れさまでした」メッセージ
- 「もう一度」ボタン(設定画面に戻る)
- 「ホームに戻る」ボタン

## 4. データ構造

### 4.1 カードデータ(`words.json`)
```json
[
  {
    "id": "food_apple",
    "category": "food",
    "japanese_label": "りんご",
    "reading": "りんご",
    "familiarity": "high",
    "english_prompt": "a single red apple"
  }
]
```

**フィールド説明**
- `id`: 一意のID(`[category]_[name]`形式)
- `category`: カテゴリID(下記 categories.json と紐付け)
- `japanese_label`: 画面表示用の正答ラベル
- `reading`: TTS読み上げ用のかな表記(`speechSynthesis` に渡す)
- `familiarity`: 親密度 `"high" | "mid" | "low"`
  - TLPA等のST臨床基準に準拠
  - high: 5歳までに獲得・毎日遭遇する基本語(94語)
  - mid: 6-10歳で獲得・社会生活で使用する語(42語)
  - low: 11歳以降獲得・特定文脈の語(6語)
- `english_prompt`: GPT Image 2.0 への画像生成プロンプト用

### 4.2 カテゴリ定義(`categories.json`)
```json
[
  { "id": "food",     "label": "食べ物",     "core": true },
  { "id": "animal",   "label": "動物",       "core": true },
  { "id": "vehicle",  "label": "乗り物",     "core": true },
  { "id": "daily",    "label": "日用品",     "core": true },
  { "id": "clothing", "label": "衣類",       "core": true },
  { "id": "body",     "label": "身体部位",   "core": true },
  { "id": "furniture","label": "家具・家電", "core": false },
  { "id": "tool",     "label": "道具",       "core": false },
  { "id": "nature",   "label": "自然",       "core": false },
  { "id": "job",      "label": "職業",       "core": false },
  { "id": "music",    "label": "楽器",       "core": false },
  { "id": "stationery","label": "文具",      "core": false },
  { "id": "building", "label": "建物・場所", "core": false }
]
```

## 5. 技術スタック

| 項目 | 採用技術 |
|------|---------|
| フロントエンド | HTML/CSS/JS(必要に応じてVanilla JSまたは軽量React) |
| 音声合成 | Web Speech API(`speechSynthesis`、`ja-JP`) |
| 画像生成 | GPT Image 2.0(事前生成、リポジトリに同梱) |
| ホスティング | Cloudflare Pages |
| ソース管理 | GitHub |

### 5.1 TTS実装メモ
```javascript
function speak(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;  // やや遅め
  speechSynthesis.speak(utterance);
}
```
- 初回ロード時に `speechSynthesis.getVoices()` で音声を取得(非同期)
- 日本語音声が複数ある場合は選択肢を設定で出すことも検討

## 6. ディレクトリ構成案

```
st-naming-app/
├── index.html
├── style.css
├── app.js
├── data/
│   ├── cards.json
│   └── categories.json
├── images/
│   ├── food/
│   │   ├── apple.png
│   │   └── ...
│   ├── animal/
│   └── ...
└── README.md
```

## 7. GPT Image 2.0 プロンプト雛形

### 7.1 基本ルール
- **白背景**(視覚的ノイズを除く)
- **単一オブジェクトを中央配置**
- **フラットイラスト風**(写真ではなく)
- **明瞭な輪郭・柔らかい色彩**
- **教育用素材であることを明示**
- **影や反射、装飾的背景を避ける**

### 7.2 共通プロンプト(日本語版)

```
[対象物] を、純白の背景に1つだけ中央配置したフラットイラストとして描いてください。
- スタイル: シンプルで明瞭、子どもから高齢者まで認識しやすい教育用イラスト
- 色彩: 柔らかく自然な色合い、過度な装飾なし
- 構図: 対象物のみ、影や背景要素は描かない
- 用途: 言語聴覚療法の呼称訓練用素材
- アスペクト比: 1:1
```

### 7.3 共通プロンプト(英語版・推奨)

英語のほうが意図通りに生成されやすい傾向があります。

```
A single [object] centered on a pure white background, flat illustration style.
- Style: simple, clean, educational illustration suitable for speech therapy
- Colors: soft, natural, no excessive decoration
- Composition: only the object itself, no shadows, no background elements, no text
- Outline: clear and recognizable
- Aspect ratio: 1:1
```

### 7.4 カテゴリ別の使用例

#### 食べ物
- `apple` → A single red apple centered on a pure white background, flat illustration style, ...
- `banana` / `carrot` / `bread` / `rice ball (onigiri)`

#### 動物
- `dog` / `cat` / `elephant` / `rabbit` / `bird`

#### 乗り物
- `car` / `bicycle` / `train` / `airplane` / `bus`

#### 日用品
- `toothbrush` / `cup` / `umbrella` / `clock` / `key`

#### 衣類
- `T-shirt` / `pants` / `socks` / `hat` / `shoes`

#### 身体部位
- `hand` / `eye` / `ear` / `nose` / `mouth`
- ※身体部位は単体だと不自然なので「a stylized illustration of a human ear, isolated, ...」のように補足

### 7.5 生成後の処理
- ファイル名は英語小文字+アンダースコア(例: `apple.png`)
- リサイズ: 長辺512〜768pxに統一
- フォーマット: PNG(透過は不要、白背景のまま)
- 視認性チェック: 各画像を一度見て、呼称しやすいか確認

### 7.6 命名規則
- 画像ファイル名: `[category]/[english_id].png` 
- 例: `images/food/apple.png`
- `cards.json` の `id` と一致させる(`food_apple`)

## 8. 実装の進め方(推奨フロー)

1. **画像生成**(最も時間がかかる) - GPT Image 2.0で各カテゴリ10〜15枚程度生成
2. **`cards.json` / `categories.json` 作成**
3. **HTML骨組み + ルーティング(画面切替)**
4. **設定画面のUI実装**(チェックボックス、スライダー)
5. **出題ロジック実装**(カテゴリフィルタ → シャッフル → 切り出し)
6. **TTS実装**
7. **スタイリング**
8. **Cloudflare Pagesへデプロイ**

## 9. 今後の拡張アイデア(MVP後)

- 難易度タグ(高・中・低頻度語)
- 動詞・形容詞カードの追加
- 文単位の呼称(短文音読)
- カスタム単語の追加機能
- 結果記録機能(必要なら、患者情報なしの匿名集計)

---

## 付録: 参考メモ

- 失語症リハの絵カード商用品(エスコアール社「失語症練習絵カード」など)を参考にカテゴリ構成
- 視覚刺激は背景ノイズが少ないほど呼称しやすい(白背景の根拠)
- Web Speech APIはブラウザ依存で、Chrome/Edge/Safariで動作確認推奨
