import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

// route.ts が使う Supabase クライアントをフェイクに差し替える
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => currentFake.asClient(),
}));

import { GET } from "@/app/api/customer/status/route";

let currentFake: FakeSupabase;

function makeRequest(query: string): Request {
  return new Request(`http://localhost:3000/api/customer/status${query}`);
}

beforeEach(() => {
  currentFake = new FakeSupabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/customer/status", () => {
  it("連携済み顧客 → 200 で累計と最終マイルストーンを返す", async () => {
    currentFake.seedCustomer({
      shopify_customer_id: 111,
      line_user_id: "U-test-dev-001",
      total_bread_count: 173,
      last_milestone_reached: 100,
    });

    const response = await GET(makeRequest("?line_user_id=U-test-dev-001"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      totalBreadCount: 173,
      lastMilestoneReached: 100,
    });
  });

  it("未連携の LINE User ID → 404 not_linked", async () => {
    const response = await GET(makeRequest("?line_user_id=U-unknown"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_linked" });
  });

  it("line_user_id 未指定 → 400", async () => {
    const response = await GET(makeRequest(""));
    expect(response.status).toBe(400);
  });

  it("line_user_id が空文字 → 400", async () => {
    const response = await GET(makeRequest("?line_user_id="));
    expect(response.status).toBe(400);
  });
});
