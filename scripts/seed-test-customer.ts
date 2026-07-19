/**
 * LIFF スタンプカードの動作確認用ダミー顧客を Supabase に投入するスクリプト。
 *
 * 実行方法:
 *   npm run seed:test-customer
 *   npm run seed:test-customer -- --total=273 --line-user-id=U-test-dev-002
 *
 * オプション（省略時はデフォルト値）:
 *   --line-user-id=<id>        LINE User ID（デフォルト: U-test-dev-001）
 *   --total=<n>                累計パン個数（デフォルト: 73）
 *   --milestone=<n>            last_milestone_reached（デフォルト: total から自動計算）
 *   --shopify-customer-id=<n>  Shopify顧客ID（デフォルト: 999000001）
 *
 * 投入後は以下のURLで確認できる:
 *   http://localhost:3000/liff/stamp-card?dev_line_user_id=U-test-dev-001
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.local から環境変数を読み込む（Node 22 の組み込み機能）
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      args.set(match[1], match[2]);
    }
  }
  return args;
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください",
    );
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const lineUserId = args.get("line-user-id") ?? "U-test-dev-001";
  const total = Number(args.get("total") ?? "73");
  const milestone = Number(
    args.get("milestone") ?? String(Math.floor(total / 100) * 100),
  );
  const shopifyCustomerId = Number(
    args.get("shopify-customer-id") ?? "999000001",
  );

  if (!Number.isFinite(total) || !Number.isFinite(shopifyCustomerId)) {
    console.error("--total / --shopify-customer-id には数値を指定してください");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("customers").upsert(
    {
      shopify_customer_id: shopifyCustomerId,
      line_user_id: lineUserId,
      email: "test-customer@example.com",
      total_bread_count: total,
      last_milestone_reached: milestone,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shopify_customer_id" },
  );
  if (error) {
    console.error(`ダミー顧客の投入に失敗しました: ${error.message}`);
    process.exit(1);
  }

  console.log("✅ ダミー顧客を投入しました");
  console.log(`   shopify_customer_id: ${shopifyCustomerId}`);
  console.log(`   line_user_id:        ${lineUserId}`);
  console.log(`   total_bread_count:   ${total}`);
  console.log(`   last_milestone:      ${milestone}`);
  console.log("");
  console.log("次のURLで動作確認できます（npm run dev を起動した状態で）:");
  console.log(
    `   http://localhost:3000/liff/stamp-card?dev_line_user_id=${encodeURIComponent(lineUserId)}`,
  );
}

main();
