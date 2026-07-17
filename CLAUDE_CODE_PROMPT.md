# Claude Code (Fable 5) 初回セッション用プロンプト

## 使い方
1. 新しいGitHubリポジトリを作成（例: `komemocchi-loyalty`）
2. ローカルにclone
3. リポジトリ直下に `SPEC.md` を配置
4. そのディレクトリで Claude Code を起動
5. 以下のプロンプトを最初のメッセージとして送る

---

## セッション1：Phase 1実装用プロンプト

```
このリポジトリの SPEC.md を読み込んでから作業を始めてください。

今回のセッションでは、SPEC.md の Phase 1（セクション4）だけを実装します。
Phase 2 以降には絶対に着手しないでください。次のセッションで別途指示します。

【実装内容】
1. Next.js 15 (App Router) + TypeScript のプロジェクトを初期化
   - `npx create-next-app@latest . --typescript --app --tailwind --eslint --no-src-dir`
   - Node.js 20系を前提

2. 必要な依存関係をインストール
   - @supabase/supabase-js
   - vitest, @vitest/coverage-v8（開発用）
   - zod（バリデーション用）

3. 以下のファイルを作成
   - app/api/shopify/webhook/route.ts
   - lib/shopify/verify.ts
   - lib/supabase/server.ts
   - lib/logic/count-bread.ts
   - lib/logic/update-customer.ts
   - types/shopify.ts

4. 実装ロジック（SPEC.md 4.2 参照）
   - HMAC-SHA256でX-Shopify-Hmac-Sha256ヘッダーを検証
   - orders_processed テーブルで冪等性を担保
   - sku_bread_map と line_items を突合してパン個数集計
   - customers テーブルを UPSERT で更新
   - マイルストーン到達時はコンソールログ出力のみ（クーポン発行は Phase 4）

5. Vitest でユニットテスト作成
   - SPEC.md 4.5 のテストケース全部
   - HMAC検証、個数計算、冪等性を最低限カバー

6. .env.example を作成し、SPEC.md 3節の環境変数を列挙

7. README.md に以下を記載
   - プロジェクト概要（1段落）
   - 開発サーバー起動手順
   - Supabaseテーブル作成手順（SPEC.md 2節のSQLをリンク）
   - テスト実行コマンド
   - Shopify webhookのローカル検証方法（ngrok等）

【重要な原則】
- SPEC.md の記述と矛盾する実装はしない。矛盾に気づいたら私に確認してから進める。
- 型安全性を重視。any は原則使わない。
- Shopify Webhook payload は zod でパース＆検証。
- エラーハンドリングは SPEC.md 4.4 に従う。
- 冪等性は Supabase の UNIQUE 制約と upsert で担保する。
- コメントは日本語でOK。

【最後に】
実装完了後、以下を報告してください：
1. 作成したファイル一覧
2. `npm test` の実行結果
3. 動作確認手順（ローカルで curl で webhook を叩く方法）
4. SPEC.md の中で曖昧または追加確認が必要と判断した点

それでは始めてください。
```

---

## セッション2以降のプロンプト（Phase 1が動作確認済みになってから使う）

### セッション2：LINE ID連携

```
Phase 1 が正常に動作していることを確認しました。
次に SPEC.md の Phase 2（セクション5）を実装してください。

【追加インストール】
- @line/liff
- @line/bot-sdk

【作業内容】
SPEC.md 5.1 の実装ファイルを作成し、5.2 の連携フローを実装。
セキュリティ面（5.3）に注意して LIFF SDK の getIDToken() 検証も実装すること。

Phase 3 以降には着手しないでください。
```

### セッション3：LIFF スタンプカードUI

```
Phase 2 の動作確認完了。次は SPEC.md の Phase 3（セクション6）を実装。

【デザインは SPEC.md 6.3 のガイドラインを厳密に守ること】
- カラーコードは指定値を使う
- Zen Maru Gothic は next/font 経由で読み込む
- スタンプアイコンはSVGコンポーネントとして components/BreadStamp.tsx を作成
- 100個までのグリッドは 10×10 で表示
- モバイル縦長を前提としたレスポンシブ

Phase 4 以降には着手しないでください。
実装後、開発サーバーで LIFF Inspector 経由で見た目を確認できるようにしてください。
```

### セッション4：特典自動発行

```
Phase 3 完了。次は SPEC.md の Phase 4（セクション7）を実装。

【前提】
SPEC.md 9.6 の「プレゼント特典用SKU」（KOMEMOCCHI-GIFT-5）が
Shopifyに手動で作成済みで、Variant IDが .env.local の
GIFT_PRODUCT_VARIANT_ID に入っていることを確認してから開始すること。
未設定なら私に確認する。

【Phase 1で仮実装した閾値到達時の console.log を、実際のクーポン発行 + LINE通知に置き換える】

- Shopify Admin API の priceRuleCreate と discountCodeCreate を使う
- Price Ruleは SPEC.md 7.2 の設定に厳密に従う
  - entitledVariantIds に GIFT_PRODUCT_VARIANT_ID を指定
  - 100%オフ、他商品1個以上購入必須、1顧客1回限り
- コード形式は SPEC.md 7.2 の指定通り: `KOMEMOCCHI-M{milestone}-{customer_id}-{random8}`
- LINE 通知は Flex Message で（SPEC.md 7.3）
  - CTAボタンは discount適用URL形式で送る（`/discount/{CODE}?redirect=/`）
- rewards_issued テーブルにレコード追加（UNIQUE制約で二重発行防止）
- リトライ戦略（7.4）も実装
- Shopify GraphQL Admin API の最新エンドポイント（API version 2025-10）を使う

Phase 5 には着手しないでください。
```

### セッション5：E2Eテストとリッチメニュー

```
Phase 4 完了。最終フェーズ SPEC.md セクション8 を実装。

- E2Eテストは Playwright で作成
- リッチメニュー設定はLINE管理画面での手動作業なので、手順書を docs/richmenu-setup.md に作成
- 本番デプロイ手順を docs/deployment.md に作成
- 全Phase通しの動作確認スクリプトを scripts/e2e.sh に作成
```

---

## Tips: セッション管理

- 1セッションで1Phaseずつ、確認しながら進めるのが安全
- Phase完了後は必ず動作確認 → commit → push してから次Phaseへ
- 詰まったら SPEC.md の該当箇所を Claude Code に再度読ませて仕様確認させる
- SPEC.md 自体を変更する場合は、変更履歴を末尾に追記
