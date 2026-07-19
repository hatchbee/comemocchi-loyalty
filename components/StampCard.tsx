import { calcStampProgress, STAMP_CARD_SIZE } from "@/lib/logic/stamp-progress";
import { BreadStamp } from "@/components/BreadStamp";
import { ProgressBar } from "@/components/ProgressBar";

interface StampCardProps {
  /** 累計購入パン個数 */
  totalBreadCount: number;
  /** 「もっと買う」CTA のリンク先（未設定なら null でボタン非表示） */
  shopUrl: string | null;
}

/**
 * スタンプカード本体（SPEC 6.2 の表示要素をすべて含む）。
 * - 周回内の進捗（例: 73/100個）
 * - 10×10 のスタンプグリッド
 * - 「あと◯個で🍞5個プレゼント！」
 * - 累計購入個数と達成回数
 * - 「もっと買う」CTA
 */
export function StampCard({ totalBreadCount, shopUrl }: StampCardProps) {
  const { total, current, remaining, timesAchieved } =
    calcStampProgress(totalBreadCount);

  return (
    <div className="rounded-3xl border border-[#F5E6D3] bg-white/80 p-5 shadow-sm">
      {/* 周回内の進捗 */}
      <p className="text-center text-sm font-medium text-[#8B6F47]">
        いまのスタンプ
      </p>
      <p className="mt-1 text-center font-[family-name:var(--font-zen-maru)]">
        <span className="text-6xl font-bold leading-none text-[#3A2E1F]">
          {current}
        </span>
        <span className="ml-1 text-xl font-bold text-[#8B6F47]">
          /{STAMP_CARD_SIZE}個
        </span>
      </p>

      <div className="mt-4">
        <ProgressBar value={current} max={STAMP_CARD_SIZE} />
      </div>

      {/* あと◯個メッセージ */}
      <p className="mt-4 text-center font-[family-name:var(--font-zen-maru)] text-base font-bold text-[#3A2E1F]">
        あと
        <span className="mx-1 text-2xl text-[#E8A845]">{remaining}</span>
        個で 🍞5個プレゼント！
      </p>

      {/* 10×10 スタンプグリッド */}
      <div
        className="mt-5 grid grid-cols-10 gap-1"
        role="img"
        aria-label={`スタンプカード: ${STAMP_CARD_SIZE}個中${current}個獲得済み`}
      >
        {Array.from({ length: STAMP_CARD_SIZE }, (_, index) => (
          <div key={index} className="aspect-square">
            <BreadStamp filled={index < current} />
          </div>
        ))}
      </div>

      {/* 累計と達成回数 */}
      <div className="mt-5 rounded-2xl bg-[#F5E6D3] px-4 py-3 text-center">
        <p className="text-sm text-[#3A2E1F]">
          累計 <span className="font-bold">{total}</span> 個のパンをお買い上げいただきました💛
        </p>
        {timesAchieved > 0 && (
          <p className="mt-1 font-[family-name:var(--font-zen-maru)] text-sm font-bold text-[#8B6F47]">
            ✨ これまで {timesAchieved} 回達成！ ✨
          </p>
        )}
      </div>

      {/* CTA */}
      {shopUrl && (
        <a
          href={shopUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 block rounded-full bg-[#E8A845] py-3.5 text-center font-[family-name:var(--font-zen-maru)] text-base font-bold text-white shadow-md transition-transform active:scale-95"
        >
          🍞 もっと買う
        </a>
      )}
    </div>
  );
}
