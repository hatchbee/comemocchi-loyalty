import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";
import { generateCouponCode, issueReward } from "@/lib/logic/issue-reward";
import { buildMilestoneCouponFlexMessage } from "@/lib/line/send-message";

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

describe("buildMilestoneCouponFlexMessage", () => {
  const params = {
    milestone: 100,
    couponCode: "KOMEMOCCHI-M100-111-a3f9k2p1",
    couponUrl:
      "https://example.myshopify.com/discount/KOMEMOCCHI-M100-111-a3f9k2p1?redirect=/collections/all",
    expiresAt: new Date("2026-09-17T00:00:00+09:00"),
  };

  it("SPEC 7.3 の文面要素を含む Flex Message を構築する", () => {
    const message = buildMilestoneCouponFlexMessage(params);

    expect(message.type).toBe("flex");
    expect(message.altText).toContain("100個達成おめでとうございます");

    const json = JSON.stringify(message.contents);
    expect(json).toContain("100個達成おめでとうございます");
    expect(json).toContain("パン5個プレゼントクーポン");
    expect(json).toContain("KOMEMOCCHI-M100-111-a3f9k2p1");
    expect(json).toContain("クーポンを使う");
    expect(json).toContain(params.couponUrl);
  });

  it("有効期限が日本時間の YYYY-MM-DD で表示される", () => {
    const message = buildMilestoneCouponFlexMessage(params);
    expect(JSON.stringify(message.contents)).toContain("有効期限：2026-09-17");
  });
});
