import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  buildAlmostThereMessage,
  buildMilestoneMessage,
  buildWelcomeMessage,
  type LineFlexMessage,
} from "@/lib/line/flex-messages";

// ---------------------------------------------------------------------------
// LINE Flex Message（bubble形式）の構造検証用 zod スキーマ
// ---------------------------------------------------------------------------

const flexComponentSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      text: z.string().min(1),
      size: z.enum(["xxs", "xs", "sm", "md", "lg", "xl", "xxl"]).optional(),
      weight: z.enum(["regular", "bold"]).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      wrap: z.boolean().optional(),
      align: z.enum(["start", "center", "end"]).optional(),
      margin: z.enum(["none", "xs", "sm", "md", "lg", "xl", "xxl"]).optional(),
    }),
    z.object({
      type: z.literal("button"),
      style: z.enum(["primary", "secondary", "link"]).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      height: z.enum(["sm", "md"]).optional(),
      action: z.object({
        type: z.literal("uri"),
        label: z.string().min(1).max(40),
        uri: z.string().url(),
      }),
    }),
    z.object({
      type: z.literal("separator"),
      margin: z.enum(["none", "xs", "sm", "md", "lg", "xl", "xxl"]).optional(),
      color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    }),
    z.object({
      type: z.literal("box"),
      layout: z.enum(["vertical", "horizontal", "baseline"]),
      contents: z.array(z.lazy(() => flexComponentSchema)),
      spacing: z.enum(["none", "xs", "sm", "md", "lg", "xl", "xxl"]).optional(),
      margin: z.enum(["none", "xs", "sm", "md", "lg", "xl", "xxl"]).optional(),
      backgroundColor: z.string().optional(),
      cornerRadius: z.string().optional(),
      paddingAll: z.string().optional(),
    }),
  ]),
);

const flexMessageSchema = z.object({
  type: z.literal("flex"),
  // altText は LINE 仕様で最大400文字
  altText: z.string().min(1).max(400),
  contents: z.object({
    type: z.literal("bubble"),
    styles: z
      .object({
        body: z.object({ backgroundColor: z.string() }).optional(),
        footer: z.object({ backgroundColor: z.string() }).optional(),
      })
      .optional(),
    body: flexComponentSchema.optional(),
    footer: flexComponentSchema.optional(),
  }),
});

const EXPIRES_AT = new Date("2026-09-17T00:00:00+09:00");
const COUPON_URL =
  "https://example.myshopify.com/discount/KOMEMOCCHI-M100-111-a3f9k2p1?redirect=/";
const STORE_URL = "https://example.myshopify.com";
const LIFF_URL = "https://liff.line.me/0000000000-xxxxxxxx";

/** 全メッセージ共通の検証: スキーマ準拠 + ブランドカラーの CTA */
function expectValidBrandMessage(message: LineFlexMessage): void {
  expect(() => flexMessageSchema.parse(message)).not.toThrow();
  const json = JSON.stringify(message);
  // 見出し: 温かいブラウン / CTA: ゴールド
  expect(json).toContain("#8B6F47");
  expect(json).toContain("#E8A845");
}

describe("buildMilestoneMessage", () => {
  it("100個到達（初回）: LINE仕様準拠のbubbleで、お祝い文面・クーポン・期限を含む", () => {
    const message = buildMilestoneMessage(
      100,
      "KOMEMOCCHI-M100-111-a3f9k2p1",
      COUPON_URL,
      EXPIRES_AT,
    );
    expectValidBrandMessage(message);

    const json = JSON.stringify(message.contents);
    expect(json).toContain("100個達成おめでとうございます");
    expect(json).toContain("いつもこめもっちを愛してくださって");
    expect(json).toContain("パン5個プレゼントクーポン");
    expect(json).toContain("KOMEMOCCHI-M100-111-a3f9k2p1");
    expect(json).toContain("有効期限：2026-09-17");
    expect(json).toContain("クーポンを使う");
    expect(json).toContain(COUPON_URL);
  });

  it("200個到達（リピート）: 「2回目のプレゼントです」の文面になる", () => {
    const message = buildMilestoneMessage(
      200,
      "KOMEMOCCHI-M200-111-b7c2m4x9",
      COUPON_URL,
      EXPIRES_AT,
    );
    expectValidBrandMessage(message);

    const json = JSON.stringify(message.contents);
    expect(json).toContain("200個達成！2回目のプレゼントです");
    expect(json).toContain("リピートしてくださって");
    expect(json).not.toContain("いつもこめもっちを愛してくださって");
  });

  it("300個到達: 「3回目のプレゼントです」になる", () => {
    const message = buildMilestoneMessage(
      300,
      "KOMEMOCCHI-M300-111-c8d3n5y0",
      COUPON_URL,
      EXPIRES_AT,
    );
    expect(JSON.stringify(message.contents)).toContain(
      "300個達成！3回目のプレゼントです",
    );
  });
});

describe("buildAlmostThereMessage", () => {
  it("あと5個: 「次のご購入で達成できます」の文面 + ストアCTA", () => {
    const message = buildAlmostThereMessage(5, STORE_URL);
    expectValidBrandMessage(message);

    const json = JSON.stringify(message.contents);
    expect(json).toContain("あと5個で🍞5個プレゼント！");
    expect(json).toContain("次のご購入で達成できます");
    expect(json).toContain("グルテンフリーの体にやさしいこめもっち");
    expect(json).toContain("お買い物する");
    expect(json).toContain(STORE_URL);
  });

  it("あと10個: 「ゴール目前です」の文面になる", () => {
    const message = buildAlmostThereMessage(10, STORE_URL);
    expectValidBrandMessage(message);

    const json = JSON.stringify(message.contents);
    expect(json).toContain("あと10個！ゴール目前です");
    expect(json).not.toContain("次のご購入で達成できます");
  });
});

describe("buildWelcomeMessage", () => {
  it("連携完了: ようこそ文面 + LIFFへのCTA", () => {
    const message = buildWelcomeMessage(LIFF_URL);
    expectValidBrandMessage(message);

    const json = JSON.stringify(message.contents);
    expect(json).toContain("スタンプカードにようこそ！");
    expect(json).toContain("購入100個ごとに🍞5個をプレゼントします");
    expect(json).toContain("スタンプカードを見る");
    expect(json).toContain(LIFF_URL);
  });
});
