/**
 * LINE 配信メッセージの Flex Message プロトタイプ（Phase 4a）。
 *
 * こめもっちブランド（SPEC 6.3）に合わせた bubble 形式の Flex Message を構築する。
 * - ベース: クリーム #FDF6E9
 * - 見出し: 温かいブラウン #8B6F47
 * - 本文: チャコール #3A2E1F
 * - CTA: ゴールド #E8A845
 *
 * 実際の送信は lib/line/send-message.ts（現在はスタブ、次回セッションで実装）。
 * 見た目の確認は /dev/message-preview で行える。
 */

// ---------------------------------------------------------------------------
// LINE Flex Message 型定義（bubble 形式、本プロジェクトで使用する範囲のみ）
// https://developers.line.biz/ja/reference/messaging-api/#flex-message
// ---------------------------------------------------------------------------

type FlexSize = "xxs" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";
type FlexSpacing = "none" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl";

export interface FlexText {
  type: "text";
  text: string;
  size?: FlexSize;
  weight?: "regular" | "bold";
  color?: string;
  wrap?: boolean;
  align?: "start" | "center" | "end";
  margin?: FlexSpacing;
}

export interface FlexButton {
  type: "button";
  style?: "primary" | "secondary" | "link";
  color?: string;
  height?: "sm" | "md";
  action: {
    type: "uri";
    label: string;
    uri: string;
  };
}

export interface FlexSeparator {
  type: "separator";
  margin?: FlexSpacing;
  color?: string;
}

export interface FlexBox {
  type: "box";
  layout: "vertical" | "horizontal" | "baseline";
  contents: FlexComponent[];
  spacing?: FlexSpacing;
  margin?: FlexSpacing;
  backgroundColor?: string;
  cornerRadius?: string;
  paddingAll?: string;
}

export type FlexComponent = FlexBox | FlexText | FlexButton | FlexSeparator;

export interface FlexBubble {
  type: "bubble";
  styles?: {
    body?: { backgroundColor?: string };
    footer?: { backgroundColor?: string };
  };
  body?: FlexBox;
  footer?: FlexBox;
}

export interface LineFlexMessage {
  type: "flex";
  altText: string;
  contents: FlexBubble;
}

// ---------------------------------------------------------------------------
// ブランドカラー（SPEC 6.3）
// ---------------------------------------------------------------------------

const COLOR = {
  cream: "#FDF6E9",
  heading: "#8B6F47",
  text: "#3A2E1F",
  cta: "#E8A845",
  separator: "#F5E6D3",
} as const;

