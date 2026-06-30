# 絵カード画像生成 指示書(Codexアプリ向け)

Codexアプリ(Web/デスクトップ)の内蔵画像生成機能(gpt-image-2)を使って、`words.json` に基づいた絵カード画像を生成するための指示書です。

---

## 1. 前提

- ChatGPT Plus/Pro 等のサブスクリプション契約が必要
- Codexアプリの内蔵画像生成を使用(API課金は発生しない)
- ただし**Codex使用枠を3-5倍速く消費**する点に注意
- 142枚を一度に生成すると枠を圧迫するため、**カテゴリ単位で分割実行**を推奨

---

## 2. 事前準備

### 2.1 プロジェクト構造
リポジトリ(またはCodexの作業ディレクトリ)に以下を配置:
```
project-root/
├── words.json        ← 生成対象リスト
└── images/           ← 出力先(Codexが自動作成)
```

### 2.2 Codexで開く
- Codexアプリでこのリポジトリを開く
- `words.json` がCodexから参照できる状態にする

---

## 3. 画像生成の共通ルール

### プロンプトテンプレート(画像生成時に Codex に守らせるもの)

```
{english_prompt}, centered on a pure white background, flat illustration style.
Style: simple, clean, educational illustration suitable for speech therapy materials.
Colors: soft, natural, no excessive decoration.
Composition: only the object itself, no shadows, no background elements, no text, no logos.
Outline: clear and recognizable.
Aspect ratio: 1:1.
```

### 出力規則
- 保存先: `images/[category]/[id].png`
- サイズ: 1024x1024(必要なら後で軽量化)
- フォーマット: PNG
- 既存ファイルがあればスキップ(再生成は明示指示時のみ)

---

## 4. Codexに渡す指示プロンプト(コピペ用)

### 4.1 カテゴリ単位の実行(推奨)

```
このリポジトリの words.json を読み込んで、category が "food" のエントリすべての絵カード画像を gpt-image-2 で生成してください。

各画像に共通で適用するプロンプトテンプレート:
---
{english_prompt}, centered on a pure white background, flat illustration style.
Style: simple, clean, educational illustration suitable for speech therapy materials.
Colors: soft, natural, no excessive decoration.
Composition: only the object itself, no shadows, no background elements, no text, no logos.
Outline: clear and recognizable.
Aspect ratio: 1:1.
---

ルール:
- 各エントリの english_prompt をテンプレートの {english_prompt} に差し込んで生成
- 保存先は images/[category]/[id].png(例: images/food/food_apple.png)
- 既に同名ファイルがあればスキップ
- 1枚生成するたびに「[N/M] 完了: id」とログ出力
- すべて完了したら、生成・スキップ・失敗の件数を報告

明示的に gpt-image-2 を指定して生成してください(デフォルトの低品質モデルにフォールバックさせないこと)。
```

実行するカテゴリを変えるときは、`"food"` を以下に差し替え:
`animal` / `vehicle` / `daily` / `clothing` / `body` / `furniture` / `tool` / `nature` / `job` / `music` / `stationery` / `building`

### 4.2 一部だけ生成(動作確認)

```
words.json の中で id が "food_apple", "food_banana", "food_orange" の3件だけ
gpt-image-2 で画像生成してください。

プロンプトテンプレートと出力規則は通常通り(images/food/[id].png)。

スタイルの統一性が確認したいので、3枚一気に生成して並べて見せてください。
```

### 4.3 失敗・気に入らない画像の再生成

```
images/animal/animal_giraffe.png を再生成してください。
前回のものは首が短く認識しにくかったので、より首が長く特徴が明確な構図でお願いします。
プロンプトテンプレートは通常通り適用、出力先は同じパスで上書きしてください。
```

---

## 5. 推奨実行順序

```
1. 動作確認: 4.2 で3枚生成 → スタイル感を確認
2. 違和感があれば 共通プロンプトテンプレート を微調整して再実行
3. 問題なければ 4.1 でカテゴリ単位に1つずつ実行
   推奨順序: food → animal → vehicle → daily → clothing
            → body → furniture → tool → nature
            → job → music → stationery → building
4. 各カテゴリ完了時に使用枠の残量を確認(/status 等)
5. すべて完了したら全体を目視チェック → 4.3 で個別再生成
```

---

## 6. 使用枠の節約Tips(ChatGPT Plus想定)

### 6.1 Plus制限の実態
- 5時間ウィンドウ: GPT-5.5で15-80メッセージ
- 画像生成は3-5倍速く消費 → 実質1ウィンドウで**3-16枚**が安全圏
- 週次キャップあり(Plusユーザーは2-3日のヘビー使用で到達という報告多数)
- 142枚は1週間では完了不可能 → **3週間スパンで計画**

