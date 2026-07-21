/**
 * 実機テスト用に、指定した LINE User ID のダミー顧客データを
 * 本番 Supabase に投入するスクリプト（scripts/seed-test-customer.ts の本番版）。
 *
 * 実行方法:
 *   npm run seed:line-user -- --line-user-id=Uxxxxx --total=47
 *
 * オプション:
 *   --line-user-id=<id>        LINE User ID（必須）
 *   --total=<n>                累計パン個数（必須）
 *   --milestone=<n>            last_milestone_reached（省略時は total から自動計算）
 *   --shopify-customer-id=<n>  Shopify顧客ID（デフォルト: 9999900001。既存の実顧客IDと衝突しないダミー帯）
 *
 * 環境変数（読み込み優先順）:
 *   1. .env.production.local（本番 Supabase の URL / Service Role Key を置く）
 *   2. .env.local（フォールバック。本番用ファイルを別途用意していない場合はここに本番の値を書いてもよい）
 *   - SUPABASE_URL（未設定なら NEXT_PUBLIC_SUPABASE_URL にフォールバック）
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * ⚠️ 本番データベースに直接書き込みます。実行前に接続先URLのホスト名が
 * 想定どおりか（開発用プロジェクトを誤指定していないか）を必ず確認してください。
 *
 * 既存の customers 行があれば update、なければ insert（UPSERT）。
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// 本番用ファイルを優先し、なければ通常の .env.local にフォールバック
if (existsSync(".env.production.local")) {
  process.loadEnvFile(".env.production.local");
} else if (existsSync(".env.local")) {
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
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "SUPABASE_URL（または NEXT_PUBLIC_SUPABASE_URL）/ SUPABASE_SERVICE_ROLE_KEY を" +
        " .env.production.local または .env.local に設定してください",
    );
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const lineUserId = args.get("line-user-id");
  const totalArg = args.get("total");

  if (!lineUserId) {
    console.error("--line-user-id は必須です（例: --line-user-id=U1234567890abcdef）");
    process.exit(1);
  }
  if (!totalArg) {
    console.error("--total は必須です（例: --total=47）");
    process.exit(1);
  }

  const total = Number(totalArg);
  const milestone = Number(
    args.get("milestone") ?? String(Math.floor(total / 100) * 100),
  );
  const shopifyCustomerId = Number(
    args.get("shopify-customer-id") ?? "9999900001",
  );

  if (!Number.isFinite(total) || total < 0) {
    console.error("--total には 0 以上の数値を指定してください");
    process.exit(1);
  }
  if (!Number.isFinite(shopifyCustomerId)) {
    console.error("--shopify-customer-id には数値を指定してください");
    process.exit(1);
  }

  // 接続先を明示（Service Role Key は出力しない）
  const hostname = new URL(url).hostname;
  console.log(`⚠️  本番 Supabase に接続します: ${hostname}`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // line_user_id を基準に既存行を探す（line_user_id は UNIQUE 制約があるため、
  // shopify_customer_id を conflict キーにした upsert だと、既存の line_user_id と
  // 衝突して失敗する可能性がある。update/insert を明示的に分ける）
  const { data: existing, error: selectError } = await supabase
    .from("customers")
    .select("id, shopify_customer_id")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  if (selectError) {
    console.error(`既存顧客の確認に失敗しました: ${selectError.message}`);
    process.exit(1);
  }

  if (existing) {
    // 既存行を更新（shopify_customer_id は変更しない。実顧客に紐付いている可能性があるため）
    const { error: updateError } = await supabase
      .from("customers")
      .update({
        total_bread_count: total,
        last_milestone_reached: milestone,
        updated_at: new Date().toISOString(),
      })
      .eq("line_user_id", lineUserId);
    if (updateError) {
      console.error(`顧客データの更新に失敗しました: ${updateError.message}`);
      process.exit(1);
    }
  } else {
    const { error: insertError } = await supabase.from("customers").insert({
      shopify_customer_id: shopifyCustomerId,
      line_user_id: lineUserId,
      email: "line-test-customer@example.com",
      total_bread_count: total,
      last_milestone_reached: milestone,
      linked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (insertError) {
      console.error(`顧客データの投入に失敗しました: ${insertError.message}`);
      process.exit(1);
    }
  }

  console.log(existing ? "✅ 既存の顧客データを更新しました" : "✅ 新規の顧客データを投入しました");
  console.log(`   shopify_customer_id: ${existing?.shopify_customer_id ?? shopifyCustomerId}`);
  console.log(`   line_user_id:        ${lineUserId}`);
  console.log(`   total_bread_count:   ${total}`);
  console.log(`   last_milestone:      ${milestone}`);
  console.log("");
  console.log("LINEアプリでリッチメニュー等からLIFFを開くと、このデータでスタンプカードが表示されます。");
}

main();
