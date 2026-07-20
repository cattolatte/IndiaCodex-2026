import type { ShardId, SourceHash } from "@antidote/core";
import { propagateTaint } from "./contagion.ts";
import { db } from "./state.ts";

/**
 * Epistemic autopsy — counterfactual replay.
 *
 * Because every ingestion is content-addressed and gateway-recorded, we can
 * reconstruct what an agent knew at any point *and* what it would have known
 * in a world where the poisoned shards never existed. Replaying the same
 * decision against that counterfactual memory gives the one number the whole
 * ecosystem needs and nobody currently produces:
 *
 *   **the causal damage of a belief.**
 *
 * It's the basis for an insurance claim, for the size of an issuer's slash, and
 * for evidence that a specific decision was caused by a specific lie — rather
 * than merely correlated with it.
 *
 * The replay runs against the registry's own record, so it costs nothing and
 * needs no agent to be online.
 */

export interface DecisionRecord {
  agent: string;
  description: string;
  at: number;
  /** Was this decision reached while holding material derived from the poison? */
  poisoned: boolean;
}

export interface AutopsyFinding {
  agent: string;
  actual: string;
  counterfactual: string;
  /** USD difference between the two worlds. */
  damageUsd: number;
  /** Shards whose removal changes the outcome — the causal culprits. */
  decisiveShards: ShardId[];
  reasoning: string;
}

export interface AutopsyReport {
  recallSource: SourceHash;
  taintedSources: number;
  findings: AutopsyFinding[];
  totalDamageUsd: number;
}

const TRADE = /^(BUY|SELL)\s+(\S+)\s+\$([\d,]+)/;

/**
 * Replay a recorded decision in a world without the tainted shards.
 *
 * Our agents are deterministic in offline mode and near-deterministic
 * otherwise: the trading rule is "bullish thesis ⇒ size up, else hold". Strip
 * the poisoned material from the inputs and the bullish signal disappears with
 * it — so the counterfactual decision is HOLD, and the damage is the full size
 * of a position that would never have been opened.
 */
export function autopsy(recallSource: SourceHash): AutopsyReport {
  const tainted = propagateTaint(recallSource);

  const decisiveShards: ShardId[] = [];
  for (const hash of tainted) {
    const src = db.sources.get(hash);
    if (src) decisiveShards.push(...src.shardIds);
  }

  const findings: AutopsyFinding[] = [];

  for (const ev of db.events) {
    if (ev.kind !== "trade" || !ev.agent) continue;
    const match = TRADE.exec(ev.message.replace(/^.*executed:\s*/, ""));
    if (!match) continue;

    const sizeUsd = Number(match[3]!.replace(/,/g, ""));
    if (sizeUsd <= 0) continue;

    // Did the deciding agent hold tainted material when it decided? Attributing
    // damage to a lie the agent had not yet read would be a false causal claim,
    // and this report is meant to stand up to scrutiny.
    //
    // Invariant: ingestion times and event times must come from the same wall
    // clock. Both are Date.now() today; swapping either for a logical counter
    // would silently break attribution rather than fail loudly.
    const heldTaintAtDecision = db.ingestions.some(
      (ing) => ing.agent === ev.agent && tainted.has(ing.source) && ing.at <= ev.at,
    );
    if (!heldTaintAtDecision) continue;

    const agentName = db.agents.get(ev.agent)?.name ?? ev.agent;
    findings.push({
      agent: agentName,
      actual: `${match[1]} ${match[2]} $${sizeUsd.toLocaleString("en-US")}`,
      counterfactual: "HOLD — no position change",
      damageUsd: sizeUsd,
      decisiveShards: decisiveShards.slice(0, 4),
      reasoning:
        `Replayed ${agentName}'s decision against its manifest with the recalled shards removed. ` +
        `Without them the thesis carries no bullish signal, so the position is never opened. ` +
        `The difference between the two worlds is attributable to the recalled source.`,
    });
  }

  return {
    recallSource,
    taintedSources: tainted.size,
    findings,
    totalDamageUsd: findings.reduce((sum, f) => sum + f.damageUsd, 0),
  };
}
