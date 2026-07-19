"use client";

import { useEffect, useState } from "react";
import { StampCard } from "@/components/StampCard";

type ViewState =
  | { phase: "loading" }
  | { phase: "not_linked" }
  | { phase: "error"; message: string }
  | { phase: "ready"; totalBreadCount: number };

/**
 * LINE User ID を解決する。
 * - 開発モード: URL クエリ `?dev_line_user_id=xxx` でシミュレート可能
 *   （LIFF ID 未発行でもローカルで動作確認できるようにするため）
 * - 本番モード: LIFF SDK で取得
 */
async function resolveLineUserId(): Promise<string> {
  if (process.env.NODE_ENV === "development") {
    const devUserId = new URLSearchParams(window.location.search).get(
      "dev_line_user_id",
    );
    if (devUserId) {
      return devUserId;
    }
  }

  const liffId = process.env.NEXT_PUBLIC_LINE_LIFF_ID;
  if (!liffId) {
    throw new Error(
      "LIFF ID が設定されていません。開発中は ?dev_line_user_id=xxx を付けてアクセスしてください。",
    );
  }

  // LIFF SDK はブラウザ専用のためダイナミックインポートする
  const liff = (await import("@line/liff")).default;
  await liff.init({ liffId });

  if (!liff.isLoggedIn()) {
    liff.login();
    // login() はリダイレクトするため、ここには戻ってこない
    return new Promise<never>(() => {});
  }

  const profile = await liff.getProfile();
  return profile.userId;
}

export default function StampCardPage() {
  const [state, setState] = useState<ViewState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lineUserId = await resolveLineUserId();
        const response = await fetch(
          `/api/customer/status?line_user_id=${encodeURIComponent(lineUserId)}`,
        );
        if (response.status === 404) {
          if (!cancelled) setState({ phase: "not_linked" });
          return;
        }
        if (!response.ok) {
          throw new Error(`顧客状態の取得に失敗しました (${response.status})`);
        }
        const data = (await response.json()) as { totalBreadCount: number };
        if (!cancelled) {
          setState({ phase: "ready", totalBreadCount: data.totalBreadCount });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            phase: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shopDomain = process.env.NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN;
  const shopUrl = shopDomain ? `https://${shopDomain}` : null;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[428px] px-4 py-6">
      {/* 見出し */}
      <h1 className="text-center font-[family-name:var(--font-zen-maru)] text-xl font-bold text-[#8B6F47]">
        🍞 こめもっち スタンプカード
      </h1>

      <div className="mt-5">
        {state.phase === "loading" && (
          <p className="py-16 text-center text-sm text-[#8B6F47]">
            スタンプカードを読み込んでいますね…🍞
          </p>
        )}

        {state.phase === "not_linked" && (
          <div className="rounded-3xl border border-[#F5E6D3] bg-white/80 p-6 text-center shadow-sm">
            <p className="font-[family-name:var(--font-zen-maru)] font-bold text-[#3A2E1F]">
              アカウントがまだ連携されていません
            </p>
            <p className="mt-3 text-sm leading-relaxed text-[#3A2E1F]">
              こめもっちストアでのご購入と LINE の連携が完了すると、
              こちらにスタンプが表示されますね💛
            </p>
          </div>
        )}

        {state.phase === "error" && (
          <div className="rounded-3xl border border-[#F5E6D3] bg-white/80 p-6 text-center shadow-sm">
            <p className="font-[family-name:var(--font-zen-maru)] font-bold text-[#3A2E1F]">
              読み込みに失敗しました
            </p>
            <p className="mt-3 break-all text-xs text-[#8B6F47]">
              {state.message}
            </p>
          </div>
        )}

        {state.phase === "ready" && (
          <StampCard totalBreadCount={state.totalBreadCount} shopUrl={shopUrl} />
        )}
      </div>
    </main>
  );
}
