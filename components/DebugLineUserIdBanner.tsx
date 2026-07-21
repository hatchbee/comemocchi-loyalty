"use client";

import { useState } from "react";

interface DebugLineUserIdBannerProps {
  lineUserId: string;
}

/**
 * 実機テスト用のデバッグ表示（LINE User ID をシードスクリプトにコピーするため）。
 * ALLOW_DEV_MODE_IN_PRODUCTION=true または ?debug=1 のときだけ表示される。
 * 本番公開前に削除すること（README / NEXT_STEPS.md 参照）
 */
export function DebugLineUserIdBanner({ lineUserId }: DebugLineUserIdBannerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(lineUserId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API が使えない環境（古いWebViewなど）ではテキスト選択でのコピーにフォールバック
    }
  };

  return (
    <div className="mb-4 rounded-xl bg-red-600 px-4 py-3 text-white shadow-md">
      <p className="text-xs font-bold">⚠️ Debug: Your LINE User ID</p>
      <p className="mt-1 break-all font-mono text-sm select-all">{lineUserId}</p>
      <button
        type="button"
        onClick={handleCopy}
        className="mt-2 rounded-full bg-white/20 px-3 py-1 text-xs font-bold active:bg-white/30"
      >
        {copied ? "コピーしました！" : "コピーする"}
      </button>
    </div>
  );
}
