import { describe, expect, it } from "vitest";
import { calcStampProgress } from "@/lib/logic/stamp-progress";

describe("calcStampProgress", () => {
  it("0個 → 進捗0、あと100個、達成0回", () => {
    expect(calcStampProgress(0)).toEqual({
      total: 0,
      current: 0,
      remaining: 100,
      timesAchieved: 0,
    });
  });

  it("73個 → 進捗73、あと27個、達成0回（SPEC 6.2 の例）", () => {
    expect(calcStampProgress(73)).toEqual({
      total: 73,
      current: 73,
      remaining: 27,
      timesAchieved: 0,
    });
  });

  it("ちょうど100個 → 新しい周回の始まり（進捗0、達成1回）", () => {
    expect(calcStampProgress(100)).toEqual({
      total: 100,
      current: 0,
      remaining: 100,
      timesAchieved: 1,
    });
  });

  it("107個 → 進捗7、あと93個、達成1回", () => {
    expect(calcStampProgress(107)).toEqual({
      total: 107,
      current: 7,
      remaining: 93,
      timesAchieved: 1,
    });
  });

  it("210個 → 進捗10、あと90個、達成2回", () => {
    expect(calcStampProgress(210)).toEqual({
      total: 210,
      current: 10,
      remaining: 90,
      timesAchieved: 2,
    });
  });

  it("350個 → 進捗50、あと50個、達成3回", () => {
    expect(calcStampProgress(350)).toEqual({
      total: 350,
      current: 50,
      remaining: 50,
      timesAchieved: 3,
    });
  });

  it("99個 → あと1個で特典", () => {
    const progress = calcStampProgress(99);
    expect(progress.current).toBe(99);
    expect(progress.remaining).toBe(1);
  });

  it("負数・小数・NaN は 0 扱いに正規化する", () => {
    expect(calcStampProgress(-5).total).toBe(0);
    expect(calcStampProgress(73.9).total).toBe(73);
    expect(calcStampProgress(Number.NaN).total).toBe(0);
  });
});
