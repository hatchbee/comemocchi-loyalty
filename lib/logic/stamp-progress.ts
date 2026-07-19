/** マイルストーンの単位（100個ごと） */
export const STAMP_CARD_SIZE = 100;

export interface StampProgress {
  /** 累計購入個数（0未満・小数は正規化済み） */
  total: number;
  /** 今の周回内での進捗（0〜99） */
  current: number;
  /** 次の特典まであと何個か（1〜100） */
  remaining: number;
  /** これまでの達成回数（100個到達ごとに+1） */
  timesAchieved: number;
}

/**
 * 累計購入個数からスタンプカードの表示に必要な進捗情報を計算する（SPEC 6.2）。
 *
 * 例:
 * - total=73  → current=73, remaining=27, timesAchieved=0
 * - total=107 → current=7,  remaining=93, timesAchieved=1
 * - total=100 → current=0,  remaining=100, timesAchieved=1（新しい周回の始まり）
 */
export function calcStampProgress(totalBreadCount: number): StampProgress {
  // 不正値（負数・小数・NaN）は 0 に丸めて表示崩れを防ぐ
  const total = Number.isFinite(totalBreadCount)
    ? Math.max(0, Math.floor(totalBreadCount))
    : 0;

  const timesAchieved = Math.floor(total / STAMP_CARD_SIZE);
  const current = total % STAMP_CARD_SIZE;
  const remaining = STAMP_CARD_SIZE - current;

  return { total, current, remaining, timesAchieved };
}
