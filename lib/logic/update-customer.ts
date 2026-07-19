import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShopifyOrder } from "@/types/shopify";
import { countBread } from "@/lib/logic/count-bread";
import { issueReward } from "@/lib/logic/issue-reward";

/** マイルストーンの単位（100個ごと） */
const MILESTONE_UNIT = 100;

/** customers テーブルの行（SPEC 2節） */
export interface CustomerRow {
  id: number;
  shopify_customer_id: number;
  line_user_id: string | null;
  email: string | null;
  total_bread_count: number;
  last_milestone_reached: number;
  linked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** sku_bread_map テーブルの行（select したカラムのみ） */
interface SkuBreadMapRow {
  sku: string;
  bread_count: number;
}

export type ProcessOrderResult =
  | {
      /** customer 情報がない注文（ゲスト購入等）のためカウント対象外 */
      status: "skipped_no_customer";
      shopifyOrderId: number;
    }
  | {
      /** 処理済みの注文（webhook リトライ）。加算は行わない */
      status: "already_processed";
      shopifyOrderId: number;
    }
  | {
      status: "processed";
      shopifyOrderId: number;
      breadAdded: number;
      totalBreadCount: number;
      /** このオーダーで新たに到達したマイルストーン（昇順）。未到達なら空配列 */
      milestonesReached: number[];
      unmappedSkus: string[];
    };

/**
 * orders/paid 注文を処理して customers を更新する（SPEC 4.2 の 3〜7）。
 *
 * 冪等性（SPEC 4.3）:
 * - まず orders_processed の存在チェックで処理済み注文を弾く
 * - さらに orders_processed への INSERT を customers 更新の「前」に行い、
 *   PRIMARY KEY 制約（23505）でリトライ競合時の二重加算を防ぐ（冪等ロック）
 * - supabase-js は複数文トランザクションをサポートしないため、
 *   customers 更新に失敗した場合は orders_processed を補償削除して例外を投げ、
 *   500 応答 → Shopify のリトライに委ねる
 */
export async function processPaidOrder(
  supabase: SupabaseClient,
  order: ShopifyOrder,
): Promise<ProcessOrderResult> {
  // ゲスト購入・POS 注文などは顧客を特定できないためスキップ（200 を返しリトライさせない）
  if (!order.customer) {
    console.warn(
      `[webhook] order=${order.id}: customer 情報がないためカウント対象外としてスキップします`,
    );
    return { status: "skipped_no_customer", shopifyOrderId: order.id };
  }
  const shopifyCustomerId = order.customer.id;

  // --- (SPEC 4.2-3) 冪等性チェック ---
  const { data: alreadyProcessed, error: checkError } = await supabase
    .from("orders_processed")
    .select("shopify_order_id")
    .eq("shopify_order_id", order.id)
    .maybeSingle();
  if (checkError) {
    throw new Error(`orders_processed の参照に失敗: ${checkError.message}`);
  }
  if (alreadyProcessed) {
    return { status: "already_processed", shopifyOrderId: order.id };
  }

  // --- (SPEC 4.2-4) sku_bread_map と突合してパン個数を集計 ---
  const skus = [
    ...new Set(
      order.line_items
        .map((item) => item.sku?.trim())
        .filter((sku): sku is string => Boolean(sku)),
    ),
  ];
  const skuMap = new Map<string, number>();
  if (skus.length > 0) {
    const { data: mapRows, error: mapError } = await supabase
      .from("sku_bread_map")
      .select("sku, bread_count")
      .in("sku", skus);
    if (mapError) {
      throw new Error(`sku_bread_map の参照に失敗: ${mapError.message}`);
    }
    for (const row of (mapRows ?? []) as SkuBreadMapRow[]) {
      skuMap.set(row.sku, row.bread_count);
    }
  }

  const { total: breadAdded, unmappedSkus } = countBread(order.line_items, skuMap);
  if (unmappedSkus.length > 0) {
    // 非対象商品（タビスマ等）は 0 個として扱う（SPEC 4.4）
    console.warn(
      `[webhook] order=${order.id}: sku_bread_map 未登録の SKU を 0 個として扱います: ${unmappedSkus.join(", ")}`,
    );
  }

  // --- (SPEC 4.2-7 / 4.3) orders_processed を先に INSERT して冪等ロックにする ---
  const { error: insertError } = await supabase.from("orders_processed").insert({
    shopify_order_id: order.id,
    shopify_customer_id: shopifyCustomerId,
    bread_count_added: breadAdded,
  });
  if (insertError) {
    // 23505 = PostgreSQL unique_violation。並行リトライで既に処理済み
    if (insertError.code === "23505") {
      return { status: "already_processed", shopifyOrderId: order.id };
    }
    throw new Error(`orders_processed の挿入に失敗: ${insertError.message}`);
  }

  try {
    // --- (SPEC 4.2-5) customers を UPSERT ---
    const { data: existingData, error: selectError } = await supabase
      .from("customers")
      .select("*")
      .eq("shopify_customer_id", shopifyCustomerId)
      .maybeSingle();
    if (selectError) {
      throw new Error(`customers の参照に失敗: ${selectError.message}`);
    }
    const existing = existingData as CustomerRow | null;

    const previousTotal = existing?.total_bread_count ?? 0;
    const lastMilestone = existing?.last_milestone_reached ?? 0;
    const totalBreadCount = previousTotal + breadAdded;

    // --- (SPEC 4.2-6) マイルストーン計算 ---
    // 1回の注文で複数マイルストーンを跨いだ場合（例: 90個 → 210個）、
    // 跨いだすべての 100 の倍数（100, 200, ...）を昇順で発火対象にする
    const milestonesReached: number[] = [];
    for (
      let milestone =
        Math.floor(lastMilestone / MILESTONE_UNIT) * MILESTONE_UNIT +
        MILESTONE_UNIT;
      milestone <= totalBreadCount;
      milestone += MILESTONE_UNIT
    ) {
      milestonesReached.push(milestone);
    }

    // email は null で既存値を上書きしないようフォールバックする
    const email = order.customer.email ?? order.email ?? existing?.email ?? null;

    // last_milestone_reached は最終的に到達した最高値に更新する
    const newLastMilestone =
      milestonesReached.length > 0
        ? milestonesReached[milestonesReached.length - 1]
        : lastMilestone;

    const { error: upsertError } = await supabase.from("customers").upsert(
      {
        shopify_customer_id: shopifyCustomerId,
        email,
        total_bread_count: totalBreadCount,
        last_milestone_reached: newLastMilestone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopify_customer_id" },
    );
    if (upsertError) {
      throw new Error(`customers の UPSERT に失敗: ${upsertError.message}`);
    }

    if (milestonesReached.length > 0) {
      console.log(
        `🎉 Milestones reached: [${milestonesReached.join(", ")}] for customer ${shopifyCustomerId}`,
      );
      for (const milestone of milestonesReached) {
        console.log(
          `🎉 [milestone] customer=${shopifyCustomerId} がマイルストーン ${milestone} 個に到達しました` +
            `（累計 ${totalBreadCount} 個）`,
        );
        // 特典発行（Phase 4）。Shopify Admin API・LINE 送信が未実装の間は
        // issueReward 内でスキップされる。発行失敗で注文処理は失敗させない
        // （注文自体は処理済みのため、500 でリトライさせても already_processed になるだけ）
        try {
          const rewardResult = await issueReward({
            supabase,
            shopifyCustomerId,
            lineUserId: existing?.line_user_id ?? null,
            milestone,
            totalBreadCount,
          });
          console.log(
            `[reward] customer=${shopifyCustomerId} milestone=${milestone}: ${rewardResult.status}`,
          );
        } catch (error) {
          console.error(
            `[reward] customer=${shopifyCustomerId} milestone=${milestone} の特典発行で予期しないエラー`,
            error,
          );
        }
      }
    }

    return {
      status: "processed",
      shopifyOrderId: order.id,
      breadAdded,
      totalBreadCount,
      milestonesReached,
      unmappedSkus,
    };
  } catch (error) {
    // customers 更新に失敗した場合は冪等ロックを解除（補償削除）してリトライ可能にする
    const { error: deleteError } = await supabase
      .from("orders_processed")
      .delete()
      .eq("shopify_order_id", order.id);
    if (deleteError) {
      console.error(
        `[webhook] order=${order.id}: orders_processed の補償削除に失敗しました。` +
          `このオーダーは customers 未反映のまま処理済み扱いになるため手動確認が必要です: ${deleteError.message}`,
      );
    }
    throw error;
  }
}
