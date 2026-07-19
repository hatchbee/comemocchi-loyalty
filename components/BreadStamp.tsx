interface BreadStampProps {
  /** 獲得済みスタンプかどうか（SPEC 6.3: 獲得済は焼き色、未獲得はライトベージュ） */
  filled: boolean;
}

/**
 * スタンプ1個分の丸みのあるパンイラスト（SVG）。
 * 10×10 グリッドのセルとして使用する。
 */
export function BreadStamp({ filled }: BreadStampProps) {
  // SPEC 6.3 カラーパレット: 塗り #C08856 / 未獲得 #EFE4D2
  const bun = filled ? "#C08856" : "#EFE4D2";
  const crumb = filled ? "#8B6F47" : "#DDCEB6";

  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden="true">
      {/* パン本体（丸いドーム型） */}
      <path
        d="M5 20.5C5 13.6 9.9 8.5 16 8.5s11 5.1 11 12a4.5 4.5 0 0 1-4.5 4.5h-13A4.5 4.5 0 0 1 5 20.5Z"
        fill={bun}
      />
      {/* クープ（表面の切れ込み） */}
      <path
        d="M11.2 16.2l2.6-3.4M15.4 14.6l2.6-3.4M19.6 16.2l2.6-3.4"
        stroke={crumb}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
        transform="translate(-1.2 2)"
      />
    </svg>
  );
}
