import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { FakeSupabase } from "./helpers/fake-supabase";
import type { ProcessOrderResult } from "@/lib/logic/update-customer";

// route.ts が使う Supabase クライアントをフェイクに差し替える
// （currentFake はテスト実行時＝createServiceRoleClient() 呼び出し時に参照される）
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => currentFake.asClient(),
}));

import { POST } from "@/app/api/shopify/webhook/route";

let currentFake: FakeSupabase;

const SECRET = "test-webhook-secret";
const WEBHOOK_URL = "http://localhost:3000/api/shopify/webhook";

function sign(body: string, secret: string = SECRET): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

interface LineItemInput {
  sku: string | null;
  quantity: number;
}

function orderPayload(
  orderId: number,
  customerId: number,
  lineItems: LineItemInput[],
): Record<string, unknown> {
  return {
    id: orderId,
    email: "customer@example.com",
    customer: { id: customerId, email: "customer@example.com" },
    line_items: lineItems.map((item, index) => ({
      id: orderId * 1000 + index,
      sku: item.sku,
      quantity: item.quantity,
      title: item.sku ?? "カスタム商品",
    })),
  };
}

function makeRequest(payload: unknown, hmac?: string): Request {
  const body = JSON.stringify(payload);
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-shopify-hmac-sha256": hmac ?? sign(body),
    },
    body,
  });
}

beforeEach(() => {
  vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", SECRET);
  currentFake = new FakeSupabase();
  // SPEC 2節の例に準拠した SKU マッピングを投入
  currentFake.seedSku("KOMEMOCCHI-10", 10, "こめもっち 10個セット");
  currentFake.seedSku("KOMEMOCCHI-20", 20, "こめもっち 20個セット");
  currentFake.seedSku("KOMEMOCCHI-40", 40, "こめもっち 40個セット");
  currentFake.seedSku("KOMEMOCCHI-60", 60, "こめもっち 60個セット");
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/shopify/webhook（SPEC 4.5 テストケース）", () => {
  it("新規顧客が10個セットを1つ購入 → total_bread_count=10", async () => {
    const response = await POST(
      makeRequest(orderPayload(5001, 111, [{ sku: "KOMEMOCCHI-10", quantity: 1 }])),
    );
    expect(response.status).toBe(200);

    const result = (await response.json()) as ProcessOrderResult;
    expect(result.status).toBe("processed");

    const customer = currentFake.customers.get(111);
    expect(customer?.total_bread_count).toBe(10);
    expect(customer?.last_milestone_reached).toBe(0);
    expect(currentFake.ordersProcessed.get(5001)?.bread_count_added).toBe(10);
  });

  it("既存顧客（97個）が10個セット購入 → total=107, milestone=100発火", async () => {
    currentFake.seedCustomer({
      shopify_customer_id: 222,
      total_bread_count: 97,
      last_milestone_reached: 0,
    });

    const response = await POST(
      makeRequest(orderPayload(5002, 222, [{ sku: "KOMEMOCCHI-10", quantity: 1 }])),
    );
    expect(response.status).toBe(200);

    const result = (await response.json()) as ProcessOrderResult;
    expect(result).toMatchObject({
      status: "processed",
      breadAdded: 10,
      totalBreadCount: 107,
      milestonesReached: [100],
    });

    const customer = currentFake.customers.get(222);
    expect(customer?.total_bread_count).toBe(107);
    expect(customer?.last_milestone_reached).toBe(100);

    // Phase 1 ではクーポン発行の代わりにログ出力のみ（SPEC 4.2-6）
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("マイルストーン 100"),
    );
  });

  it("同じwebhookを2回受信 → 2回目は加算されない（冪等性）", async () => {
    const payload = orderPayload(5003, 333, [{ sku: "KOMEMOCCHI-10", quantity: 1 }]);

    const first = await POST(makeRequest(payload));
    expect(first.status).toBe(200);
    expect(((await first.json()) as ProcessOrderResult).status).toBe("processed");

    const second = await POST(makeRequest(payload));
    expect(second.status).toBe(200);
    expect(((await second.json()) as ProcessOrderResult).status).toBe(
      "already_processed",
    );

    expect(currentFake.customers.get(333)?.total_bread_count).toBe(10);
    expect(currentFake.ordersProcessed.size).toBe(1);
  });

  it("HMAC不正 → 401 で DB は変更されない", async () => {
    const payload = orderPayload(5004, 444, [{ sku: "KOMEMOCCHI-10", quantity: 1 }]);
    const response = await POST(makeRequest(payload, "invalid-signature"));

    expect(response.status).toBe(401);
    expect(currentFake.customers.size).toBe(0);
    expect(currentFake.ordersProcessed.size).toBe(0);
  });

  it("マッピングにないSKUが含まれる注文 → 該当分は0、他は正しくカウント", async () => {
    const response = await POST(
      makeRequest(
        orderPayload(5005, 555, [
          { sku: "KOMEMOCCHI-20", quantity: 1 },
          { sku: "TABISUMA-POUCH", quantity: 2 },
        ]),
      ),
    );
    expect(response.status).toBe(200);

    const result = (await response.json()) as ProcessOrderResult;
    expect(result).toMatchObject({
      status: "processed",
      breadAdded: 20,
      totalBreadCount: 20,
      unmappedSkus: ["TABISUMA-POUCH"],
    });
    expect(currentFake.customers.get(555)?.total_bread_count).toBe(20);

    // 未登録 SKU の警告ログが出る（SPEC 4.2-4）
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("TABISUMA-POUCH"),
    );
  });

  it("複数line_itemsを含む注文（10個セット×2 + 20個セット×1）→ 40加算", async () => {
    const response = await POST(
      makeRequest(
        orderPayload(5006, 666, [
          { sku: "KOMEMOCCHI-10", quantity: 2 },
          { sku: "KOMEMOCCHI-20", quantity: 1 },
        ]),
      ),
    );
    expect(response.status).toBe(200);

    const result = (await response.json()) as ProcessOrderResult;
    expect(result).toMatchObject({
      status: "processed",
      breadAdded: 40,
      totalBreadCount: 40,
      milestonesReached: [],
    });
    expect(currentFake.customers.get(666)?.total_bread_count).toBe(40);
  });
});