### 6.2 守るべきルール
- **1日1カテゴリ**(10-13枚)を上限とする
- 同日に複数カテゴリは絶対NG(5時間枠を浸食する)
- 動作確認は最初の3-5枚で済ませる(全カテゴリで試さない)
- スタイルが固まる前に大量生成しない(やり直しで倍消費)
- 画像生成中はテキスト処理に `gpt-5.4-mini` 等の軽量モデルを併用

---

## 7. 分割実行スケジュール(Plus向け・3週間プラン)

### Week 1: コアカテゴリ前半(計49枚)
| Day | カテゴリ | 枚数 | 累計 |
|-----|---------|------|------|
| Day 1 | food | 13 | 13 |
| Day 2 | animal | 12 | 25 |
| Day 3 | vehicle | 12 | 37 |
| Day 4 | daily | 12 | 49 |
| Day 5-7 | (枠回復・週末休止) | - | 49 |

### Week 2: コア後半 + 拡張前半(計43枚)
| Day | カテゴリ | 枚数 | 累計 |
|-----|---------|------|------|
| Day 1 | clothing | 10 | 59 |
| Day 2 | body | 12 | 71 |
| Day 3 | furniture | 11 | 82 |
| Day 4 | tool | 10 | 92 |
| Day 5-7 | (枠回復・週末休止) | - | 92 |

### Week 3: 拡張後半(計50枚)
| Day | カテゴリ | 枚数 | 累計 |
|-----|---------|------|------|
| Day 1 | nature | 12 | 104 |
| Day 2 | job | 10 | 114 |
| Day 3 | music + stationery | 16 | 130 |
| Day 4 | building | 12 | 142 |
| Day 5-7 | (再生成・微調整) | - | 142 |

### 7.1 進捗管理チェックリスト

**Week 1**
- [ ] food (13枚)
- [ ] animal (12枚)
- [ ] vehicle (12枚)
- [ ] daily (12枚)

**Week 2**
- [ ] clothing (10枚)
- [ ] body (12枚)
- [ ] furniture (11枚)
- [ ] tool (10枚)

**Week 3**
- [ ] nature (12枚)
- [ ] job (10枚)
- [ ] music (8枚) + stationery (8枚)
- [ ] building (12枚)
- [ ] 全体目視チェック
- [ ] 再生成対象の特定・実行

### 7.2 毎日のフロー
1. Codexアプリを開く
2. `/status` で残量確認
3. 当日カテゴリの指示プロンプト(セクション4.1)を実行
4. 完了後、生成結果を目視確認
5. 問題画像があれば IDをメモ(再生成は Week 3 にまとめて)

### 7.3 もし途中で詰まったら
- **週次キャップ到達(「3日13時間待ち」メッセージ)** → 翌週まで停止、スケジュール後ろ倒し
- **スタイルがブレてきた** → プロンプトテンプレートを見直し、新しい指示で残りを統一
- **Plusでも厳しい** → 残り分だけAPI経由に切り替え(従量課金、約$0.04/枚)

---

## 8. トラブルシューティング

### 8.1 「品質が低い画像が生成される」
→ プロンプトで明示的に `gpt-image-2` を指定する。指定しないとデフォルトモデル(低品質)にフォールバックすることがある。

### 8.2 「画像に文字が混入する」
→ プロンプトテンプレートの `no text, no logos` を強調する。それでも入る場合は「絶対に文字を入れないこと」を追記。

### 8.3 「身体部位カテゴリが不自然」
→ words.json の english_prompt に既に "stylized illustration ... isolated" を含めてあるが、それでも不自然なら以下の調整を検討:
- "simple anatomical diagram style" を追加
- "as found in children's anatomy textbooks" を追加

### 8.4 「使用枠を使い切った」
→ ChatGPT Plus → Pro へのプランアップ、または翌日の枠回復を待つ。
→ もしくは OPENAI_API_KEY を設定してAPIルートに切り替え(従量課金、約$0.04/枚)。

---

## 9. 生成後のチェックリスト

- [ ] すべてのカテゴリの画像が生成されているか(`ls images/` で確認)
- [ ] 各画像に文字が混入していないか
- [ ] 背景は白か(透過ではないか確認)
- [ ] 単一オブジェクトが中央に配置されているか
- [ ] スタイルがカテゴリ間で大きくばらついていないか
- [ ] 呼称対象として認識しやすいか(初見で何の絵か即答できるか)

問題のある画像はIDをメモして、4.3 のプロンプトで個別再生成。
