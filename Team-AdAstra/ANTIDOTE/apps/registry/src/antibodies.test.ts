import { beforeEach, describe, expect, it } from "vitest";
import { merkleRoot, sha256, shardify } from "@antidote/core";
import { extractMarkers, matchScore, mintAntibody, screen, type Antibody } from "./antibodies.ts";
import { CLEAN_FEED, CLEAN_FOLLOWUP, FORGED_REPORT, MUTATED_FORGERY } from "./seed-data.ts";
import { db, reset } from "./state.ts";

function addSource(title: string, content: string): string {
  const hash = sha256(content);
  db.sources.set(hash, {
    hash,
    title,
    content,
    shardIds: shardify(content).map((s) => s.id),
    origin: "market-feed",
    registeredAt: Date.now(),
    tainted: false,
  });
  return hash;
}

function recallFor(source: string) {
  return {
    id: "recall_test",
    source,
    shardIds: db.sources.get(source)!.shardIds,
    shardRoot: merkleRoot(db.sources.get(source)!.shardIds),
    severity: "quarantine" as const,
    issuer: "test",
    stake: 50_000_000n,
    issuedAt: Date.now(),
  };
}

beforeEach(() => reset());

describe("extractMarkers", () => {
  it("captures distinctive financial claims", () => {
    const markers = extractMarkers(FORGED_REPORT.content);
    expect(markers).toContain("$4.2b");
    expect(markers).toContain("$3.85");
    expect(markers).toContain("240");
  });

  it("ignores small integers that carry no signal", () => {
    expect(extractMarkers("we met 3 vendors over 12 weeks")).toEqual([]);
  });

  it("is insensitive to thousands separators and case", () => {
    expect(extractMarkers("$1,250.50")).toEqual(extractMarkers("$1250.50"));
  });
});

describe("immunity screening", () => {
  it("blocks the same lie reworded under a different hash", () => {
    const source = addSource(FORGED_REPORT.title, FORGED_REPORT.content);
    expect(mintAntibody(recallFor(source))).toBeDefined();

    // The mutation hashes completely differently — content addressing alone
    // cannot catch it.
    expect(sha256(MUTATED_FORGERY.content)).not.toBe(source);
    const hit = screen(MUTATED_FORGERY.content);
    expect(hit).toBeDefined();
    expect(hit!.score).toBeGreaterThanOrEqual(0.6);
  });

  it("does not block the genuine correction or unrelated clean sources", () => {
    const source = addSource(FORGED_REPORT.title, FORGED_REPORT.content);
    mintAntibody(recallFor(source));

    // A false refusal is worse than no immunity: it starves agents of the truth.
    expect(screen(CLEAN_FOLLOWUP.content)).toBeUndefined();
    for (const doc of CLEAN_FEED) {
      expect(screen(doc.content)).toBeUndefined();
    }
  });

  it("refuses to mint an antibody from a source with too few claims", () => {
    const source = addSource("Thin note", "Revenue was $4.2B this quarter.");
    expect(mintAntibody(recallFor(source))).toBeUndefined();
    expect(db.antibodies.size).toBe(0);
  });

  it("never screens on a thin antibody even if one exists", () => {
    const thin: Antibody = {
      id: "ab_thin",
      recallId: "r",
      source: "s",
      label: "thin",
      markers: ["$4.2b"],
      createdAt: Date.now(),
    };
    // A single coincidental figure must not score as a match.
    expect(matchScore(thin, "guidance held at $4.2b for the year")).toBe(0);
  });

  it("requires several concrete hits, not just a high ratio", () => {
    const antibody: Antibody = {
      id: "ab",
      recallId: "r",
      source: "s",
      label: "l",
      markers: ["$4.2b", "240", "$3.85"],
      createdAt: Date.now(),
    };
    expect(matchScore(antibody, "only $4.2b appears here")).toBe(0);
    expect(matchScore(antibody, "$4.2b, 240 and $3.85 all appear")).toBe(1);
  });
});
