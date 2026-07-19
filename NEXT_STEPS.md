# NEXT_STEPS — 実装状態と残作業

最終更新: 2026-07-19（Phase 1 完了時点）

## 現在の実装状態（Phase 1: 完了）

Shopify `orders/paid` Webhook を受信してパン累計個数を更新する部分まで実装済み。

| ファイル | 内容 |
|---------|------|
| `app/api/shopify/webhook/route.ts` | Webhook 受信。HMAC 検証 → zod パース → 処理委譲。200/401/500 は SPEC 4.4 準拠 |
| `lib/shopify/verify.ts` | HMAC-SHA256 署名検証（timingSafeEqual 使用） |
| `lib/supabase/server.ts` | Service Role Key を使うサーバー専用 Supabase クライアント |
| `lib/logic/count-bread.ts` | line_items × sku_bread_map の個数集計（純粋関数） |
| `lib/logic/update-customer.ts` | 冪等性チェック・customers UPSERT・マイルストーン判定 |
| `types/shopify.ts` | orders/paid ペイロードの zod スキーマ |
| `tests/` | Vitest 24件（HMAC・個数計算・冪等性・マイルストーン） |

**SPEC.md からの変更・補足点**

- **複数マイルストーン跨ぎ**: SPEC 4.2-6 の式（最新のみ発火）から変更し、跨いだすべてのマイルストーン（例: 90→210個なら 100 と 200 の両方）を発火する仕様。`processPaidOrder` は `milestonesReached: number[]` を返す。Phase 4 ではこの配列の各要素ごとにクーポン発行 + LINE 通知を行うこと。
- **トランザクション**: supabase-js は複数文トランザクション非対応のため、`orders_processed` を先に INSERT して冪等ロックとし（PK 違反 23505 = 処理済み）、customers 更新失敗時は補償削除して 500 → Shopify リトライに委ねる方式。厳密な原子性が必要になったら Postgres 関数（RPC）化を検討。
- **customer 情報がない注文**（ゲスト購入・POS）は警告ログを出して 200 でスキップ。
- **last_milestone_reached は Phase 1 でも更新される**ため、Phase 4 稼働前に到達したマイルストーンには遡ってクーポンが出ない。遡及発行するなら Phase 4 で `rewards_issued` との突合が必要（要オーナー判断）。
- Next.js は SPEC 指定どおり **15系**（15.5.20）にピン留め済み（`create-next-app@latest` は 16 を入れてくるので注意）。

**環境面の前提**

- Shopify Webhook はカスタムアプリではなく **Settings > Notifications** 経由で作成する方針（SPEC 9.2 の記述と異なる）。
- **Admin API access token は未発行**。Phase 4（クーポン発行）で必要になる。Phase 1〜3 では不要。
- Supabase テーブルは未作成の可能性あり。SPEC.md 2節の SQL を実行し、`sku_bread_map` に SKU データを投入すること（README 参照）。

## Phase 2: LINE ID連携（SPEC 5節）— 未着手・設計変更予定

> ⚠️ **SPEC 5節の設計は変更予定。** LINE連携は Shopify アプリ「**CRM PLUS on LINE**」で代替される。着手前にオーナーに最新方針を確認すること。SPEC の LIFF 自前連携（`app/liff/link/` + `app/api/line/link/`）は実装しない可能性が高い。

- CRM PLUS on LINE が Shopify顧客 ↔ LINE user ID の紐付けをどう提供するか（API / CSV / webhook）を調査
- `customers.line_user_id` への取り込み方法を設計・実装

## Phase 3: LIFFスタンプカードUI（SPEC 6節）— 未着手

- `app/liff/stamp-card/page.tsx` — スタンプカード表示（LIFF SDK で LINE user ID 取得）
- `app/api/customer/status/route.ts` — 顧客状態取得 API
- `components/StampCard.tsx` / `components/ProgressBar.tsx`
- デザインは SPEC 6.3 のカラーパレット・タイポグラフィ（Zen Maru Gothic / Noto Sans JP）準拠
- スマホ縦長（375〜428px）前提

## Phase 4: 特典自動発行（SPEC 7節）— 未着手

- `lib/shopify/create-discount.ts` — priceRuleCreate + discountCodeCreate（**Admin API token の発行が前提**）
- `lib/line/send-message.ts` — LINE Flex Message 通知
- `lib/logic/issue-reward.ts` — `update-customer.ts` の `milestonesReached` 配列の**各要素ごと**に発行処理を呼ぶ（現在はログ出力のみのプレースホルダ）
- `rewards_issued` の UNIQUE(shopify_customer_id, milestone) で二重発行防止
- リトライ: Shopify API は指数バックオフ3回、LINE 未通知分は cron 再送（SPEC 7.4）
- 事前準備: プレゼント用 SKU `KOMEMOCCHI-GIFT-5` の作成と `GIFT_PRODUCT_VARIANT_ID` の設定（SPEC 9.6）

## Phase 5: リッチメニュー + E2E（SPEC 8節）— 未着手

- リッチメニュー 2×3 設定（LINE Official Account Manager）
- E2E シナリオ: テスト注文 → webhook → DB 更新 → LIFF 表示 → クーポン適用まで通し確認

## 手動セットアップの残項目（SPEC 9節）

- [ ] Supabase テーブル作成 + `sku_bread_map` データ投入 + RLS 有効化
- [ ] Shopify Settings > Notifications で `orders/paid` webhook 作成、signing secret を `SHOPIFY_WEBHOOK_SECRET` に設定
- [ ] Vercel デプロイ + 環境変数投入
- [ ] LINE Developers チャネル / LIFF 登録（Phase 2 の方針確定後）
- [ ] プレゼント SKU 作成（Phase 4 前）
