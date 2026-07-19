import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./helpers/fake-supabase";

// route.ts が使う Supabase クライアントをフェイクに差し替える
// supabaseAvailable=false で「環境変数未設定（接続失敗）」を再現できる
vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => {
    if (!supabaseAvailable) {
      throw new Error("環境変数 NEXT_PUBLIC_SUPABASE_URL が設定されていません");
    }
    return currentFake.asClient();
  },
}));

import { GET } from "@/app/api/customer/status/route";

let currentFake: FakeSupabase;
let supabaseAvailable = true;

function makeRequest(query: string): Request {
  return new Request(`http://localhost:3000/api/customer/status${query}`);
}

beforeEach(() => {
  currentFake = new FakeSupabase();
  supabaseAvailable = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
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

describe("GET /api/customer/status（開発モードのダミーデータ）", () => {
  it.each([
    ["fresh", 0, 0],
    ["progress", 47, 0],
    ["near", 95, 0],
    ["achieved", 100, 100],
    ["repeater", 273, 200],
  ])(
    "開発モードでプリセット %s → 累計%i個を返す（Supabase不要）",
    async (preset, total, milestone) => {
      vi.stubEnv("NODE_ENV", "development");
      supabaseAvailable = false; // Supabase 未設定でも動くことの確認

      const response = await GET(makeRequest(`?line_user_id=${preset}`));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        totalBreadCount: total,
        lastMilestoneReached: milestone,
        devPreset: true,
      });
    },
  );

  it("開発モードで Supabase 接続失敗 → フォールバックのダミーデータ（累計73個）", async () => {
    vi.stubEnv("NODE_ENV", "development");
    supabaseAvailable = false;

    const response = await GET(makeRequest("?line_user_id=U-real-user"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      totalBreadCount: 73,
      lastMilestoneReached: 0,
      devFallback: true,
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("フォールバック"),
      expect.anything(),
    );
  });

  it("開発モードでも Supabase に顧客がいれば DB の値を返す", async () => {
    vi.stubEnv("NODE_ENV", "development");
    currentFake.seedCustomer({
      shopify_customer_id: 222,
      line_user_id: "U-real-user",
      total_bread_count: 150,
      last_milestone_reached: 100,
    });

    const response = await GET(makeRequest("?line_user_id=U-real-user"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      totalBreadCount: 150,
      lastMilestoneReached: 100,
    });
  });

  it("本番モードではプリセット名も通常の LINE User ID として扱う（未連携なら404）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await GET(makeRequest("?line_user_id=fresh"));
    expect(response.status).toBe(404);
  });

  it("本番モードでは Supabase 接続失敗 → 500（フォールバックしない）", async () => {
    vi.stubEnv("NODE_ENV", "production");
    supabaseAvailable = false;
    const response = await GET(makeRequest("?line_user_id=U-real-user"));
    expect(response.status).toBe(500);
  });
});
