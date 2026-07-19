/**
 * assets/rich-menu.svg を LINE アップロード用の PNG（2500×1686）に変換するスクリプト。
 *
 * 実行方法:
 *   npm run generate:rich-menu
 *
 * フォント:
 * - 初回実行時に Zen Maru Gothic Bold を Google Fonts（GitHub）からダウンロードして
 *   assets/fonts/ にキャッシュする（ネットワーク不通時はシステムフォントで代替）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

const FONT_URL =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/zenmarugothic/ZenMaruGothic-Bold.ttf";
const FONT_PATH = path.join("assets", "fonts", "ZenMaruGothic-Bold.ttf");
const SVG_PATH = path.join("assets", "rich-menu.svg");
const PNG_PATH = path.join("assets", "rich-menu.png");

/** LINE リッチメニュー大サイズの規定寸法 */
const WIDTH = 2500;
const HEIGHT = 1686;

async function ensureFont(): Promise<string | null> {
  if (existsSync(FONT_PATH)) {
    return FONT_PATH;
  }
  try {
    console.log("Zen Maru Gothic Bold をダウンロードしています…");
    const response = await fetch(FONT_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    mkdirSync(path.dirname(FONT_PATH), { recursive: true });
    writeFileSync(FONT_PATH, buffer);
    console.log(`フォントを ${FONT_PATH} に保存しました`);
    return FONT_PATH;
  } catch (error) {
    console.warn(
      "フォントのダウンロードに失敗しました。システムフォント（Yu Gothic 等）で代替します:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function main(): Promise<void> {
  if (!existsSync(SVG_PATH)) {
    console.error(`${SVG_PATH} が見つかりません`);
    process.exit(1);
  }
  const svg = readFileSync(SVG_PATH, "utf8");
  const fontFile = await ensureFont();

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    background: "#FDF6E9",
    font: {
      loadSystemFonts: true,
      fontFiles: fontFile ? [fontFile] : [],
      defaultFontFamily: fontFile ? "Zen Maru Gothic" : "Yu Gothic UI",
    },
  });
  const rendered = resvg.render();
  const png = rendered.asPng();
  writeFileSync(PNG_PATH, png);

  const sizeKb = Math.round(png.byteLength / 1024);
  console.log(
    `✅ ${PNG_PATH} を生成しました（${rendered.width}×${rendered.height}px, ${sizeKb}KB）`,
  );

  if (rendered.width !== WIDTH || rendered.height !== HEIGHT) {
    console.error(
      `⚠️ サイズが LINE の規定（${WIDTH}×${HEIGHT}）と一致しません。assets/rich-menu.svg を確認してください`,
    );
    process.exit(1);
  }
  if (png.byteLength > 1024 * 1024) {
    console.error(
      "⚠️ 1MB を超えています。LINE にアップロードできない可能性があります",
    );
    process.exit(1);
  }
}

main();
