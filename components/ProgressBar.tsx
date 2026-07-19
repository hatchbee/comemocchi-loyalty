interface ProgressBarProps {
  /** 現在値（0〜max） */
  value: number;
  /** 最大値 */
  max: number;
}

/**
 * 周回内の進捗を表す横バー（SPEC 6.1）。
 * トラック: ライトベージュ / 塗り: 焼き色ブラウン→ゴールドのグラデーション
 */
export function ProgressBar({ value, max }: ProgressBarProps) {
  const percent =
    max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div
      className="h-3.5 w-full overflow-hidden rounded-full bg-[#EFE4D2]"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={`${max}個中${value}個`}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#C08856] to-[#E8A845] transition-[width] duration-700 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
