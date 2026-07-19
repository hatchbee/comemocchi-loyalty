import type { ShopifyLineItem } from "@/types/shopify";

export interface BreadCountResult {
  /** この注文で加算するパンの合計個数 */
  total: number;
  /** sku_bread_map に登録がなかった SKU（非対象商品。0個として扱う） */
  unmappedSkus: string[];
}

/**
 * line_items を sku_bread_map と突合してパン個数を集計する（SPEC 4.2-4）。
 *
 * - マッピングにある SKU: bread_count × quantity を加算
 * - マッピングにない SKU（タビスマ等の非対象商品）: 0 として扱い unmappedSkus に記録
 * - SKU が null / 空文字の line_item: 0 として扱う
 *
 * @param lineItems Shopify 注文の line_items
 * @param skuMap    sku → bread_count のマッピング（sku_bread_map テーブル由来）
 */
export function countBread(
  lineItems: readonly ShopifyLineItem[],
  skuMap: ReadonlyMap<string, number>,
): BreadCountResult {
  let total = 0;
  const unmapped = new Set<string>();

  for (const item of lineItems) {
    const sku = item.sku?.trim();
    if (!sku) {
      unmapped.add("(SKUなし)");
      continue;
    }
    const breadPerUnit = skuMap.get(sku);
    if (breadPerUnit === undefined) {
      unmapped.add(sku);
      continue;
    }
    total += breadPerUnit * item.quantity;
  }

  return { total, unmappedSkus: [...unmapped] };
}
