import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyShopifyWebhookHmac } from "@/lib/shopify/verify";

const SECRET = "test-webhook-secret";

function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

describe("verifyShopifyWebhookHmac", () => {
  it("正しい署名なら true を返す", () => {
    const body = JSON.stringify({ id: 1, line_items: [] });
    expect(verifyShopifyWebhookHmac(body, sign(body), SECRET)).toBe(true);
  });

  it("日本語を含むボディでも正しく検証できる", () => {
    const body = JSON.stringify({ title: "こめもっち 10個セット" });
    expect(verifyShopifyWebhookHmac(body, sign(body), SECRET)).toBe(true);
  });

  it("署名が改ざんされていたら false を返す", () => {
    const body = JSON.stringify({ id: 1 });
    const tampered = sign(body).slice(0, -4) + "AAAA";
    expect(verifyShopifyWebhookHmac(body, tampered, SECRET)).toBe(false);
  });

  it("ボディが改ざんされていたら false を返す", () => {
    const original = JSON.stringify({ id: 1, total: 10 });
    const tamperedBody = JSON.stringify({ id: 1, total: 9999 });
    expect(verifyShopifyWebhookHmac(tamperedBody, sign(original), SECRET)).toBe(false);
  });

  it("別の secret で署名されていたら false を返す", () => {
    const body = JSON.stringify({ id: 1 });
    expect(verifyShopifyWebhookHmac(body, sign(body, "wrong-secret"), SECRET)).toBe(false);
  });

  it("ヘッダーが null なら false を返す", () => {
    expect(verifyShopifyWebhookHmac("{}", null, SECRET)).toBe(false);
  });

  it("ヘッダーが空文字なら false を返す", () => {
    expect(verifyShopifyWebhookHmac("{}", "", SECRET)).toBe(false);
  });
});
