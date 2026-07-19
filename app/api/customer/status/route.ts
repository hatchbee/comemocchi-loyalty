import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/server";

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
    console.error("[customer/status] 顧客状態の取得に失敗しました", error);
    return Response.json({ error: "internal server error" }, { status: 500 });
  }
}
