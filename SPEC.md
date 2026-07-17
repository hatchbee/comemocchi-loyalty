# こめもっちLINEスタンプカード 開発仕様書

## 0. プロジェクト概要

Shopifyこめもっちストア × LINE公式アカウントを連携し、購入パン個数の累計を追跡してLINE上にスタンプカードUIで表示するシステムを構築する。100個到達ごとに「パン5個無料クーポン」を自動発行してLINEで通知する。

**ターゲットゴール**
- 顧客がLINE上で「あと何個で特典か」を視覚的に把握できる
- 100個到達で自動発火（200、300…と繰り返し）
- Shopify単独運用（楽天・Amazon分は対象外）

**技術スタック**
- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres) — 顧客状態・SKUマッピング保存
- Vercel — ホスティング
- LINE Messaging API + LIFF
- Shopify Admin API (2025-10 latest)

---

## 1. アーキテクチャ

```
[Shopify Store]
      │
      │ Webhook: orders/paid
      ▼
[Next.js API Route: /api/shopify/webhook]
      │ ①HMAC検証 ②冪等性チェック ③個数計算 ④DB更新 ⑤閾値チェック
      ▼
[Supabase Postgres]
      │
      ├─→ 閾値到達時 → [Shopify Admin API] クーポン発行
      │
      └─→ [LINE Messaging API] 通知メッセージ送信

[顧客のLINE]
   リッチメニュー →「スタンプカードを見る」
      │
      ▼
[Next.js LIFF Page: /liff/stamp-card]
      LINE User ID取得 → Supabaseから現在個数取得 → UI表示
```

---

## 2. データモデル (Supabase)

### `customers`
```sql
CREATE TABLE customers (
  id BIGSERIAL PRIMARY KEY,
  shopify_customer_id BIGINT UNIQUE NOT NULL,
  line_user_id TEXT UNIQUE,
  email TEXT,
  total_bread_count INTEGER NOT NULL DEFAULT 0,
  last_milestone_reached INTEGER NOT NULL DEFAULT 0,
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customers_line_user_id ON customers(line_user_id);
CREATE INDEX idx_customers_email ON customers(email);
```

### `sku_bread_map`
```sql
CREATE TABLE sku_bread_map (
  sku TEXT PRIMARY KEY,
  bread_count INTEGER NOT NULL,
  product_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 例: ('KOMEMOCCHI-10', 10, 'こめもっち 10個セット')
--     ('KOMEMOCCHI-20', 20, 'こめもっち 20個セット')
--     ('KOMEMOCCHI-40', 40, 'こめもっち 40個セット')
--     ('KOMEMOCCHI-60', 60, 'こめもっち 60個セット')
```

### `orders_processed`
```sql
CREATE TABLE orders_processed (
  shopify_order_id BIGINT PRIMARY KEY,
  shopify_customer_id BIGINT NOT NULL,
  bread_count_added INTEGER NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `rewards_issued`
```sql
CREATE TABLE rewards_issued (
  id BIGSERIAL PRIMARY KEY,
  shopify_customer_id BIGINT NOT NULL,
  milestone INTEGER NOT NULL,
  coupon_code TEXT NOT NULL,
  price_rule_id BIGINT,
  discount_code_id BIGINT,
  line_notified_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(shopify_customer_id, milestone)
);
```

---

## 3. 環境変数 (`.env.local`)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Shopify
SHOPIFY_SHOP_DOMAIN=xxx.myshopify.com
SHOPIFY_ADMIN_API_ACCESS_TOKEN=shpat_xxxxx
SHOPIFY_WEBHOOK_SECRET=xxxxx
SHOPIFY_API_VERSION=2025-10

# LINE
LINE_CHANNEL_ID=xxxxx
LINE_CHANNEL_SECRET=xxxxx
LINE_CHANNEL_ACCESS_TOKEN=xxxxx
LINE_LIFF_ID=xxxxx-xxxxx

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Reward
GIFT_PRODUCT_VARIANT_ID=  # 9.6で作成した「こめもっち 5個プレゼント」のvariant ID
```

---

## 4. Phase 1: Webhookとカウントロジック（最初の実装対象）

### 4.1 実装ファイル
- `app/api/shopify/webhook/route.ts` — Webhook受信エンドポイント
- `lib/shopify/verify.ts` — HMAC署名検証
- `lib/supabase/server.ts` — Supabaseサーバーサイドクライアント
- `lib/logic/count-bread.ts` — 個数計算ロジック
- `lib/logic/update-customer.ts` — 顧客レコード更新
- `types/shopify.ts` — Shopify Webhookペイロード型定義

### 4.2 処理フロー

