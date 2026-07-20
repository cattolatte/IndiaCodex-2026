import type { SourceHash } from "@antidote/core";
import { cap, db, logEvent } from "./state.ts";

/**
 * The doubt market.
 *
 * Recall infrastructure has an incentive hole: someone must notice the poison
 * and be willing to pull the alarm. Detection is work, and being early is
 * risky. So make doubt a position.
 *
 * Anyone may **stake against a source's truthfulness**. If a recall later
 * confirms the source was poison, the skeptics split a bounty — funded by the
 * recall issuer's stake plus a protocol fee — in proportion to their stake and
 * weighted by how early they were. If no recall arrives before the window
 * closes, the stake is burned.
 *
 * The result is a market where **being right about a lie is a revenue stream**,
 * and where the crowd's suspicion is a priced, public signal long before an
 * institution acts. Settlement runs over the same Masumi rails as every other
 * payment in the system — doubt itself becomes a monetised agent service.
 */

export interface DoubtPosition {
  id: string;
  source: SourceHash;
  sourceLabel: string;
  skeptic: string;
  stakeLovelace: bigint;
  openedAt: number;
  /** Suspicion at the time of the bet — how contrarian was it? */
  detectorScoreAtOpen: number;
  settled?: { won: boolean; payoutLovelace: bigint; at: number };
}

/** Winners split the issuer's stake plus this multiple of their own stake. */
const BOUNTY_MULTIPLE = 2n;

export function openPosition(opts: {
  source: SourceHash;
  sourceLabel: string;
  skeptic: string;
  stakeLovelace: bigint;
  detectorScore: number;
}): DoubtPosition {
  const position: DoubtPosition = {
    id: `doubt_${Date.now().toString(36)}_${db.doubts.length}`,
    source: opts.source,
    sourceLabel: opts.sourceLabel,
    skeptic: opts.skeptic,
    stakeLovelace: opts.stakeLovelace,
    openedAt: Date.now(),
    detectorScoreAtOpen: opts.detectorScore,
  };
  db.doubts.push(position);
  cap(db.doubts, 100);
  logEvent(
    "doubt",
    `${opts.skeptic} staked ${Number(opts.stakeLovelace) / 1_000_000} ADA AGAINST ` +
      `"${opts.sourceLabel}" — a position that this source is a forgery` +
      (opts.detectorScore > 0 ? ` (detector had it at ${opts.detectorScore}/100)` : ""),
    { source: opts.source },
  );
  return position;
}

/**
 * A recall confirms the doubters were right. Positions against the recalled
 * source pay out; the earlier and more contrarian the bet, the larger the share.
 */
export function settleOnRecall(
  source: SourceHash,
  issuerStake: bigint,
): { winners: DoubtPosition[]; totalPayout: bigint } {
  const winners = db.doubts.filter((d) => d.source === source && !d.settled);
  if (winners.length === 0) return { winners: [], totalPayout: 0n };

  const totalStaked = winners.reduce((sum, d) => sum + d.stakeLovelace, 0n);
  let totalPayout = 0n;

  for (const position of winners) {
    // Own stake back, plus a share of the issuer's bounty by stake weight.
    const share = totalStaked > 0n ? (issuerStake * position.stakeLovelace) / totalStaked : 0n;
    const payout = position.stakeLovelace * BOUNTY_MULTIPLE + share;
    position.settled = { won: true, payoutLovelace: payout, at: Date.now() };
    totalPayout += payout;
    logEvent(
      "doubt",
      `DOUBT PAID: ${position.skeptic} was right about "${position.sourceLabel}" — ` +
        `${Number(payout) / 1_000_000} ADA owed. Being early to a lie is a revenue stream.`,
      { source },
    );
  }

  return { winners, totalPayout };
}

export function marketSummary() {
  const open = db.doubts.filter((d) => !d.settled);
  const settled = db.doubts.filter((d) => d.settled);
  return {
    openPositions: open.length,
    openStakeAda: open.reduce((s, d) => s + Number(d.stakeLovelace), 0) / 1_000_000,
    settledPositions: settled.length,
    totalPaidAda:
      settled.reduce((s, d) => s + Number(d.settled?.payoutLovelace ?? 0n), 0) / 1_000_000,
    positions: db.doubts.map((d) => ({
      id: d.id,
      skeptic: d.skeptic,
      sourceLabel: d.sourceLabel,
      stakeAda: Number(d.stakeLovelace) / 1_000_000,
      detectorScoreAtOpen: d.detectorScoreAtOpen,
      settled: d.settled
        ? { won: d.settled.won, payoutAda: Number(d.settled.payoutLovelace) / 1_000_000 }
        : undefined,
    })),
  };
}
