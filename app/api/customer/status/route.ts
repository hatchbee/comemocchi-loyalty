import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  DEV_FALLBACK_CUSTOMER,
  DEV_PRESET_CUSTOMERS,
} from "@/lib/dev/dev-presets";

export const runtime = "nodejs";

const querySchema = z.object({
  line_user_id: z.string().min(1),
});

/** customers テーブルから select するカラム */
interface CustomerStatusRow {
  total_bread_count: number;
  last_milestone_reached: number;
}

/**
 * LINE User ID から顧客の累計パン個数・最終マイルストーンを取得する API（SPEC 6.1）。
 *
 * GET /api/customer/status?line_user_id=Uxxxx
 * - 200: { totalBreadCount, lastMilestoneReached }
 * - 400: line_user_id 未指定
 * - 404: 未連携（customers に該当する line_user_id がない）
 *
 * NOTE: 現状は LIFF から渡された line_user_id をそのまま信用している。
 * 本番運用前に LIFF の ID トークン検証（SPEC 5.3）へ置き換えること。
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    line_user_id: url.searchParams.get("line_user_id") ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: "line_user_id is required" }, { status: 400 });
  }

  // ALLOW_DEV_MODE_IN_PRODUCTION=true で本番でもダミーデータを許可する
  // （デプロイ後のデザイン確認用の一時設定。LINE公開前に必ず false に戻すこと）
  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.ALLOW_DEV_MODE_IN_PRODUCTION === "true";

  // 開発モード: プリセット名（fresh / progress / near / achieved / repeater）なら
  // Supabase を参照せずダミーデータを返す（UI 確認用）
  if (isDevelopment) {
    const preset = DEV_PRESET_CUSTOMERS[parsed.data.line_user_id];
    if (preset) {
      console.log(
        `[customer/status] 開発用プリセット "${parsed.data.line_user_id}" を返します: ${preset.description}`,
      );
      return Response.json({
        totalBreadCount: preset.totalBreadCount,
        lastMilestoneReached: preset.lastMilestoneReached,
        devPreset: true,
      });
    }
  }

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("customers")
      .select("total_bread_count, last_milestone_reached")
      .eq("line_user_id", parsed.data.line_user_id)
      .maybeSingle();
    if (error) {
      throw new Error(`customers の参照に失敗: ${error.message}`);
    }

    const row = data as CustomerStatusRow | null;
    if (!row) {
      return Response.json({ error: "not_linked" }, { status: 404 });
    }

    return Response.json({
      totalBreadCount: row.total_bread_count,
      lastMilestoneReached: row.last_milestone_reached,
    });
  } catch (error) {
    // 開発モード: Supabase 未設定・接続失敗時はダミーデータでフォールバックし、
    // 環境構築なしでも UI を確認できるようにする
    if (isDevelopment) {
      console.warn(
        "[customer/status] Supabase 未設定または接続失敗のため、開発用ダミーデータでフォールバックします",
        error,
      );
      return Response.json({
        totalBreadCount: DEV_FALLBACK_CUSTOMER.totalBreadCount,
        lastMilestoneReached: DEV_FALLBACK_CUSTOMER.lastMilestoneReached,
        devFallback: true,
      });
    }
    console.error("[customer/status] 顧客状態の取得に失敗しました", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}