1. Shopify から `orders/paid` webhook を受信
2. `X-Shopify-Hmac-Sha256` ヘッダーで HMAC-SHA256 署名を検証（不一致なら401返却）
3. `orders_processed` テーブルに `shopify_order_id` が存在するかチェック（存在すれば200 OKで即return、冪等性担保）
4. `line_items[]` を走査し、各 `sku` を `sku_bread_map` と突合してパン個数を集計
   - マッピングにないSKUは0として扱い、警告ログを出す（旅行用品タビスマ等の非対象商品）
5. `customers` テーブル UPSERT
   - `shopify_customer_id` で検索
   - なければ新規作成
   - `total_bread_count` に個数加算
6. マイルストーン計算
   - 前回: `last_milestone_reached` （例：0 or 100 or 200）
   - 新しい累計から新マイルストーン計算：`Math.floor(total_bread_count / 100) * 100`
   - 新しいマイルストーン > `last_milestone_reached` なら特典発火（Phase 4で実装、Phase 1ではログのみ）
7. `orders_processed` にレコード追加
8. 200 OK 返却

### 4.3 冪等性の重要ポイント
- Shopifyはwebhookをリトライする。同じorderで複数回加算しないよう `orders_processed` の存在チェックは必須。
- DBトランザクションで `orders_processed` 挿入と `customers` 更新をアトミックに実行。

### 4.4 エラーハンドリング
- HMAC検証失敗: 401 Unauthorized
- Supabase接続失敗: 500 Internal Server Error（Shopifyがリトライする）
- SKUマッピング未登録: 警告ログ、処理は継続（0個として扱う）
- 未知の例外: 500返却、Sentry等に飛ばす（後付け）

### 4.5 テストケース
- ✅ 新規顧客が10個セットを1つ購入 → total_bread_count=10
- ✅ 既存顧客（97個）が10個セット購入 → total=107, milestone=100発火
- ✅ 同じwebhookを2回受信 → 2回目は加算されない
- ✅ HMAC不正 → 401
- ✅ マッピングにないSKUが含まれる注文 → 該当分は0、他は正しくカウント
- ✅ 複数line_itemsを含む注文（例: 10個セット×2 + 20個セット×1）→ 40加算

---

## 5. Phase 2: LINE ID連携

### 5.1 実装ファイル
- `app/liff/link/page.tsx` — 連携用LIFFページ
- `app/api/line/link/route.ts` — 連携API

### 5.2 連携フロー
1. 顧客がShopify購入完了ページの「LINE友だち追加」ボタンをタップ
2. LINE公式アカウントを友だち追加
3. 挨拶メッセージで「アカウントを連携する」ボタンを送信
4. ボタンタップ → LIFFページ起動（`/liff/link`）
5. LIFF SDK で LINE user ID を取得
6. Shopify顧客識別のためメールアドレスを入力してもらう（初回のみ）
7. サーバーサイドでShopify Admin APIから該当顧客を検索
8. `customers` テーブルの `line_user_id` を紐付け

### 5.3 セキュリティ
- LIFF SDK の `getIDToken()` を使い、サーバー側で LINE の JWT を検証
- 誤紐付け防止のため、注文完了時に発行するトークン（Shopify側からLIFF起動URLに埋め込み）でShopify顧客を特定する方式も検討

---

## 6. Phase 3: LIFFスタンプカードUI

### 6.1 実装ファイル
- `app/liff/stamp-card/page.tsx` — スタンプカード表示
- `app/api/customer/status/route.ts` — 顧客状態取得API
- `components/StampCard.tsx` — スタンプカードコンポーネント
- `components/ProgressBar.tsx` — 進捗バー

### 6.2 UI仕様

**表示要素**
- 現在の周回内の進捗（例: 73/100個）
- 10×10のスタンプグリッド（🍞アイコン、獲得済は塗り、未獲得は薄色）
- 「あと27個で🍞5個プレゼント！」のメッセージ
- 累計購入個数と過去の到達回数（「これまで2回達成！」）
- 「もっと買う」CTA → Shopifyストアへのリンク

### 6.3 デザインガイドライン（こめもっち楽天ブランド準拠）

**カラーパレット**
- ベース：クリーム `#FDF6E9`
- サブ：やさしいベージュ `#F5E6D3`
- アクセント：温かいブラウン `#8B6F47`
- CTA：ゴールド系オレンジ `#E8A845`
- テキスト：チャコール `#3A2E1F`
- 塗りスタンプ：焼き色ブラウン `#C08856`
- 未獲得スタンプ：ライトベージュ `#EFE4D2`

**タイポグラフィ**
- 見出し：Zen Maru Gothic（丸ゴシック、Google Fonts）— 米粉パンの丸みと温かさを表現
- 本文：Noto Sans JP
- 数字強調（現在個数）：Zen Maru Gothic Bold, 特大サイズ

**アイコン・イラスト**
- スタンプは丸みのあるパンイラスト（SVG）
- 到達時のお祝いエフェクト：紙吹雪 or キラキラアニメーション（軽量）

