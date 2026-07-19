/**
 * LINE Messaging API 送信（SPEC 7.3）。
 *
 * メッセージの構築は lib/line/flex-messages.ts に実装済み。
 * 実際の送信（push API 呼び出し）は次回セッションで実装するため、
 * 現時点ではスタブ（ログ出力のみ）。
 */
import type { LineFlexMessage } from "@/lib/line/flex-messages";

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
