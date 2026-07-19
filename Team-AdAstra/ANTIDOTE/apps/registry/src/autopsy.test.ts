import { beforeEach, describe, expect, it } from "vitest";
import { merkleRoot, sha256, shardify } from "@antidote/core";
import { autopsy } from "./autopsy.ts";
import { openPosition, settleOnRecall } from "./doubt-market.ts";
import { clone, markToTruth, mirrorTrade, resetClone } from "./clone.ts";
import { db, logEvent, reset, updateManifest } from "./state.ts";

let clock = 1_000;
const tick = () => ++clock;

function agent(id: string, role: "research" | "trading" = "trading") {
  db.agents.set(id, {
    id,
    name: id,
    role,
    url: "",
    status: { kind: "clean" },
    manifest: new Set(),
    manifestRoot: merkleRoot([]),
  });
}

function source(content: string, origin: string | { agent: string }) {
  const hash = sha256(content);
  db.sources.set(hash, {
    hash,
    title: content.slice(0, 20),
    content,
    shardIds: shardify(content).map((s) => s.id),
    origin,
    registeredAt: tick(),
    tainted: false,
  });
  return hash;
}

/** Uses the wall clock, as the live gateway does, so it is comparable with event times. */
function ingest(agentId: string, sourceHash: string) {
  const src = db.sources.get(sourceHash)!;
  db.ingestions.push({
    agent: agentId,
    source: sourceHash,
    shardIds: src.shardIds,
    at: Date.now(),
  });
  updateManifest(db.agents.get(agentId)!, src.shardIds);
}

beforeEach(() => {
  reset();
  db.agents.clear();
  resetClone();
  clock = 1_000;
});

describe("autopsy", () => {
  it("attributes a trade to the poison the agent was holding", () => {
    agent("trader");
    const poison = source("forged: revenue $4.2B", "feed");
    ingest("trader", poison);
    logEvent("trade", "trader executed: BUY ORBX $2,500,000", { agent: "trader" });

    const report = autopsy(poison);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0]!.actual).toBe("BUY ORBX $2,500,000");
    expect(report.findings[0]!.counterfactual).toContain("HOLD");
    expect(report.totalDamageUsd).toBe(2_500_000);
  });

  it("ignores trades made before the agent ingested the poison", () => {
    agent("trader");
    const poison = source("forged: revenue $4.2B", "feed");
    ingest("trader", poison);

    // Ingestion and events share one wall clock in production; place the trade
    // strictly before the ingestion to exercise the causality check.
    const ingestedAt = db.ingestions[0]!.at;
    const trade = logEvent("trade", "trader executed: BUY ORBX $1,000,000", { agent: "trader" });
    trade.at = ingestedAt - 1;

    // The decision predates the contamination, so the lie cannot have caused it.
    expect(autopsy(poison).findings).toHaveLength(0);
  });

  it("ignores agents that never held the material", () => {
    agent("trader");
    agent("bystander", "research");
    const poison = source("forged", "feed");
    ingest("trader", poison);
    logEvent("trade", "bystander executed: BUY ORBX $900,000", { agent: "bystander" });

    expect(autopsy(poison).findings).toHaveLength(0);
  });

  it("does not count a HOLD as damage", () => {
    agent("trader");
    const poison = source("forged", "feed");
    ingest("trader", poison);
    logEvent("trade", "trader executed: HOLD — no position change", { agent: "trader" });

    expect(autopsy(poison).findings).toHaveLength(0);
    expect(autopsy(poison).totalDamageUsd).toBe(0);
  });
});

describe("doubt market", () => {
  const open = (source: string, stakeAda: number, skeptic = "Skeptic-1") =>
    openPosition({
      source,
      sourceLabel: "doc",
      skeptic,
      stakeLovelace: BigInt(stakeAda * 1_000_000),
      detectorScore: 90,
    });

  it("pays skeptics when a recall confirms them", () => {
    const src = "src-a";
    open(src, 10);
    const { winners, totalPayout } = settleOnRecall(src, 50_000_000n);
    expect(winners).toHaveLength(1);
    // Stake back at the bounty multiple, plus the whole issuer stake.
    expect(totalPayout).toBe(70_000_000n);
  });

  it("splits the issuer bounty by stake weight", () => {
    const src = "src-b";
    open(src, 30, "Big");
    open(src, 10, "Small");
    settleOnRecall(src, 40_000_000n);
    const [big, small] = db.doubts;
    expect(big!.settled!.payoutLovelace).toBe(60_000_000n + 30_000_000n);
    expect(small!.settled!.payoutLovelace).toBe(20_000_000n + 10_000_000n);
  });

  it("leaves positions against other sources untouched", () => {
    open("src-c", 10);
    open("src-d", 10, "Other");
    settleOnRecall("src-c", 10_000_000n);
    expect(db.doubts[0]!.settled).toBeDefined();
    expect(db.doubts[1]!.settled).toBeUndefined();
  });

  it("does not pay the same position twice", () => {
    const src = "src-e";
    open(src, 10);
    settleOnRecall(src, 10_000_000n);
    const second = settleOnRecall(src, 10_000_000n);
    expect(second.winners).toHaveLength(0);
    expect(second.totalPayout).toBe(0n);
  });
});

describe("unprotected control fleet", () => {
  it("loses money only on positions taken from the forgery", () => {
    mirrorTrade("ORBX", 2_500_000, true);
    mirrorTrade("HLIA", 1_000_000, false);
    const loss = markToTruth();
    expect(loss).toBe(1_000_000); // 40% of the poisoned position only
    expect(clone.lossUsd).toBe(1_000_000);
  });

  it("stops holding the bag once marked to truth", () => {
    mirrorTrade("ORBX", 2_500_000, true);
    expect(clone.holdingTheBag).toBe(true);
    markToTruth();
    expect(clone.holdingTheBag).toBe(false);
  });

  it("does not double-count a second mark to truth", () => {
    mirrorTrade("ORBX", 2_500_000, true);
    markToTruth();
    expect(markToTruth()).toBe(0);
    expect(clone.lossUsd).toBe(1_000_000);
  });

  it("ignores zero-size trades", () => {
    mirrorTrade("ORBX", 0, true);
    expect(clone.positions).toHaveLength(0);
  });
});
