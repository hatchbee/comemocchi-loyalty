/**
 * Shopify Admin API 経由のクーポン発行（SPEC 7.2）。
 *
 * ⚠️ Admin API アクセストークンが未取得のため、現時点ではスタブ。
 * トークン取得後、次回セッションで priceRuleCreate + discountCodeCreate を実装する。
 * 実装時の仕様は SPEC 7.2 参照:
 * - targetSelection: entitled（GIFT_PRODUCT_VARIANT_ID のみ対象）
 * - valueType: percentage, value: -100.0
 * - prerequisiteQuantityRange >= 1（他商品1個以上の購入必須）
 * - oncePerCustomer: true
 * - 有効期限: 発行から60日
 */

/** Admin API 未実装であることを表すエラー（呼び出し側でスキップ扱いにする） */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

export interface CreateDiscountParams {
  /** 発行するクーポンコード（issue-reward.ts で生成済み） */
  couponCode: string;
  milestone: number;
  shopifyCustomerId: number;
  /** クーポン有効期限 */
  expiresAt: Date;
}

export interface CreatedDiscount {
  priceRuleId: number;
  discountCodeId: number;
}

export async function createMilestoneDiscount(
  params: CreateDiscountParams,
): Promise<CreatedDiscount> {
  // TODO(次回セッション): SHOPIFY_ADMIN_API_ACCESS_TOKEN 取得後に実装する
  throw new NotImplementedError(
    `Shopify Admin API によるクーポン発行は未実装です（coupon=${params.couponCode}）。` +
      "Admin API アクセストークン取得後に実装します。",
  );
}
