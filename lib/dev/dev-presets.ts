/**
 * 開発モード専用のダミー顧客プリセット。
 *
 * Supabase 未設定でも LIFF スタンプカードの各状態を確認できるよう、
 * `?dev_line_user_id=<プリセット名>` でこのデータが返る（NODE_ENV=development のみ）。
 *
 * 確認用URL（npm run dev 起動後）:
 *   http://localhost:3000/liff/stamp-card?dev_line_user_id=fresh
 *   http://localhost:3000/liff/stamp-card?dev_line_user_id=progress
 *   http://localhost:3000/liff/stamp-card?dev_line_user_id=near
 *   http://localhost:3000/liff/stamp-card?dev_line_user_id=achieved
 *   http://localhost:3000/liff/stamp-card?dev_line_user_id=repeater
 */

export interface DevPresetCustomer {
  totalBreadCount: number;
  lastMilestoneReached: number;
  /** プリセットの説明（ログ用） */
  description: string;
}

export const DEV_PRESET_CUSTOMERS: Record<string, DevPresetCustomer> = {
  fresh: {
    totalBreadCount: 0,
    lastMilestoneReached: 0,
    description: "開始時（累計0個）",
  },
  progress: {
    totalBreadCount: 47,
    lastMilestoneReached: 0,
    description: "中盤（累計47個）",
  },
  near: {
    totalBreadCount: 95,
    lastMilestoneReached: 0,
    description: "あと少し（累計95個）",
  },
  achieved: {
    totalBreadCount: 100,
    lastMilestoneReached: 100,
    description: "達成直後（累計100個）",
  },
  repeater: {
    totalBreadCount: 273,
    lastMilestoneReached: 200,
    description: "3回目挑戦中（累計273個）",
  },
};

/** Supabase 未設定・接続失敗時のフォールバック（開発モードのみ） */
export const DEV_FALLBACK_CUSTOMER: DevPresetCustomer = {
  totalBreadCount: 73,
  lastMilestoneReached: 0,
  description: "フォールバック（累計73個）",
};
