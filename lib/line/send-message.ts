/**
 * LINE Messaging API 通知（SPEC 7.3）。
 *
 * Flex Message の構築は実装済み。実際の送信（push API 呼び出し）は
 * 次回セッションで実装するため、現時点ではスタブ（ログ出力のみ）。
 */

/** LINE Flex Message（push API に渡す形式の最小型定義） */
export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

export interface MilestoneCouponMessageParams {
  /** 到達したマイルストーン（100, 200, ...） */
  milestone: number;
  couponCode: string;
  /** クーポン適用URL（例: https://xxx.myshopify.com/discount/CODE?redirect=/collections/all） */
  couponUrl: string;
  /** クーポン有効期限 */
  expiresAt: Date;
}

/** 有効期限を YYYY-MM-DD（日本時間）で整形する */
function formatExpiryDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * マイルストーン到達のお祝い Flex Message を構築する（SPEC 7.3 の文面準拠）。
 * 純粋関数なので単体テスト可能。
 */
export function buildMilestoneCouponFlexMessage(
  params: MilestoneCouponMessageParams,
): LineFlexMessage {
  const expiry = formatExpiryDate(params.expiresAt);

  return {
    type: "flex",
    altText: `🎉 ${params.milestone}個達成おめでとうございます！パン5個プレゼントクーポンをお届けします🍞`,
    contents: {
      type: "bubble",
      styles: {
        body: { backgroundColor: "#FDF6E9" },
        footer: { backgroundColor: "#FDF6E9" },
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: `🎉 ${params.milestone}個達成おめでとうございます！`,
            weight: "bold",
            size: "lg",
            wrap: true,
            color: "#3A2E1F",
          },
          {
            type: "text",
            text: "いつもこめもっちを愛してくださって\n本当にありがとうございます💛",
            wrap: true,
            size: "sm",
            color: "#3A2E1F",
          },
          {
            type: "text",
            text: "感謝の気持ちを込めて、\n🍞 パン5個プレゼントクーポン 🍞\nをお届けします！",
            wrap: true,
            size: "sm",
            color: "#3A2E1F",
          },
          {
            type: "text",
            text: `クーポンコード: ${params.couponCode}`,
            wrap: true,
            size: "xs",
            color: "#8B6F47",
          },
          {
            type: "text",
            text: `有効期限：${expiry}`,
            size: "xs",
            color: "#8B6F47",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#E8A845",
            action: {
              type: "uri",
              label: "クーポンを使う",
              uri: params.couponUrl,
            },
          },
        ],
      },
    },
  };
}

export interface SendLineMessageResult {
  /** 実際に送信できたか（スタブ実装中は常に false） */
  delivered: boolean;
  reason?: string;
}

/**
 * LINE push メッセージ送信（スタブ）。
 *
 * TODO(次回セッション): LINE Messaging API
 * `POST https://api.line.me/v2/bot/message/push` を実装する。
 * 送信失敗時は rewards_issued.line_notified_at を NULL のままにし、
 * cron で再送する（SPEC 7.4）。
 */
export async function sendLineMessage(
  lineUserId: string,
  messages: LineFlexMessage[],
): Promise<SendLineMessageResult> {
  console.log(
    `[line:stub] 送信スタブ: to=${lineUserId} altText="${messages[0]?.altText ?? ""}"（実送信は未実装）`,
  );
  return { delivered: false, reason: "not_implemented" };
}
