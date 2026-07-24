# eval-fixtures — AI読み取り精度evalの評価データセット

`src/eval/accuracy.ts`（指標）を実画像で回すためのラベル付きデータ置き場。
**画像はここに置くが、本番では画像を保存しない原則（CLAUDE.md ルール7）とは無関係**
（これは開発用の評価データであり、ユーザー撮影画像ではない）。

## 実行

```
pnpm --filter api eval
```

- 鍵は `apps/api/.dev.vars` の `GEMINI_API_KEY`（`CLOUDFLARE_AI_GATEWAY_URL` 未設定なら
  Google AI Studio 直エンドポイントで呼ぶ）。モデルは `GEMINI_RIVER_MODEL` / `GEMINI_HAND_MODEL`
  で上書き可（既定は wrangler.toml と同じ）。`GEMINI_CODE_EXECUTION=1` で Agentic Vision の A/B。
- レポートはコンソールに加え `eval-fixtures/last-report.txt`（git 管理外）にも書く。
- 実 Gemini を呼ぶため CI では回さない（通常の `pnpm test` からは分離済み）。
- 出力: 正解ラベル済みターゲットの3指標レポート（コンソール）＋各 case に `truth.draft.json`。

## 構成

```
eval-fixtures/
└── cases/<caseId>/
    ├── source.png        # 元画像（全卓スクショ可）
    ├── crops/<player>.png # プロンプトに投げる1人分の切り出し（正立済み）
    ├── truth.json        # 正解ラベル（人間が確認済みのもののみ）
    └── truth.draft.json  # (生成物・git管理外) Gemini の読みドラフト
```

- ターゲットの画像は `image` で明示できる。省略時は「ターゲットが1つなら `source.png`、
  複数なら `crops/<player>.png`」。
- 切り出しは**タイト**（河1つ＋端に隣家の断片が少し）にしている。本番の前処理
  （river-layout の4分割）は「半分ずつ」の大胆な切り出しなので条件が違う。
  ここではまず**プロンプト/モデルの読み取り能力そのもの**を測る。本番同等の
  半分割入力での eval は次段（riverLayout を通すモードを足す）。

## truth.json の書き方

1ファイルに、その画像から評価したい読み取り単位（河1方向 / 手牌1人分）を並べる。

```jsonc
{
  "source": "どこから取った画像か（メモ）",
  "targets": [
    {
      "kind": "river",            // "river" | "hand"
      "player": "bottom",         // 画像内の位置: bottom / right / top / left（全卓画像の場合）
      "discards": ["1z", "9p", "*5s", "?", "0p"]
      //  牌記法: 1m-9m / 1p-9p / 1s-9s / 1z-7z(東南西北白發中) / 0m,0p,0s=赤5
      //  接頭辞 * = リーチ宣言牌（横向き）
      //  ?      = 人間でも判別不能（AI には tile:null が正解）
    },
    {
      "kind": "hand",
      "player": "bottom",
      "hand": ["1m", "2m", "3m"],
      "melds": [
        { "type": "pon", "tiles": ["5z", "5z", "5z"], "from": "left" }
        // type: pon / chi / kan_open / kan_added / kan_closed
        // from: カメラ相対 bottom/right/top/left（kan_closed は null）
      ]
    }
  ]
}
```

## 正解ラベルの作り方（推奨ワークフロー）

1. 画像を置き、`truth.json` は `targets` を空のまま作ってよい
2. eval runner を「ドラフトモード」で実行 → Gemini の読み取り結果が `truth.draft.json` に出る
3. **人間がドラフトを目視で修正**（ここが正解の品質を決める。鵜呑みにしない）
4. 修正済みの内容を `truth.json` に昇格 → 以後この case が回帰の基準になる

注意:
- 正解は「何の牌か」だけ（数値 confidence は廃止・[決定] 2026-07-24。AI 側の不確実性は tile: null の白旗のみ）
- 中継スクショは開発初期のブートストラップ用。**本番の入力分布はスマホ実写**なので、
  最終的な精度判断は実卓を撮った写真の case で行うこと

## 切り出しで得た観察（要実機検証の材料）

case 01/02 の正立化で必要だった回転は **left=時計回り270°（=反時計90°）/ right=時計回り90°** だった。
`river-layout.ts` の現仕様（left=90 / right=270、⚠️要実機検証マーク付き）とは**逆**。
実卓の捨て牌の向き（牌の天が卓中心を向く）が前提なら本番も同じはず。実写検証で確定させ、
確定したら river-layout と設計ドキュメントを更新すること。
