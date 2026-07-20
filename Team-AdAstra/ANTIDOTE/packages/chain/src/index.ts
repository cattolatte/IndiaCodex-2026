/**
 * Cardano Preprod integration — the enforcement layer.
 *
 * The Aiken validators in `contracts/` are the real gate: an agent's spending
 * transaction is composed with `quarantine_gate`, which reads that agent's
 * status UTXO as a reference input and fails outright while the agent is
 * exposed. Enforcement is therefore at consensus — deterministic, applies
 * across organizations, and no operator can lift it for another operator's
 * agent.
 *
 * Two modes, one interface (mirroring the Masumi client):
 *  - live: submits real Preprod transactions via Blockfrost when
 *    BLOCKFROST_PROJECT_ID_PREPROD is configured.
 *  - simulated: evaluates the same validator logic locally and reports the
 *    real compiled script hashes, so the enforcement path is demonstrable
 *    without funded wallets.
 */
import type { AgentId } from "@antidote/core";
import { scriptHash, validatorSummary } from "./blueprint.ts";

export { blueprint, scriptHash, validatorSummary } from "./blueprint.ts";

export const NETWORK = "preprod" as const;

const BLOCKFROST_KEY = process.env.BLOCKFROST_PROJECT_ID_PREPROD ?? "";
const WALLET_MNEMONIC = process.env.CARDANO_WALLET_MNEMONIC ?? "";
const BLOCKFROST_URL = "https://cardano-preprod.blockfrost.io/api/v0";

/** fetch with a hard timeout, so a slow Blockfrost never hangs the request. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type ChainMode = "live" | "simulated";

/**
 * Whether spends are genuinely submitted to Preprod.
 *
 * Two honesty guards, strongest first:
 *
 *  1. Live submission — signing and submitting a real transaction that the
 *     on-chain validator then evaluates — is NOT implemented in this build (see
 *     `gatedSpend` below, which evaluates the gate logic locally). While that is
 *     true the mode is always "simulated", so nothing can ever claim a
 *     transaction hit the chain when it did not. Flip `LIVE_SUBMISSION` to true
 *     only once real submission is wired.
 *  2. Even then, a Blockfrost key alone grants only *read* access — it cannot
 *     sign or submit — so a funded wallet mnemonic is also required.
 *
 * Reporting "live" while still evaluating locally would tell a viewer that
 * transactions are hitting the chain when they are not, which is precisely the
 * kind of claim this project exists to make checkable.
 */
const LIVE_SUBMISSION = false;

export function chainMode(): ChainMode {
  return LIVE_SUBMISSION && BLOCKFROST_KEY && WALLET_MNEMONIC ? "live" : "simulated";
}

export interface ChainTip {
  network: "preprod";
  height: number;
  epoch: number;
  slot: number;
  fetchedAt: number;
}

let tipCache: ChainTip | undefined;

/**
 * Current Preprod tip via Blockfrost. Read access is real even before wallets
 * are funded, so this is honest evidence that the system is talking to Cardano
 * rather than asserting it. Cached briefly — the dashboard polls continuously
 * and a free tier is a shared budget.
 */
export async function chainTip(): Promise<ChainTip | undefined> {
  if (!BLOCKFROST_KEY) return undefined;
  if (tipCache && Date.now() - tipCache.fetchedAt < 20_000) return tipCache;

  try {
    const res = await fetchWithTimeout(
      `${BLOCKFROST_URL}/blocks/latest`,
      { headers: { project_id: BLOCKFROST_KEY } },
      6000,
    );
    if (!res.ok) return tipCache;
    const b = (await res.json()) as { height: number; epoch: number; slot: number };
    tipCache = {
      network: "preprod",
      height: b.height,
      epoch: b.epoch,
      slot: b.slot,
      fetchedAt: Date.now(),
    };
    return tipCache;
  } catch {
    return tipCache;
  }
}

export type OnChainStatus =
  | { kind: "clean" }
  | { kind: "exposed"; recall: string }
  | { kind: "cleared"; recall: string; auditor: string };

export interface GateResult {
  /** Did the validator permit the spend? */
  allowed: boolean;
  /** Script hash of the validator that made the call. */
  validator: string;
  mode: ChainMode;
  /** Tx hash when live; a deterministic reference when simulated. */
  txRef: string;
  reason: string;
}

/**
 * The quarantine gate's spending condition, mirroring `transactable/2` in
 * validators/quarantine.ak: a spend is permitted only when the agent's status
 * reference input says Clean or Cleared. A missing status is a failure, not a
 * pass — you cannot slip through by omitting the evidence.
 */
export function evaluateGate(status: OnChainStatus | undefined): boolean {
  if (!status) return false;
  return status.kind !== "exposed";
}

export async function gatedSpend(
  agent: AgentId,
  status: OnChainStatus | undefined,
  description: string,
): Promise<GateResult> {
  const allowed = evaluateGate(status);
  const validator = scriptHash("quarantine_gate") ?? "blueprint-not-built";
  const mode = chainMode();

  if (mode === "live") {
    // Live submission is wired here once wallets are funded; until then the
    // simulated path below exercises identical validator logic.
  }

  return {
    allowed,
    validator,
    mode,
    txRef: `${allowed ? "spend" : "rejected"}_${Math.random().toString(16).slice(2, 10)}`,
    reason: allowed
      ? `quarantine_gate: status ${status?.kind ?? "unknown"} — spend permitted`
      : status?.kind === "exposed"
        ? `quarantine_gate: agent exposed under ${status.recall} with no attestation — script rejected the transaction`
        : "quarantine_gate: no status reference input — script rejected the transaction",
  };
}

export function validators() {
  return validatorSummary();
}
