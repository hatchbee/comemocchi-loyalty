import { z } from "zod";

/**
 * Shopify `orders/paid` Webhook ペイロードのスキーマ定義。
 * Phase 1 で必要なフィールドのみをパースし、その他のフィールドは無視する。
 */

/** line_item（Phase 1 で必要なフィールドのみ） */
export const shopifyLineItemSchema = z.object({
  id: z.number(),
  // カスタム商品などでは sku が null / 空文字になることがある
  sku: z.string().nullish(),
  quantity: z.number().int().nonnegative(),
  title: z.string().nullish(),
});

/** orders/paid の注文ペイロード */
export const shopifyOrderSchema = z.object({
  id: z.number(),
  email: z.string().nullish(),
  // ゲスト購入や POS 注文では customer が存在しないことがある
  customer: z
    .object({
      id: z.number(),
      email: z.string().nullish(),
    })
    .nullish(),
  line_items: z.array(shopifyLineItemSchema),
});

export type ShopifyLineItem = z.infer<typeof shopifyLineItemSchema>;
export type ShopifyOrder = z.infer<typeof shopifyOrderSchema>;
