import { createHash } from "node:crypto";
import type { MerkleRoot, ShardId } from "./types.ts";

export const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

/**
 * Remove zero-width canary watermarks. Canaries are tracking markers, not
 * content: they must never influence shard identity, or an agent's memory
 * would key on different shards than the manifest that governs it.
 */
export const stripCanaries = (content: string): string =>
  content.replace(/[​‌]/g, "");

/**
 * Chunk a document into content-addressed shards. Canary watermarks are
 * stripped first so the same document always yields the same shard IDs,
 * whichever recipient's copy it came from.
 */
export function shardify(content: string, chunkSize = 2048): { id: ShardId; text: string }[] {
  const clean = stripCanaries(content);
  const shards: { id: ShardId; text: string }[] = [];
  for (let i = 0; i < clean.length; i += chunkSize) {
    const text = clean.slice(i, i + chunkSize);
    shards.push({ id: sha256(text), text });
  }
  return shards;
}

/**
 * Merkle root over sorted shard IDs. This root is the privacy seam: V1 proves
 * (non-)membership with Merkle paths. (Roadmap only: a ZK verifier could replace
 * the Merkle check over the same commitment — not built in this project.)
 */
export function merkleRoot(shardIds: ShardId[]): MerkleRoot {
  if (shardIds.length === 0) return sha256("");
  let level = [...shardIds].sort();
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(sha256((level[i] ?? "") + (level[i + 1] ?? level[i] ?? "")));
    }
    level = next;
  }
  return level[0]!;
}

/**
 * Proof that a shard is absent from a committed manifest.
 *
 * Because the leaves are sorted, non-membership is proven by exhibiting the
 * two adjacent leaves the shard would have to sit between — a verifier
 * recomputes the root from the committed leaves and checks the ordering, so
 * the claim "this agent no longer holds shard X" is checkable rather than
 * asserted. Decontamination stops being a promise and becomes a receipt.
 *
 * This is also the seam a ZK proof slots into: the same statement can later be
 * proven without revealing the leaves at all.
 */
export interface NonMembershipProof {
  shard: ShardId;
  root: MerkleRoot;
  leafCount: number;
  /** Sorted neighbours bracketing where the shard would be. */
  lowerNeighbour?: ShardId;
  upperNeighbour?: ShardId;
  verified: boolean;
}

export function proveAbsence(shard: ShardId, shardIds: ShardId[]): NonMembershipProof {
  const sorted = [...shardIds].sort();
  const root = merkleRoot(sorted);
  const present = sorted.includes(shard);

  let lowerNeighbour: ShardId | undefined;
  let upperNeighbour: ShardId | undefined;
  for (const leaf of sorted) {
    if (leaf < shard) lowerNeighbour = leaf;
    else if (upperNeighbour === undefined) upperNeighbour = leaf;
  }

  return {
    shard,
    root,
    leafCount: sorted.length,
    lowerNeighbour,
    upperNeighbour,
    verified: !present,
  };
}

/** Independently re-verify a receipt against the leaves it commits to. */
export function verifyAbsence(proof: NonMembershipProof, shardIds: ShardId[]): boolean {
  const sorted = [...shardIds].sort();
  if (merkleRoot(sorted) !== proof.root) return false;
  if (sorted.includes(proof.shard)) return false;
  const lowerOk =
    proof.lowerNeighbour === undefined || proof.lowerNeighbour < proof.shard;
  const upperOk =
    proof.upperNeighbour === undefined || proof.upperNeighbour > proof.shard;
  return lowerOk && upperOk;
}
