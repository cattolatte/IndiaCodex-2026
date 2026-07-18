import { createHash } from "node:crypto";
import type { MerkleRoot, ShardId } from "./types.ts";

export const sha256 = (data: string | Uint8Array): string =>
  createHash("sha256").update(data).digest("hex");

/** Chunk a document into content-addressed shards. */
export function shardify(content: string, chunkSize = 2048): { id: ShardId; text: string }[] {
  const shards: { id: ShardId; text: string }[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    const text = content.slice(i, i + chunkSize);
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
