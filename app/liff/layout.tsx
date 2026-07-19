import type { Metadata } from "next";
import { Zen_Maru_Gothic, Noto_Sans_JP } from "next/font/google";

// SPEC 6.3: 見出しは Zen Maru Gothic（丸ゴシック）、本文は Noto Sans JP
const zenMaruGothic = Zen_Maru_Gothic({
  weight: ["500", "700", "900"],
  subsets: ["latin"],
  variable: "--font-zen-maru",
  display: "swap",
});

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  variable: "--font-noto-sans-jp",
  display: "swap",
});

export const metadata: Metadata = {
  title: "こめもっち スタンプカード",
  description: "こめもっちのパン購入スタンプカードです🍞",
};

export default function LiffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${zenMaruGothic.variable} ${notoSansJp.variable} min-h-dvh bg-[#FDF6E9] font-[family-name:var(--font-noto-sans-jp)] text-[#3A2E1F]`}
    >
      {children}
    </div>
  );
}
