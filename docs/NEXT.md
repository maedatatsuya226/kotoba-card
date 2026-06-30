# NEXT — 次のセッションで再開するための引き継ぎ

最終更新: 2026-06-30

このファイルは別のPCや次のセッションで作業を再開する時、まず読むためのもの。完了したら該当項目を削除する。

## 直近のセッション状況

- アプリは Cloudflare Pages にデプロイ済み: https://kotoba-card.pages.dev/
- リポジトリ: https://github.com/maedatatsuya226/kotoba-card
- ブランチ: `main`（直接コミット運用）
- PWA化済み、iPad のホーム画面追加でオフライン動作可能

## 進行中：音声voice選定の精緻化

### 背景
ユーザーは iPad で **Otoya（拡張）** をダウンロード済み。さらに **Siri と同等品質の音声**（iOS の O-ren / Hattori 等）を使いたい意向。

現在の `app.js` の `pickBestVoice()` は「最初に見つかった Enhanced 系」を選ぶだけなので、複数 Enhanced 入りの環境では意図しない voice が選ばれる可能性がある。

### 次にやること

#### 1. iPad 実機で利用可能な voice 一覧を確認
iPad の Safari で開発者ツール、もしくは下記をブックマークレットなどで実行：

```js
speechSynthesis.getVoices().filter(v => v.lang.startsWith('ja')).map(v => v.name)
```

期待される候補：`Kyoko`, `Kyoko (Enhanced)`, `Otoya`, `Otoya (Enhanced)`, `O-ren`, `Hattori`, `Hattori (Enhanced)` 等

#### 2. `pickBestVoice()` の優先順位を更新

新しい優先順位（案）：

```
1. O-ren                         （Siri相当 Neural、最高品質）
2. Hattori (Enhanced)            （Siri同系統男性、最高品質）
3. Otoya (Enhanced)              （旧世代Enhanced男性、ユーザーがDL済）
4. Kyoko (Enhanced)
5. 任意の Enhanced/Premium
6. 任意の Online/Natural/Neural
7. Kyoko / Otoya / Hattori 標準
8. localService の任意 ja voice
```

実装箇所: `app.js` の `pickBestVoice(voices)` 関数

#### 3. （オプション）設定画面に音声セレクタを追加
- 「音声: ◯自動 / ◯O-ren / ◯Otoya / ◯Kyoko / ...」のラジオボタン
- 利用可能な ja voice を動的に列挙
- localStorage で記憶
- 工数 20-30分

### 検討途中のメモ

- Siri本体の音声は Web Speech API から触れない（OS制限）
- O-ren は Apple Neural TTS で Siri 相当の品質
- 患者ごとに男女voice切替したいニーズはあるかも → UI セレクタが将来便利
- 音声を変えるたびに sw.js の CACHE_NAME は **上げる必要なし**（voice は端末側）

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