**トーン&マナー**
- やさしい、あたたかい、押し付けがましくない
- 敬語ベースだが、絵文字（🍞✨💛）でカジュアルさもプラス
- 「〜させていただきます」より「〜しますね」の柔らかさ

### 6.4 レスポンシブ
- スマホ縦長前提（375px〜428px幅）
- LIFF内で動くのでビューポート考慮

---

## 7. Phase 4: 特典自動発行

### 7.1 実装ファイル
- `lib/shopify/create-discount.ts` — Shopify Admin API 経由でクーポン発行
- `lib/line/send-message.ts` — LINE Messaging API 通知
- `lib/logic/issue-reward.ts` — マイルストーン到達時の処理オーケストレーション

### 7.2 クーポン仕様（無料プレゼントSKU自動追加方式）

**アプローチ確定**
- 「こめもっち 5個プレゼント（マイルストーン特典）」という専用SKUをShopifyに事前作成しておく
- クーポンコードを使うと、その専用SKUがカートに0円で追加される仕組み
- 顧客はチェックアウト時に「あ、5個増えてる」を体験できる（サプライズ性◎）

**事前準備（手動）**
- Shopify管理画面で以下の商品を作成
  - 商品名: 「こめもっち 5個プレゼント（マイルストーン特典）」
  - SKU: `KOMEMOCCHI-GIFT-5`
  - 価格: 5,000円（元価格）
  - 在庫追跡: あり
  - コレクション: 「特典商品」（他の割引に混ざらないよう分離）
  - 表示: 非公開（購入完了後のカート追加のみ、ストアフロントに出さない）

**クーポン発行実装**
- Shopify Admin API `priceRuleCreate` + `discountCodeCreate` で発行
- Price Rule設定:
  - `targetType`: `line_item`
  - `targetSelection`: `entitled`（対象SKUのみ）
  - `entitledProductIds` or `entitledVariantIds`: プレゼントSKUのvariant ID
  - `allocationMethod`: `each`
  - `valueType`: `percentage`
  - `value`: `-100.0`（100%オフ）
  - `prerequisiteQuantityRange.greaterThanOrEqualTo`: 1（最低1個他商品購入必須）
  - `oncePerCustomer`: true
- コード形式: `KOMEMOCCHI-M{milestone}-{shopify_customer_id}-{random8chars}`
  - 例: `KOMEMOCCHI-M100-1234567890-a3f9k2p1`
  - random8charsは推測困難性確保のため
- 有効期限: 発行から60日
- 1顧客1マイルストーン1回限り（`rewards_issued`のUNIQUE制約で担保）

**顧客側の使い方**
1. LINEに届いたFlex Messageの「クーポンを使う」ボタンをタップ
2. Shopifyストアが開き、次回購入時にクーポンコードを入力
3. 「本商品を1個以上カートに入れる → クーポン適用」で自動的にプレゼントSKUがカートに追加される
   - もしくは、より簡単な体験のためにdiscount適用URLを直接送る:
     `https://{shop}.myshopify.com/discount/{CODE}?redirect=/collections/all`

**注意事項**
- プレゼントSKU「1個」を無料化する設計 → プレゼントSKUの中身が「5個入り」であることを商品説明で明示
- 在庫は「プレゼント用在庫」として別管理（通常販売分と混ぜない）
- 顧客が意図的にプレゼントSKUだけカートに入れてもクーポン適用条件（他商品1個以上）で防げる
- 送料は無料になるとは限らない → 送料無料条件も付けるか要検討

### 7.3 LINE通知メッセージ

Flex Messageでリッチに表示：
```
🎉 100個達成おめでとうございます！

いつもこめもっちを愛してくださって
本当にありがとうございます💛

感謝の気持ちを込めて、
🍞 パン5個プレゼントクーポン 🍞
をお届けします！

[クーポンを使う] ボタン
（Shopifyストアの割引適用URL）

有効期限：2026-XX-XX
```

### 7.4 リトライ戦略
- Shopify APIエラー：3回まで指数バックオフ
- LINE API失敗：`rewards_issued.line_notified_at` が NULL のレコードを cron で再送

---

## 8. Phase 5: リッチメニュー設定 + E2Eテスト

### 8.1 リッチメニュー構成
- 2×3グリッド（LINE標準）
- ボタン配置案：
  1. スタンプカード（LIFF起動）
  2. こめもっちストア（Shopify）
  3. お問い合わせ
  4. 新商品情報
  5. お客様の声
  6. マイページ

### 8.2 E2Eテストシナリオ
1. Shopifyでテスト注文 → webhookが発火 → Supabase更新確認
2. LIFF連携 → customersに line_user_id が入る
3. スタンプカードLIFFを開く → 正しい個数が表示される
4. 100個到達 → LINEに通知 → クーポンコードでShopify注文実行 → 割引適用確認

