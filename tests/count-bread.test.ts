import { describe, expect, it } from "vitest";
import { countBread } from "@/lib/logic/count-bread";
import type { ShopifyLineItem } from "@/types/shopify";

const SKU_MAP = new Map<string, number>([
  ["KOMEMOCCHI-10", 10],
  ["KOMEMOCCHI-20", 20],
  ["KOMEMOCCHI-40", 40],
  ["KOMEMOCCHI-60", 60],
]);

function item(sku: string | null, quantity: number): ShopifyLineItem {
  return { id: Math.abs(sku ? sku.length : 0) + quantity, sku, quantity, title: null };
}

describe("countBread", () => {
  it("10個セット×1 → 10個", () => {
    const result = countBread([item("KOMEMOCCHI-10", 1)], SKU_MAP);
    expect(result.total).toBe(10);
    expect(result.unmappedSkus).toEqual([]);
  });

  it("複数line_items（10個セット×2 + 20個セット×1）→ 40個", () => {
    const result = countBread(
      [item("KOMEMOCCHI-10", 2), item("KOMEMOCCHI-20", 1)],
      SKU_MAP,
    );
    expect(result.total).toBe(40);
    expect(result.unmappedSkus).toEqual([]);
  });

  it("マッピングにないSKUは0個扱い・他は正しくカウントし、未登録SKUを報告する", () => {
    const result = countBread(
      [item("KOMEMOCCHI-10", 1), item("TABISUMA-POUCH", 3)],
      SKU_MAP,
    );
    expect(result.total).toBe(10);
    expect(result.unmappedSkus).toEqual(["TABISUMA-POUCH"]);
  });

  it("SKUがnull・空文字のline_itemは0個扱い", () => {
    const result = countBread(
      [item(null, 1), item("", 2), item("KOMEMOCCHI-20", 1)],
      SKU_MAP,
    );
    expect(result.total).toBe(20);
    expect(result.unmappedSkus).toEqual(["(SKUなし)"]);
  });

  it("line_itemsが空 → 0個", () => {
    const result = countBread([], SKU_MAP);
    expect(result.total).toBe(0);
    expect(result.unmappedSkus).toEqual([]);
  });
});
