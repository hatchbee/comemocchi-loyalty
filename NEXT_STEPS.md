# NEXT_STEPS — 実装状態と残作業

最終更新: 2026-07-21

## セッション2（2026-07-21）追加分

- `scripts/seed-line-user.ts` — 本番 Supabase に実際の LINE User ID でダミー顧客を投入するスクリプト（`npm run seed:line-user`）
- LIFF ページに実機テスト用の LINE User ID デバッグ表示を追加（`?debug=1` または ALLOW_DEV_MODE_IN_PRODUCTION=true で表示。**本番公開前に削除必須**、上記「本番公開前の必須対応」参照）

## セッション1サマリ（2026-07-19 実装分）

| コミット | 内容 |
|---------|------|
| `19effd3` | **Phase 1**: Next.js 15 プロジェクト初期化、Shopify orders/paid webhook（HMAC検証・冪等性・パン個数集計・customers UPSERT）、全マイルストーン発火対応、Vitest テスト一式 |
| `3dfb663` | **Phase 3**: LIFF スタンプカード UI（10×10グリッド・進捗バー・ブランドデザイン）、顧客状態 API、シードスクリプト。Phase 2 は CRM PLUS on LINE 代替のためスキップ決定 |
| `5ef408e` | **Phase 3.5**: 開発用プリセット/フォールバック（Supabase なしで UI 確認可）、Phase 4 足場（issue-reward オーケストレーション・rewards_issued 記録・Shopify/LINE スタブ） |
| `4261fa8` | ALLOW_DEV_MODE_IN_PRODUCTION フラグ（本番デプロイでのデザイン確認用・デフォルト無効） |
| `6745c40` | **Phase 4a**: LINE Flex Message 5種プロトタイプ + ブラウザプレビューページ（/dev/message-preview） |
| `39d1118` | **Phase 5a**: リッチメニュー素材（SVG原本・PNG・生成スクリプト・設定手順書） |

テスト: 58件全パス / 型チェック・Lint クリーン / 本番ビルド確認済み

## 明日以降の作業リスト（優先順）

1. **Phase 4 本実装**（Shopify Admin API トークン取得が前提 — Dev Dashboard の仕様変更問題の解消待ち）
   - `lib/shopify/create-discount.ts` の NotImplementedError スタブを priceRuleCreate + discountCodeCreate に差し替え（SPEC 7.2、指数バックオフ3回）
   - `lib/line/send-message.ts` の実送信（LINE Messaging API push、LINE_CHANNEL_ACCESS_TOKEN 使用）
   - LINE 未通知分（line_notified_at IS NULL）の cron 再送（SPEC 7.4）
   - リマインドメッセージ（あと5個/10個）の配信トリガー設計・実装（webhook 時判定 or 定期バッチ）
2. **手動セットアップ**（コード外、オーナー作業）
   - Supabase テーブル作成 + sku_bread_map 投入 + RLS 有効化
   - Shopify Settings > Notifications で orders/paid webhook 作成・signing secret 取得
   - Vercel デプロイ + 環境変数投入
   - プレゼント用 SKU `KOMEMOCCHI-GIFT-5` 作成（SPEC 9.6）
   - LINE Developers で LIFF 登録 → LIFF ID 取得
   - リッチメニュー公開（docs/rich-menu-setup.md、実URL確定が前提）
3. **Phase 2 代替**: CRM PLUS on LINE の連携方法調査 → customers.line_user_id への取り込み実装
4. **本番公開前の必須対応**
   - status API の LIFF ID トークン検証（現状 line_user_id 無検証）
   - ALLOW_DEV_MODE_IN_PRODUCTION を false に戻す（デザイン確認で有効化した場合）
   - **LINE User ID デバッグバナーの削除**（`app/liff/stamp-card/page.tsx` の debugEnabled/debugLineUserId 関連コードと `components/DebugLineUserIdBanner.tsx`）。`?debug=1` または ALLOW_DEV_MODE_IN_PRODUCTION=true で誰でも他人の画面から LINE User ID を閲覧できてしまう実機テスト用の一時機能（2026-07-21 追加）
5. **Phase 5 仕上げ**: E2E テスト（テスト注文 → webhook → LIFF 表示 → クーポン適用）

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

## Phase 2: LINE ID連携（SPEC 5節）— スキップ決定（2026-07-19）

> ⚠️ **SPEC 5節の自前実装は行わない。** LINE連携は Shopify アプリ「**CRM PLUS on LINE**」で代替する（オーナー決定済み）。

