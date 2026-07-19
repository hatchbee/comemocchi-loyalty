# こめもっちLINEスタンプカード (comemocchi-loyalty)

Shopifyこめもっちストア × LINE公式アカウントを連携し、購入したパンの累計個数を追跡してLINE上にスタンプカードUIで表示するシステムです。100個到達ごとに「パン5個無料クーポン」を自動発行してLINEで通知します。現在は **Phase 1（Shopify Webhook 受信とカウントロジック）** まで実装済みです。仕様の詳細は [SPEC.md](./SPEC.md) を参照してください。

## 技術スタック

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres)
- Vitest（ユニットテスト）
- Node.js 22系

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` に各値を設定します（一覧は [SPEC.md 3節](./SPEC.md#3-環境変数-envlocal) 参照）。Phase 1 で必須なのは以下の3つです。

| 変数 | 説明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | SupabaseプロジェクトのURL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key（サーバー専用・非公開） |
| `SHOPIFY_WEBHOOK_SECRET` | Shopify Webhook signing secret |

### 3. Supabaseテーブル作成

Supabaseの SQL Editor で [SPEC.md 2節「データモデル」](./SPEC.md#2-データモデル-supabase) のSQLを実行し、`customers` / `sku_bread_map` / `orders_processed` / `rewards_issued` の4テーブルを作成してください。作成後、`sku_bread_map` に SKU→パン個数の対応データを投入します（[SPEC.md 9.5](./SPEC.md#95-skuパン個数対応表) のCSV参照）。

```sql
INSERT INTO sku_bread_map (sku, bread_count, product_name) VALUES
  ('KOMEMOCCHI-10', 10, 'こめもっち 10個セット'),
  ('KOMEMOCCHI-15', 15, 'こめもっち 15個セット'),
  ('KOMEMOCCHI-20', 20, 'こめもっち 20個セット'),
  ('KOMEMOCCHI-40', 40, 'こめもっち 40個セット'),
  ('KOMEMOCCHI-60', 60, 'こめもっち 60個セット');
```

## 開発サーバーの起動

```bash
npm run dev
```

http://localhost:3000 で起動します。Webhookエンドポイントは `POST /api/shopify/webhook` です。

## テスト

```bash
npm test              # 全テスト実行
npm run test:watch    # ウォッチモード
npm run test:coverage # カバレッジ付き実行
```

テストは Supabase をインメモリのフェイクに差し替えて実行するため、実際のDBや環境変数は不要です。SPEC.md 4.5 のテストケース（HMAC検証・個数計算・冪等性・マイルストーン発火）をカバーしています。

## Shopify Webhookのローカル検証

### 方法A: curl で直接叩く

HMAC署名を正しく付与する必要があるため、以下のようにボディと署名を生成して送信します（`.env.local` の `SHOPIFY_WEBHOOK_SECRET` と同じ値を使うこと）。

```bash
# 1. テスト用ペイロードを作成
cat > /tmp/order.json <<'EOF'
{"id":9001,"email":"test@example.com","customer":{"id":12345,"email":"test@example.com"},"line_items":[{"id":1,"sku":"KOMEMOCCHI-10","quantity":1,"title":"こめもっち 10個セット"}]}
EOF

# 2. HMAC署名を生成（SECRET は .env.local と同じ値に置き換える）
SECRET="xxxxx"
HMAC=$(openssl dgst -sha256 -hmac "$SECRET" -binary < /tmp/order.json | base64)

# 3. 送信
curl -i -X POST http://localhost:3000/api/shopify/webhook \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Hmac-Sha256: $HMAC" \
  --data-binary @/tmp/order.json
```

- 1回目: `200 {"status":"processed", ...}` が返り、Supabaseの `customers` / `orders_processed` が更新されます
- 同じコマンドをもう1回: `200 {"status":"already_processed", ...}`（冪等性の確認）
- `-H "X-Shopify-Hmac-Sha256: invalid"` に変えると `401` が返ります

### 方法B: ngrok で実際のShopify Webhookを受ける

```bash
# 開発サーバーを起動した状態で
ngrok http 3000
```

表示された `https://xxxx.ngrok-free.app` を使い、Shopify管理画面 → **Settings > Notifications > Webhooks** で以下を登録します。

- イベント: **注文の支払い（orders/paid）**
- フォーマット: **JSON**
- URL: `https://xxxx.ngrok-free.app/api/shopify/webhook`

Webhook作成画面に表示される **signing secret** を `.env.local` の `SHOPIFY_WEBHOOK_SECRET` に設定して開発サーバーを再起動後、Shopifyでテスト注文（またはWebhookの「テスト通知を送信」）を行うと、ローカルでWebhookを受信できます。

## プロジェクト構成（Phase 1）

```
app/api/shopify/webhook/route.ts  # Webhook受信エンドポイント
lib/shopify/verify.ts             # HMAC-SHA256署名検証
lib/supabase/server.ts            # Supabaseサーバーサイドクライアント
lib/logic/count-bread.ts          # パン個数集計ロジック
lib/logic/update-customer.ts      # 冪等性チェック・customers更新・マイルストーン判定
types/shopify.ts                  # Shopify Webhookペイロードのzodスキーマ
tests/                            # Vitestユニットテスト
```
