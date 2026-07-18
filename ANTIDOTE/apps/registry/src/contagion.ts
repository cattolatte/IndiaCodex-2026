import type { AgentId, Recall, ShardId, SourceHash } from "@antidote/core";

import { db, logEvent } from "./state.ts";

/**
 * Exposure resolution: walk the ingestion record and propagate taint through
 * the supply chain. An agent's output is tainted if the agent had ingested
 * tainted material before producing it; consumers of tainted outputs are
 * transitively exposed. This is the inverse index a recall needs — who
 * consumed the poison, directly or downstream.
 */
/**
 * Walk the supply chain forward from a poisoned source: any agent output
 * published after its producer had ingested tainted material is itself tainted,
 * and so on downstream. This is what makes contamination epidemic rather than
 * local.
 */
export function propagateTaint(root: SourceHash): Set<SourceHash> {
  const tainted = new Set<SourceHash>([root]);

  // Index once: which outputs each agent published, and when it ingested what.
  // The previous fixpoint re-scanned every ingestion for every source on every
  // pass, which is quadratic in a corpus that grows with each demo run.
  const outputsByProducer = new Map<AgentId, { hash: SourceHash; at: number }[]>();
  for (const src of db.sources.values()) {
    if (typeof src.origin === "object" && "agent" in src.origin) {
      const list = outputsByProducer.get(src.origin.agent) ?? [];
      list.push({ hash: src.hash, at: src.registeredAt });
      outputsByProducer.set(src.origin.agent, list);
    }
  }

  const consumersOf = new Map<SourceHash, { agent: AgentId; at: number }[]>();
  for (const ev of db.ingestions) {
    const list = consumersOf.get(ev.source) ?? [];
    list.push({ agent: ev.agent, at: ev.at });
    consumersOf.set(ev.source, list);
  }

  // Breadth-first along the supply chain: a tainted source contaminates whoever
  // consumed it, and everything they published afterwards.
  const queue: SourceHash[] = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const consumer of consumersOf.get(current) ?? []) {
      for (const output of outputsByProducer.get(consumer.agent) ?? []) {
        if (output.at < consumer.at || tainted.has(output.hash)) continue;
        tainted.add(output.hash);
        queue.push(output.hash);
      }
    }
  }
  return tainted;
}

/** Is this agent currently acting on material derived from `root`? */
export function isActingOnTaint(agentId: AgentId, root: SourceHash): boolean {
  const tainted = propagateTaint(root);
  const agent = db.agents.get(agentId);
  if (!agent) return false;
  for (const hash of tainted) {
    const src = db.sources.get(hash);
    if (src?.shardIds.some((s) => agent.manifest.has(s))) return true;
  }
  return false;
}

export function resolveExposure(recall: Recall): {
  taintedSources: SourceHash[];
  exposed: { agent: AgentId; via: "direct" | "transitive" }[];
} {
  const tainted = propagateTaint(recall.source);

  for (const hash of tainted) {
    const src = db.sources.get(hash);
    if (src) src.tainted = true;
  }

  // Exposure keys on the CURRENT gateway-attested manifest, not ingestion
  // history — a purged agent no longer holds the shards and must not be
  // re-flagged by a later recall of the same source.
  const allTaintedShards = new Set<ShardId>();
  for (const hash of tainted) {
    const src = db.sources.get(hash);
    if (src) for (const s of src.shardIds) allTaintedShards.add(s);
  }
  const directShards = new Set<ShardId>(recall.shardIds);

  const exposed: { agent: AgentId; via: "direct" | "transitive" }[] = [];
  for (const agent of db.agents.values()) {
    const held = [...agent.manifest].filter((s) => allTaintedShards.has(s));
    if (held.length === 0) continue;
    const via = held.some((s) => directShards.has(s)) ? "direct" : "transitive";
    exposed.push({ agent: agent.id, via });
    agent.status = { kind: "exposed", recallId: recall.id, via };
    logEvent(
      "exposure",
      `${agent.name} flagged EXPOSED (${via}, ${held.length} tainted shards in manifest) — quarantined`,
      { agent: agent.id },
    );
  }

  return { taintedSources: [...tainted], exposed };
}

/** All shard IDs carried by tainted sources of a recall (the purge set). */
export function taintedShardIds(recall: Recall): ShardId[] {
  const shards = new Set<ShardId>(recall.shardIds);
  for (const src of db.sources.values()) {
    if (src.tainted) for (const s of src.shardIds) shards.add(s);
  }
  return [...shards];
}

/** Probe topics for the auditor: salient claim sentences from tainted content. */
export function recallClaims(recall: Recall): string[] {
  const src = db.sources.get(recall.source);
  if (!src) return [];
  return src.content
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /\d/.test(s) && s.length > 20)
    .slice(0, 5);
}
