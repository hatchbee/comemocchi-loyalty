import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";
import { generateCouponCode, issueReward } from "@/lib/logic/issue-reward";

let fake: FakeSupabase;

beforeEach(() => {
  fake = new FakeSupabase();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateCouponCode", () => {
  it("SPEC 7.2 の形式 KOMEMOCCHI-M{milestone}-{customerId}-{random8} で生成される", () => {
    const code = generateCouponCode(100, 1234567890);
    expect(code).toMatch(/^KOMEMOCCHI-M100-1234567890-[a-z0-9]{8}$/);
  });

  it("呼び出しごとに異なるランダム部分が付く", () => {
    const codes = new Set(
      Array.from({ length: 10 }, () => generateCouponCode(200, 42)),
    );
    expect(codes.size).toBe(10);
  });
});

describe("issueReward（Shopify Admin API スタブ状態）", () => {
  it("未実装スタブのため skipped_not_implemented を返し、予約は補償削除される", async () => {
    const result = await issueReward({
      supabase: fake.asClient(),
      shopifyCustomerId: 111,
      lineUserId: "U-test",
      milestone: 100,
      totalBreadCount: 107,
    });

    expect(result.status).toBe("skipped_not_implemented");
    if (result.status === "skipped_not_implemented") {
      expect(result.couponCode).toMatch(/^KOMEMOCCHI-M100-111-[a-z0-9]{8}$/);
    }
    // 予約 INSERT → Admin API 未実装 → 補償削除、の流れで最終的に空
    expect(fake.rewardsIssued.size).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Shopify Admin API 未実装"),
    );
  });

  it("発行済みマイルストーン（UNIQUE制約違反）→ already_issued で二重発行しない", async () => {
    // 既に発行済みの状態を再現
    fake.rewardsIssued.set("111:100", {
      id: 1,
      shopify_customer_id: 111,
      milestone: 100,
      coupon_code: "KOMEMOCCHI-M100-111-existing1",
      price_rule_id: 900001,
      discount_code_id: 900002,
      line_notified_at: null,
      used_at: null,
      issued_at: new Date().toISOString(),
    });

    const result = await issueReward({
      supabase: fake.asClient(),
      shopifyCustomerId: 111,
      lineUserId: "U-test",
      milestone: 100,
      totalBreadCount: 210,
    });

    expect(result.status).toBe("already_issued");
    // 既存レコードはそのまま残る
    expect(fake.rewardsIssued.get("111:100")?.coupon_code).toBe(
      "KOMEMOCCHI-M100-111-existing1",
    );
  });
});

// Flex Message 構築のテストは tests/flex-messages.test.ts に移動