- 残作業: CRM PLUS on LINE が Shopify顧客 ↔ LINE user ID の紐付けをどう提供するか（API / CSV / webhook）を調査し、`customers.line_user_id` への取り込み方法を設計・実装する
- それまでの動作確認は `scripts/seed-test-customer.ts` で line_user_id を直接投入して行う

## Phase 3: LIFFスタンプカードUI（SPEC 6節）— 完了

実装済みファイル:

| ファイル | 内容 |
|---------|------|
| `app/liff/stamp-card/page.tsx` | LIFF ページ（client component）。LIFF SDK で LINE user ID 取得 → status API 呼び出し。未連携時は案内表示 |
| `app/liff/layout.tsx` | Zen Maru Gothic / Noto Sans JP を next/font で読み込み。ベース色 #FDF6E9 |
| `app/api/customer/status/route.ts` | `GET ?line_user_id=` で累計・最終マイルストーンを返す（404=未連携） |
| `lib/logic/stamp-progress.ts` | 周回内進捗（total % 100）・残り個数・達成回数（total / 100 切り捨て）の計算 |
| `components/StampCard.tsx` | 10×10 グリッド、進捗バー、「あと◯個で🍞5個プレゼント！」、達成回数、CTA |
| `components/ProgressBar.tsx` / `components/BreadStamp.tsx` | 進捗バーとパン型 SVG スタンプ |
| `scripts/seed-test-customer.ts` | ダミー顧客投入（`npm run seed:test-customer`） |

補足・留意点:

- **LIFF ID 未発行でも動作確認可能**: 開発モード（NODE_ENV=development）では `?dev_line_user_id=xxx` で LINE user ID をシミュレートできる。本番ビルドでは LIFF SDK 必須。
- **クライアント環境変数の橋渡し**: `LINE_LIFF_ID` / `SHOPIFY_SHOP_DOMAIN` を `next.config.ts` の `env` で `NEXT_PUBLIC_*` にマッピングしている（SPEC 3節の変数名を維持するため）。
- **⚠️ status API は line_user_id を無検証で信用している**。本番公開前に LIFF の ID トークン検証（`liff.getIDToken()` をサーバーで検証、SPEC 5.3 参照）に置き換えること。
- 到達時のお祝いエフェクト（紙吹雪等、SPEC 6.3）は未実装。「到達の瞬間」は Phase 4 の LINE 通知で祝う設計のため、カード側は達成回数バッジのみ。必要なら Phase 5 で追加。

## Phase 3.5: 開発フォールバック + Phase 4 足場 — 完了（2026-07-19）

**作業1: 開発モードのダミーデータ**（Supabase 設定なしで LIFF UI を確認可能）

- `lib/dev/dev-presets.ts` — プリセット定義（fresh=0 / progress=47 / near=95 / achieved=100 / repeater=273）
- `app/api/customer/status/route.ts` — NODE_ENV=development のとき、プリセット名ならダミーを返す。それ以外の ID で Supabase 未設定・接続失敗ならフォールバック（累計73個）。**本番モードでは無効**（500/404 のまま）
- 確認用 URL 一覧は README「LIFFスタンプカードのローカル確認」参照

**作業2: Phase 4 スキャフォールディング**（Shopify Admin API を叩かない部分）

- `lib/logic/issue-reward.ts` — 特典発行オーケストレーション実装済み。webhook のマイルストーン発火時に各マイルストーンごとに呼ばれる。処理順: ①rewards_issued に予約 INSERT（UNIQUE で二重発行防止）→ ②Shopify クーポン発行 → ③price_rule_id 記録 → ④LINE 通知（成功時のみ line_notified_at 記録）。②失敗時は予約を補償削除
- `lib/shopify/create-discount.ts` — **スタブ**（NotImplementedError を投げる）。現状は issue-reward が「予約→スタブ失敗→補償削除」でスキップし、rewards_issued に残骸を残さない
- `lib/line/send-message.ts` — Flex Message 構築は実装済み（SPEC 7.3 の文面・ブランドカラー準拠、テスト済み）。**送信はスタブ**（ログのみ、delivered=false）
- クーポンコード生成は実装済み: `KOMEMOCCHI-M{milestone}-{customerId}-{random8}`（crypto乱数）
- 特典発行の失敗は webhook を失敗させない（注文は処理済みのため、リトライしても already_processed になるだけ）