/** 有効期限を YYYY-MM-DD（日本時間）で整形する */
function formatExpiryDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 見出し + 本文段落 + CTA ボタンという共通構造の bubble を組み立てる */
function buildBrandBubble(options: {
  title: string;
  paragraphs: string[];
  notes?: string[];
  ctaLabel: string;
  ctaUri: string;
}): FlexBubble {
  const bodyContents: FlexComponent[] = [
    {
      type: "text",
      text: options.title,
      weight: "bold",
      size: "lg",
      wrap: true,
      color: COLOR.heading,
    },
    ...options.paragraphs.map(
      (text): FlexText => ({
        type: "text",
        text,
        wrap: true,
        size: "sm",
        color: COLOR.text,
      }),
    ),
  ];

  if (options.notes && options.notes.length > 0) {
    bodyContents.push({ type: "separator", margin: "md", color: COLOR.separator });
    bodyContents.push(
      ...options.notes.map(
        (text): FlexText => ({
          type: "text",
          text,
          wrap: true,
          size: "xs",
          color: COLOR.heading,
        }),
      ),
    );
  }

  return {
    type: "bubble",
    styles: {
      body: { backgroundColor: COLOR.cream },
      footer: { backgroundColor: COLOR.cream },
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: bodyContents,
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: COLOR.cta,
          action: {
            type: "uri",
            label: options.ctaLabel,
            uri: options.ctaUri,
          },
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// 1・2. マイルストーン到達メッセージ
// ---------------------------------------------------------------------------

/**
 * マイルストーン到達のお祝いメッセージを構築する。
 * - 100個（初回）: お祝い + 感謝の文面
 * - 200個以降（リピート）: 「◯回目のプレゼントです」の文面
 */
export function buildMilestoneMessage(
  milestone: number,
  couponCode: string,
  couponUrl: string,
  expiresAt: Date,
): LineFlexMessage {
  const isFirst = milestone <= 100;
  const rewardCount = Math.max(1, Math.floor(milestone / 100));

  const title = isFirst
    ? `🎉 ${milestone}個達成おめでとうございます！`
    : `🎉 ${milestone}個達成！${rewardCount}回目のプレゼントです`;

  const paragraphs = isFirst
    ? [
        "いつもこめもっちを愛してくださって\n本当にありがとうございます💛",
        "感謝の気持ちを込めて、\n🍞パン5個プレゼントクーポン🍞\nをお届けします！",
      ]
    : [
        "リピートしてくださって\n本当にありがとうございます✨",
        "今回も🍞パン5個プレゼントクーポン🍞\nをお届けします！",
      ];

  return {
    type: "flex",
    altText: `🎉 ${milestone}個達成おめでとうございます！パン5個プレゼントクーポンをお届けします🍞`,
    contents: buildBrandBubble({
      title,
      paragraphs,
      notes: [
        `クーポンコード: ${couponCode}`,
        `有効期限：${formatExpiryDate(expiresAt)}`,
      ],
      ctaLabel: "クーポンを使う",
      ctaUri: couponUrl,
    }),
  };
}

// ---------------------------------------------------------------------------
// 3・4. 「あと少し」リマインドメッセージ
// ---------------------------------------------------------------------------

/**
 * 特典まであと少しのリマインドメッセージを構築する。
 * - remaining が 5 以下: 「次のご購入で達成できます」の文面
 * - それ以外（あと10個など）: 「ゴール目前です」の文面
 */
export function buildAlmostThereMessage(
  remaining: number,
  storeUrl: string,
): LineFlexMessage {
  const isVeryClose = remaining <= 5;

  const title = isVeryClose
    ? `🍞 あと${remaining}個で🍞5個プレゼント！`
    : `あと${remaining}個！ゴール目前です🏃‍♀️`;

  const paragraphs = isVeryClose
    ? [
        "次のご購入で達成できます✨",
        "グルテンフリーの体にやさしいこめもっち、\nぜひこの機会に！",
      ]
    : [
        `あと${remaining}個で🍞5個プレゼントに届きますよ✨`,
        "グルテンフリーの体にやさしいこめもっち、\nぜひこの機会に！",
      ];

  return {
    type: "flex",
    altText: `🍞 あと${remaining}個で🍞5個プレゼント！`,
    contents: buildBrandBubble({
      title,
      paragraphs,
      ctaLabel: "お買い物する",
      ctaUri: storeUrl,
    }),
  };
}

// ---------------------------------------------------------------------------
// 5. スタンプカード連携完了メッセージ
// ---------------------------------------------------------------------------

/** 初回 LINE 連携時のウェルカムメッセージを構築する */
export function buildWelcomeMessage(liffUrl: string): LineFlexMessage {
  return {
    type: "flex",
    altText: "🎉 スタンプカードにようこそ！購入100個ごとに🍞5個をプレゼントします",
    contents: buildBrandBubble({
      title: "🎉 スタンプカードにようこそ！",
      paragraphs: [
        "ご登録ありがとうございます💛",
        "購入100個ごとに🍞5個をプレゼントします。\nマイページからいつでも進捗を確認できますよ✨",
      ],
      ctaLabel: "スタンプカードを見る",
      ctaUri: liffUrl,
    }),
  };
}
