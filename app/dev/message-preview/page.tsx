import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  buildAlmostThereMessage,
  buildMilestoneMessage,
  buildWelcomeMessage,
} from "@/lib/line/flex-messages";
import { FlexMessagePreview } from "@/components/FlexMessagePreview";

export const metadata: Metadata = {
  title: "Flex Message プレビュー（開発用）",
};

/**
 * LINE Flex Message の見た目を確認する開発用ページ。
 * http://localhost:3000/dev/message-preview
 *
 * 本番ビルドでは非表示（ALLOW_DEV_MODE_IN_PRODUCTION=true のときのみ表示）。
 */
export default function MessagePreviewPage() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_DEV_MODE_IN_PRODUCTION !== "true"
  ) {
    notFound();
  }

  const shopUrl = "https://komemocchi.example.myshopify.com";
  const liffUrl = "https://liff.line.me/0000000000-xxxxxxxx";
  const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

  const samples = [
    {
      label: "1. マイルストーン到達（100個・初回）",
      message: buildMilestoneMessage(
        100,
        "KOMEMOCCHI-M100-1234567890-a3f9k2p1",
        `${shopUrl}/discount/KOMEMOCCHI-M100-1234567890-a3f9k2p1?redirect=/`,
        expiresAt,
      ),
    },
    {
      label: "2. マイルストーン到達（200個・リピート）",
      message: buildMilestoneMessage(
        200,
        "KOMEMOCCHI-M200-1234567890-b7c2m4x9",
        `${shopUrl}/discount/KOMEMOCCHI-M200-1234567890-b7c2m4x9?redirect=/`,
        expiresAt,
      ),
    },
    {
      label: "3. 「あと5個」リマインド",
      message: buildAlmostThereMessage(5, shopUrl),
    },
    {
      label: "4. 「あと10個」リマインド",
      message: buildAlmostThereMessage(10, shopUrl),
    },
    {
      label: "5. スタンプカード連携完了（ウェルカム）",
      message: buildWelcomeMessage(liffUrl),
    },
  ];

  return (
    // LINE のトーク画面風の背景色でプレビューする
    <main className="min-h-dvh bg-[#7494C0] px-6 py-8">
      <h1 className="text-xl font-bold text-white">
        LINE Flex Message プレビュー（開発用）
      </h1>
      <p className="mt-1 text-sm text-white/80">
        Phase 4 で配信するメッセージの見た目確認用ページです。実際の送信は行いません。
      </p>

      <div className="mt-8 flex flex-wrap gap-10">
        {samples.map((sample) => (
          <section key={sample.label}>
            <h2 className="mb-3 text-sm font-bold text-white">
              {sample.label}
            </h2>
            <FlexMessagePreview message={sample.message} />
          </section>
        ))}
      </div>
    </main>
  );
}