## Phase 4a: LINE Flex Message プロトタイプ — 完了（2026-07-19）

- `lib/line/flex-messages.ts` — 5種類のメッセージビルダーを実装（bubble 形式、LINE公式仕様準拠、ブランドカラー: 見出し #8B6F47 / CTA #E8A845 / ベース #FDF6E9）
  - `buildMilestoneMessage(milestone, couponCode, couponUrl, expiresAt)` — 100個（初回のお祝い文面）/ 200個以降（「◯回目のプレゼントです」のリピート文面）を自動で切り替え
  - `buildAlmostThereMessage(remaining, storeUrl)` — あと5個以下（「次のご購入で達成できます」）/ それ以外（「ゴール目前です🏃‍♀️」）を切り替え
  - `buildWelcomeMessage(liffUrl)` — 初回LINE連携時のウェルカムメッセージ
- `issue-reward.ts` は `buildMilestoneMessage` を使用するよう更新済み（旧 `buildMilestoneCouponFlexMessage` は廃止、`send-message.ts` は送信スタブ専用に）
- 構造は zod スキーマでユニットテスト済み（altText 400字制限・ボタンlabel 40字制限・色形式など LINE 仕様の基本制約を検証）
- **プレビューページ**: `app/dev/message-preview/page.tsx` → http://localhost:3000/dev/message-preview で5種類を並べて目視確認できる（本番では ALLOW_DEV_MODE_IN_PRODUCTION=true のときのみ表示）
- リマインドメッセージ（あと5個/10個）の**配信トリガーは未実装**。いつ送るか（webhook 処理時に判定 or 定期バッチ）は Phase 4 本実装時に要設計

## Phase 4 残作業: 特典自動発行の本実装（次回セッション）

**⚠️ 前提: Shopify Admin API アクセストークンの取得（現在 Shopify Dev Dashboard の仕様変更で保留中）**

1. `lib/shopify/create-discount.ts` の本実装 — priceRuleCreate + discountCodeCreate（SPEC 7.2 のパラメータ、指数バックオフ3回）。実装したら NotImplementedError スタブを差し替えるだけで全フローが動く
2. `lib/line/send-message.ts` の本実装 — LINE Messaging API push 送信（LINE_CHANNEL_ACCESS_TOKEN 使用）
3. LINE 未通知分（line_notified_at IS NULL）の cron 再送（SPEC 7.4）
4. 事前準備: プレゼント用 SKU `KOMEMOCCHI-GIFT-5` の作成と `GIFT_PRODUCT_VARIANT_ID` の設定（SPEC 9.6）

## Phase 5a: リッチメニュー素材 — 完了（2026-07-19）

- `assets/rich-menu.svg` — 編集可能な原本（2500×1686、6分割、ブランドカラー準拠。アイコンは絵文字ではなくベクター描画: パン/カート/キラキラ/吹き出し/星/人物）
- `assets/rich-menu.png` — LINE アップロード用 PNG（121KB、規定の 1MB 以下）
- `scripts/generate-rich-menu.ts` — SVG→PNG 変換（`npm run generate:rich-menu`）。初回実行時に Zen Maru Gothic Bold を自動ダウンロードして `assets/fonts/` にキャッシュ（gitignore 済み）
- `docs/rich-menu-setup.md` — LINE Official Account Manager での設定手順・6分割タップ座標・各エリアのアクション設定（LIFF URL / ストア URL のプレースホルダ入り）

## Phase 5 残作業: リッチメニュー公開 + E2E（SPEC 8節）

- LINE Official Account Manager でリッチメニューを実際に設定（docs/rich-menu-setup.md の手順どおり。LIFF ID 取得が前提）
- 新商品情報・お問い合わせ・お客様の声・マイページの実URL確定（手順書はプレースホルダ）
- E2E シナリオ: テスト注文 → webhook → DB 更新 → LIFF 表示 → クーポン適用まで通し確認

## 手動セットアップの残項目（SPEC 9節）

- [ ] Supabase テーブル作成 + `sku_bread_map` データ投入 + RLS 有効化
- [ ] Shopify Settings > Notifications で `orders/paid` webhook 作成、signing secret を `SHOPIFY_WEBHOOK_SECRET` に設定
- [ ] Vercel デプロイ + 環境変数投入
- [ ] LINE Developers チャネル / LIFF 登録（Phase 2 の方針確定後）
- [ ] プレゼント SKU 作成（Phase 4 前）
