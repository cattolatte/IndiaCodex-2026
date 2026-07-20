import { describe, expect, it } from "vitest";
import { heuristicScore } from "./detector.ts";
import { CLEAN_FEED, FORGED_REPORT } from "./seed-data.ts";

/**
 * The heuristic layer is the deterministic offline fallback for the detector, so
 * detection works with no API key. It must catch the forgery signals and, just
 * as importantly, leave an unremarkable genuine filing alone.
 */
describe("heuristicScore (offline forgery detection)", () => {
  it("flags the forged earnings flash well above the suspicious threshold", () => {
    const { score, reasons } = heuristicScore(`${FORGED_REPORT.title}\n${FORGED_REPORT.content}`);
    expect(score).toBeGreaterThanOrEqual(50);
    // It should cite more than one distinct signal, not scrape by on a single hit.
    expect(reasons.length).toBeGreaterThan(1);
  });

  it("leaves a genuine, unremarkable filing below the threshold", () => {
    for (const clean of CLEAN_FEED) {
      const { score } = heuristicScore(`${clean.title}\n${clean.content}`);
      expect(score).toBeLessThan(50);
    }
  });

  it("recognises individual forgery signals", () => {
    expect(heuristicScore("this is a LEAKED internal document").score).toBeGreaterThanOrEqual(25);
    expect(heuristicScore("shares expected to gap up 40% at the open").score).toBeGreaterThan(0);
    expect(heuristicScore("revenue was more than double consensus").score).toBeGreaterThanOrEqual(20);
    expect(heuristicScore("sources say guidance will be raised").score).toBeGreaterThanOrEqual(20);
  });

  it("caps the score at 100 however many signals fire", () => {
    const everything =
      "LEAKED: sources say it will surge and explode, more than double, gap up 240% — a historic beat";
    expect(heuristicScore(everything).score).toBeLessThanOrEqual(100);
  });
});
