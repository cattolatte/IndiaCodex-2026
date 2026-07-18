/**
 * Cardano Preprod integration — Mesh tx builders over the Aiken blueprint
 * (roadmap; see docs/ARCHITECTURE.md → "On-chain design sketch").
 *
 * Planned surface, implemented against contracts/plutus.json once the
 * validators land:
 *  - postRecall(recall)            → recall registry UTXO (issuer stake locked)
 *  - flagAgent(agentId, recallId)  → per-agent status UTXO update
 *  - gatedSpend(agentId, tx)       → spend composed with the quarantine gate;
 *                                    reads the agent's status UTXO as a
 *                                    reference input, fails while exposed
 *  - postAttestation(attestation)  → clears the flag
 */
import type { Attestation, Recall } from "@antidote/core";

export const NETWORK = "preprod" as const;

export async function postRecall(_recall: Recall): Promise<string> {
  throw new Error("roadmap: validator-level recall UTXOs are not part of this build");
}

export async function postAttestation(_attestation: Attestation): Promise<string> {
  throw new Error("roadmap: validator-level attestations are not part of this build");
}
