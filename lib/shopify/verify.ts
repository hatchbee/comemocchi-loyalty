import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Shopify Webhook の HMAC-SHA256 署名を検証する（SPEC 4.2-2）。
 *
 * @param rawBody    パース前の生リクエストボディ文字列。
 *                   JSON.parse → JSON.stringify し直した文字列では署名が一致しないため、
 *                   必ず `request.text()` で取得した生の文字列を渡すこと。
 * @param hmacHeader `X-Shopify-Hmac-Sha256` ヘッダーの値（base64）
 * @param secret     Shopify Webhook signing secret
 */
export function verifyShopifyWebhookHmac(
  rawBody: string,
  hmacHeader: string | null,
  secret: string,
): boolean {
  if (!hmacHeader || !secret) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  const received = Buffer.from(hmacHeader, "base64");

  // timingSafeEqual は長さが異なると例外を投げるため先にチェックする
  if (expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
}