---

## 9. 手動セットアップ（Claude Code開始前に完了する項目）

### 9.1 LINE Developers Console
- [ ] Providerとチャネル作成（Messaging API）
- [ ] LINE公式アカウントと紐付け
- [ ] Channel ID / Channel Secret / Channel Access Token取得
- [ ] LIFFアプリ登録（暫定URL: `http://localhost:3000/liff/stamp-card`、あとで本番URLに変更）
- [ ] LIFF ID取得

### 9.2 Shopifyカスタムアプリ
- [ ] Shopify管理画面 → 設定 → アプリと販売チャネル → 「アプリを開発」
- [ ] カスタムアプリ作成「Komemocchi Loyalty」
- [ ] Admin API アクセススコープ:
  - `read_customers`, `write_customers`
  - `read_orders`
  - `write_discounts`, `read_discounts`
  - `read_products`
- [ ] アプリインストール → Admin APIアクセストークン取得
- [ ] Webhook設定：Topic `orders/paid`, URL `https://your-app.vercel.app/api/shopify/webhook`, Format JSON
- [ ] Webhook signing secret取得

### 9.3 Supabaseプロジェクト
- [ ] 新規プロジェクト作成（asia-northeast1リージョン推奨）
- [ ] `SPEC.md` セクション2のSQLを実行してテーブル作成
- [ ] Service Role Key と anon Key取得
- [ ] Row Level Security (RLS) を有効化し、anon keyからは読取不可に

### 9.4 Vercel
- [ ] GitHub連携
- [ ] 環境変数を全て投入
- [ ] Production URL確認

### 9.5 SKU→パン個数対応表
- [ ] こめもっちの全商品SKUを洗い出し、以下のCSVを作成
```csv
sku,bread_count,product_name
KOMEMOCCHI-10,10,こめもっち 10個セット
KOMEMOCCHI-15,15,こめもっち 15個セット
KOMEMOCCHI-20,20,こめもっち 20個セット
KOMEMOCCHI-40,40,こめもっち 40個セット
KOMEMOCCHI-60,60,こめもっち 60個セット
```

### 9.6 プレゼント特典用SKU作成（重要）
- [ ] Shopifyで新商品を作成
  - 商品名: 「こめもっち 5個プレゼント（マイルストーン特典）」
  - SKU: `KOMEMOCCHI-GIFT-5`
  - 内容: パン5個入り（通常商品と同じ）
  - 定価: 5,000円（クーポンで100%オフ）
  - 在庫: プレゼント用にあらかじめ確保した数量
  - **ストアフロントには非公開**（コレクションに入れない・検索非表示）
  - 商品ページURL/ハンドル: `komemocchi-gift-5`
- [ ] Variant IDを取得してメモ（Admin API `productCreate` のレスポンス、または商品編集画面のURLから）
- [ ] このSKUは `sku_bread_map` に登録しない（累計にカウントしない）
- [ ] 特典商品用コレクション「マイルストーン特典」を作成し、このSKUを入れる

---

## 10. Claude Code への初回指示（このリポジトリで実行）

```
このリポジトリの SPEC.md を読み込んで、Phase 1（セクション4）だけを実装してください。
- Next.js 15 (App Router) + TypeScript のプロジェクトを新規作成
- 必要な依存関係をインストール
- SPEC.md セクション4の実装ファイルを全て作成
- HMAC検証、冪等性、個数計算、DB更新を実装
- app/api/shopify/webhook/route.ts のユニットテストをVitestで作成（セクション4.5のテストケース準拠）
- README.md に開発サーバー起動手順とテスト実行手順を記載

Phase 2以降は次のセッションで指示するので、まだ着手しないでください。
```

Phase 1完了後、動作確認 → Phase 2を指示という流れで進める。

---

## 11. 想定コスト（月額）

| 項目 | 金額 |
|------|------|
| Vercel Hobby | 無料 |
| Supabase Free Tier | 無料（500MB DB、50k monthly active users まで） |
| LINE公式アカウント Communication Plan | 5,000円 (月間5,000通まで) |
| LINE Messaging API | 上記に含まれる |
| ドメイン（任意） | 年1,500円程度 |
| **合計** | **月5,000円前後** |

顧客数・配信数が増えたらVercel Pro (月$20) とLINE Premium Plan (15,000円) への段階的な移行を検討。

---

## 12. 将来的な拡張余地

- 楽天・Amazon購入分の手動CSV取込機能（既に楽天CSVパイプラインあり、統合可能）
- 誕生日特典
- 定期購入者向けの上乗せポイント
- タビスマ側への横展開
- スタンプカードの季節デザイン切替
- 友だち紹介プログラム（紹介者・被紹介者双方に個数加算）
