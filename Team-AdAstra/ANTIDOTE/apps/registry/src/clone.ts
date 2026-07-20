import { cap, db, logEvent } from "./state.ts";

/**
 * The control group.
 *
 * An identical fleet with no ANTIDOTE: same feed, same forgery, no gateway
 * manifests, no recall, no quarantine. It keeps trading on the lie, and when
 * the correction publishes its position is marked to the truth.
 *
 * The two numbers side by side are the whole argument: contamination costs
 * money, and containment time is the variable that decides how much.
 */

export interface CloneState {
  /** Positions the unprotected fleet opened on contaminated information. */
  positions: { ticker: string; sizeUsd: number; openedAt: number; poisoned: boolean }[];
  /** Realised loss once the truth lands (USD). */
  lossUsd: number;
  /** Still holding a position taken on a forgery? */
  holdingTheBag: boolean;
}

export const clone: CloneState = { positions: [], lossUsd: 0, holdingTheBag: false };

export function resetClone(): void {
  clone.positions.length = 0;
  clone.lossUsd = 0;
  clone.holdingTheBag = false;
}

/**
 * The unprotected fleet mirrors whatever the protected trader was about to do —
 * except nothing stops it. Called when a trade decision is produced, regardless
 * of whether the protected fleet's transaction was allowed through.
 */
export function mirrorTrade(
  ticker: string,
  sizeUsd: number,
  poisoned: boolean,
): void {
  if (sizeUsd <= 0) return;
  clone.positions.push({ ticker, sizeUsd, openedAt: Date.now(), poisoned });
  cap(clone.positions, 100);
  if (poisoned) clone.holdingTheBag = true;
  logEvent(
    "clone",
    `Unprotected fleet: BUY ${ticker} $${sizeUsd.toLocaleString("en-US")} — no recall infrastructure, nothing stops it`,
  );
}

/**
 * The correction publishes. Positions opened on the forgery are marked to the
 * truth; the ~40% gap-up that the forgery promised never materialises.
 */
export function markToTruth(): number {
  const exposed = clone.positions.filter((p) => p.poisoned && p.sizeUsd > 0);
  if (exposed.length === 0) return 0;
  const loss = exposed.reduce((sum, p) => sum + p.sizeUsd * 0.4, 0);
  clone.lossUsd += loss;
  clone.holdingTheBag = false;
  for (const p of exposed) p.sizeUsd = 0;
  logEvent(
    "clone",
    `Unprotected fleet marked to truth: −$${Math.round(loss).toLocaleString("en-US")} on positions taken from the forgery`,
  );
  return loss;
}

/**
 * Recall issued → every exposed agent quarantined. Near-instant by
 * construction: exposure is a deterministic walk over manifests we already
 * hold, not a request to operators to please re-index.
 */
export function containmentMs(): number | undefined {
  const recall = db.events.find((e) => e.kind === "recall");
  if (!recall) return undefined;
  const lastExposure = [...db.events].reverse().find((e) => e.kind === "exposure");
  if (!lastExposure) return undefined;
  return Math.max(0, lastExposure.at - recall.at);
}

/**
 * The epidemiologically interesting number: how long the forgery was live and
 * actionable inside the fleet — from entering the feed to full quarantine.
 * This is the window in which money can be lost.
 */
export function exposureWindowMs(): number | undefined {
  const infection = db.events.find(
    (e) => e.kind === "source" && e.message.includes("⚠"),
  );
  if (!infection) return undefined;
  const lastExposure = [...db.events].reverse().find((e) => e.kind === "exposure");
  if (!lastExposure) return undefined;
  return Math.max(0, lastExposure.at - infection.at);
}
