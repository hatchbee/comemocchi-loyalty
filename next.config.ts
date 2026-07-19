import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // クライアントサイド（LIFF ページ）で必要な値を SPEC 3節の環境変数名から橋渡しする
    NEXT_PUBLIC_LINE_LIFF_ID: process.env.LINE_LIFF_ID ?? "",
    NEXT_PUBLIC_SHOPIFY_SHOP_DOMAIN: process.env.SHOPIFY_SHOP_DOMAIN ?? "",
    // デザイン確認用の一時フラグ（デフォルト false。LINE公開前に必ず false に戻すこと）
    NEXT_PUBLIC_ALLOW_DEV_MODE_IN_PRODUCTION:
      process.env.ALLOW_DEV_MODE_IN_PRODUCTION ?? "false",
  },
};

export default nextConfig;
