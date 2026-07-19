import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createMilestoneDiscount,
  NotImplementedError,
} from "@/lib/shopify/create-discount";
import {
  buildMilestoneCouponFlexMessage,
  sendLineMessage,
} from "@/lib/line/send-message";

/** クーポン有効期限（発行から60日、SPEC 7.2） */
const COUPON_VALID_DAYS = 60;

/**
 * クーポンコードを生成する（SPEC 7.2）。
 * 形式: KOMEMOCCHI-M{milestone}-{shopify_customer_id}-{random8chars}
 * random8chars は推測困難性確保のため crypto の乱数を使う。
 */
export function generateCouponCode(
  milestone: number,
  shopifyCustomerId: number,
): string {
  const random = randomBytes(8)
    .toString("base64url")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8)
    .padEnd(8, "0");
  return `KOMEMOCCHI-M${milestone}-${shopifyCustomerId}-${random}`;
}

/** クーポン適用URL（SPEC 7.2: discount適用URLを直接送る方式） */
function buildCouponUrl(couponCode: string): string {
  const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
  if (!shopDomain) {
    return `https://example.myshopify.com/discount/${couponCode}?redirect=/collections/all`;
  }
  return `https://${shopDomain}/discount/${couponCode}?redirect=/collections/all`;
}

export interface IssueRewardParams {
  supabase: SupabaseClient;
  shopifyCustomerId: number;
  /** LINE連携済みなら LINE User ID、未連携なら null（通知はスキップ） */
  lineUserId: string | null;
  /** 到達したマイルストーン（100, 200, ...） */
  milestone: number;
  totalBreadCount: number;
}

export type IssueRewardResult =
  | {
      /** このマイルストーンは発行済み（rewards_issued の UNIQUE 制約） */
      status: "already_issued";
    }
  | {
      /** Shopify Admin API 未実装のためスキップ（予約は補償削除済み） */
      status: "skipped_not_implemented";
      couponCode: string;
    }
  | {
      /** クーポン発行失敗（予約は補償削除済み、ログ出力済み） */
      status: "failed";
    }
  | {
      status: "issued";
      couponCode: string;
      lineNotified: boolean;
    };

/**
 * マイルストーン到達時の特典発行オーケストレーション（SPEC 7.1 issue-reward）。
 *
 * 処理順:
 * 1. rewards_issued に予約 INSERT（UNIQUE(shopify_customer_id, milestone) で二重発行防止）
 * 2. Shopify Admin API でクーポン発行 ← ⚠️ 現在はスタブ（NotImplementedError）
 * 3. price_rule_id / discount_code_id を rewards_issued に記録
 * 4. LINE に Flex Message 通知 ← ⚠️ 現在は送信スタブ
 *    送信成功時のみ line_notified_at を記録（失敗分は cron 再送、SPEC 7.4）
 *
 * ステップ2が失敗した場合は予約を補償削除し、将来のリトライで再発行できるようにする。
 * 呼び出し側（webhook）では、この関数の失敗で注文処理全体を失敗させないこと。
 */
export async function issueReward(
  params: IssueRewardParams,
): Promise<IssueRewardResult> {
  const { supabase, shopifyCustomerId, lineUserId, milestone } = params;
  const couponCode = generateCouponCode(milestone, shopifyCustomerId);
  const expiresAt = new Date(
    Date.now() + COUPON_VALID_DAYS * 24 * 60 * 60 * 1000,
  );

  // --- 1. 予約 INSERT（1顧客1マイルストーン1回限りの担保） ---
  const { error: insertError } = await supabase.from("rewards_issued").insert({
    shopify_customer_id: shopifyCustomerId,
    milestone,
    coupon_code: couponCode,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return { status: "already_issued" };
    }
    console.error(
      `[reward] rewards_issued の挿入に失敗: customer=${shopifyCustomerId} milestone=${milestone}: ${insertError.message}`,
    );
    return { status: "failed" };
  }

  // 予約の補償削除（クーポン発行に失敗したときに呼ぶ）
  const deleteReservation = async (): Promise<void> => {
    const { error: deleteError } = await supabase
      .from("rewards_issued")
      .delete()
      .match({ shopify_customer_id: shopifyCustomerId, milestone });
    if (deleteError) {
      console.error(
        `[reward] rewards_issued の補償削除に失敗: customer=${shopifyCustomerId} milestone=${milestone}。` +
          `クーポン未発行のまま発行済み扱いになるため手動確認が必要です: ${deleteError.message}`,
      );
    }
  };

  // --- 2. Shopify Admin API でクーポン発行（現在はスタブ） ---
  let priceRuleId: number;
  let discountCodeId: number;
  try {
    const discount = await createMilestoneDiscount({
      couponCode,
      milestone,
      shopifyCustomerId,
      expiresAt,
    });
    priceRuleId = discount.priceRuleId;
    discountCodeId = discount.discountCodeId;
  } catch (error) {
    await deleteReservation();
    if (error instanceof NotImplementedError) {
      console.warn(
        `[reward] customer=${shopifyCustomerId} milestone=${milestone}: ` +
          `Shopify Admin API 未実装のためクーポン発行をスキップしました（コード候補: ${couponCode}）`,
      );
      return { status: "skipped_not_implemented", couponCode };
    }
    console.error(
      `[reward] クーポン発行に失敗: customer=${shopifyCustomerId} milestone=${milestone}`,
      error,
    );
    return { status: "failed" };
  }

  // --- 3. price_rule_id / discount_code_id を記録 ---
  const { error: updateError } = await supabase
    .from("rewards_issued")
    .update({ price_rule_id: priceRuleId, discount_code_id: discountCodeId })
    .match({ shopify_customer_id: shopifyCustomerId, milestone });
  if (updateError) {
    // クーポン自体は発行済みなので予約は消さない。ID未記録はログで追跡
    console.error(
      `[reward] price_rule_id の記録に失敗: customer=${shopifyCustomerId} milestone=${milestone}: ${updateError.message}`,
    );
  }

  // --- 4. LINE 通知（現在は送信スタブ） ---
  let lineNotified = false;
  if (lineUserId) {
    const message = buildMilestoneCouponFlexMessage({
      milestone,
      couponCode,
      couponUrl: buildCouponUrl(couponCode),
      expiresAt,
    });
    const sendResult = await sendLineMessage(lineUserId, [message]);
    if (sendResult.delivered) {
      const { error: notifyError } = await supabase
        .from("rewards_issued")
        .update({ line_notified_at: new Date().toISOString() })
        .match({ shopify_customer_id: shopifyCustomerId, milestone });
      if (notifyError) {
        console.error(
          `[reward] line_notified_at の記録に失敗: ${notifyError.message}`,
        );
      } else {
        lineNotified = true;
      }
    }
    // 未送信分は line_notified_at が NULL のまま → cron で再送（SPEC 7.4、Phase 4 で実装）
  } else {
    console.warn(
      `[reward] customer=${shopifyCustomerId} は LINE 未連携のため通知をスキップしました（milestone=${milestone}）`,
    );
  }

  return { status: "issued", couponCode, lineNotified };
}