describe("POST /api/shopify/webhook（エッジケース）", () => {
  it("customer情報がない注文（ゲスト購入等）→ 200 でスキップ", async () => {
    const payload = {
      id: 5007,
      email: null,
      customer: null,
      line_items: [{ id: 1, sku: "KOMEMOCCHI-10", quantity: 1, title: "こめもっち" }],
    };
    const response = await POST(makeRequest(payload));

    expect(response.status).toBe(200);
    expect(((await response.json()) as ProcessOrderResult).status).toBe(
      "skipped_no_customer",
    );
    expect(currentFake.customers.size).toBe(0);
    expect(currentFake.ordersProcessed.size).toBe(0);
  });

  it("SHOPIFY_WEBHOOK_SECRET 未設定 → 500", async () => {
    vi.stubEnv("SHOPIFY_WEBHOOK_SECRET", "");
    const response = await POST(
      makeRequest(orderPayload(5009, 888, [{ sku: "KOMEMOCCHI-10", quantity: 1 }])),
    );
    expect(response.status).toBe(500);
  });
});

describe("POST /api/shopify/webhook（複数マイルストーン跨ぎ）", () => {
  it("90個の顧客が計120個到達（+30個）→ 100 のみ発火（1個）", async () => {
    currentFake.seedCustomer({
      shopify_customer_id: 771,
      total_bread_count: 90,
      last_milestone_reached: 0,
    });

    const response = await POST(
      makeRequest(orderPayload(5101, 771, [{ sku: "KOMEMOCCHI-10", quantity: 3 }])),
    );
    const result = (await response.json()) as ProcessOrderResult;

    // 90 + 30 = 120 → [100]
    expect(result).toMatchObject({
      status: "processed",
      totalBreadCount: 120,
      milestonesReached: [100],
    });
    expect(currentFake.customers.get(771)?.last_milestone_reached).toBe(100);
  });

  it("90個の顧客が計210個到達（+120個）→ 100 と 200 の両方が発火（2個）", async () => {
    currentFake.seedCustomer({
      shopify_customer_id: 772,
      total_bread_count: 90,
      last_milestone_reached: 0,
    });

    const response = await POST(
      makeRequest(orderPayload(5102, 772, [{ sku: "KOMEMOCCHI-60", quantity: 2 }])),
    );
    const result = (await response.json()) as ProcessOrderResult;

    // 90 + 120 = 210 → [100, 200]
    expect(result).toMatchObject({
      status: "processed",
      totalBreadCount: 210,
      milestonesReached: [100, 200],
    });
    expect(currentFake.customers.get(772)?.last_milestone_reached).toBe(200);

    // 発火したマイルストーンをリスト形式でログ出力
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Milestones reached: [100, 200] for customer 772"),
    );
    // 各マイルストーンごとに独立したログも出る（Phase 4 でクーポン発行に置き換え）
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("マイルストーン 100"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("マイルストーン 200"),
    );
  });

  it("新規顧客（0個）が計350個到達 → 100, 200, 300 が発火（3個）", async () => {
    const response = await POST(
      makeRequest(
        orderPayload(5103, 773, [
          { sku: "KOMEMOCCHI-60", quantity: 5 },
          { sku: "KOMEMOCCHI-40", quantity: 1 },
          { sku: "KOMEMOCCHI-10", quantity: 1 },
        ]),
      ),
    );
    const result = (await response.json()) as ProcessOrderResult;

    // 0 + 300 + 40 + 10 = 350 → [100, 200, 300]
    expect(result).toMatchObject({
      status: "processed",
      totalBreadCount: 350,
      milestonesReached: [100, 200, 300],
    });
    expect(currentFake.customers.get(773)?.last_milestone_reached).toBe(300);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Milestones reached: [100, 200, 300] for customer 773"),
    );
  });

  it("マイルストーン発火時の特典発行は Admin API 未実装のためスキップされ、rewards_issued に残骸が残らない", async () => {
    currentFake.seedCustomer({
      shopify_customer_id: 775,
      total_bread_count: 97,
      last_milestone_reached: 0,
    });

    const response = await POST(
      makeRequest(orderPayload(5105, 775, [{ sku: "KOMEMOCCHI-10", quantity: 1 }])),
    );
    expect(response.status).toBe(200);

    // 予約 INSERT → スタブで NotImplemented → 補償削除、で最終的に空
    expect(currentFake.rewardsIssued.size).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Shopify Admin API 未実装"),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("skipped_not_implemented"),
    );
  });

  it("105個の顧客が10個購入 → 発火なし（同じ100の区分内）", async () => {
    currentFake.seedCustomer({
      shopify_customer_id: 774,
      total_bread_count: 105,
      last_milestone_reached: 100,
    });

    const response = await POST(
      makeRequest(orderPayload(5104, 774, [{ sku: "KOMEMOCCHI-10", quantity: 1 }])),
    );
    const result = (await response.json()) as ProcessOrderResult;

    // 105 + 10 = 115 → 発火なし
    expect(result).toMatchObject({
      status: "processed",
      totalBreadCount: 115,
      milestonesReached: [],
    });
    expect(currentFake.customers.get(774)?.last_milestone_reached).toBe(100);
    expect(console.log).not.toHaveBeenCalledWith(
      expect.stringContaining("Milestones reached"),
    );
  });
});
