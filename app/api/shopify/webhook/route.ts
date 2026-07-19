import { verifyShopifyWebhookHmac } from "@/lib/shopify/verify";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { processPaidOrder } from "@/lib/logic/update-customer";
import { shopifyOrderSchema } from "@/types/shopify";

// HMAC 検証に node:crypto を使うため Node.js ランタイムを明示
export const runtime = "nodejs";

/**
 * Shopify `orders/paid` Webhook 受信エンドポイント（SPEC 4.2）。
 *
 * レスポンスコード（SPEC 4.4）:
 * - 200: 正常処理 / 処理済み（冪等） / カウント対象外
 * - 401: HMAC 検証失敗
 * - 500: Supabase 接続失敗・未知の例外（Shopify がリトライする）
 */
export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] SHOPIFY_WEBHOOK_SECRET が設定されていません");
    return Response.json({ error: "server misconfigured" }, { status: 500 });
  }

  // HMAC 検証には生ボディが必要（パース後の再 stringify では署名が一致しない）
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  // --- (SPEC 4.2-2) HMAC 署名検証 ---
  if (!verifyShopifyWebhookHmac(rawBody, hmacHeader, secret)) {
    console.warn("[webhook] HMAC 検証に失敗しました");
    return Response.json({ error: "invalid hmac" }, { status: 401 });
  }

  // --- ペイロードのパース & バリデーション（zod） ---
  // HMAC 検証済み＝Shopify からの正規リクエストなので、パース失敗はこちらの
  // スキーマ想定漏れの可能性が高い。500 を返して Shopify のリトライに委ねる（SPEC 4.4）
  let order;
  try {
    order = shopifyOrderSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    console.error("[webhook] ペイロードのパースに失敗しました", error);
    return Response.json({ error: "invalid payload" }, { status: 500 });
  }

  // --- (SPEC 4.2-3〜7) 冪等性チェック・個数集計・customers 更新 ---
  try {
    const supabase = createServiceRoleClient();
    const result = await processPaidOrder(supabase, order);
    return Response.json(result, { status: 200 });
  } catch (error) {
    // Supabase 接続失敗・未知の例外 → 500 で Shopify にリトライさせる（SPEC 4.4）
    console.error(`[webhook] order の処理中にエラーが発生しました`, error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}
