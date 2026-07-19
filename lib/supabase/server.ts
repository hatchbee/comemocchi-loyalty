import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * サーバーサイド専用の Supabase クライアントを生成する。
 *
 * Service Role Key は RLS をバイパスするため、
 * このクライアントを絶対にクライアントサイドへ露出させないこと。
 * （webhook ハンドラ等の API Route からのみ使用する）
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "環境変数 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が設定されていません",
    );
  }

  return createClient(url, key, {
    auth: {
      // サーバーサイドではセッション管理は不要
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
