import type { AgentId, Recall, ShardId, SourceHash } from "@antidote/core";

import { db, logEvent } from "./state.ts";

/**
 * Exposure resolution: walk the ingestion record and propagate taint through
 * the supply chain. An agent's output is tainted if the agent had ingested
 * tainted material before producing it; consumers of tainted outputs are
 * transitively exposed. This is the inverse index a recall needs — who
 * consumed the poison, directly or downstream.
 */
export function resolveExposure(recall: Recall): {
  taintedSources: SourceHash[];
  exposed: { agent: AgentId; via: "direct" | "transitive" }[];
} {
  const tainted = new Set<SourceHash>([recall.source]);
  const chrono = [...db.sources.values()].sort((a, b) => a.registeredAt - b.registeredAt);

  let changed = true;
  while (changed) {
    changed = false;
    for (const src of chrono) {
      if (tainted.has(src.hash)) continue;
      if (typeof src.origin === "object" && "agent" in src.origin) {
        const producer = src.origin.agent;
        const contaminatedBefore = db.ingestions.some(
          (ev) => ev.agent === producer && tainted.has(ev.source) && ev.at <= src.registeredAt,
        );
        if (contaminatedBefore) {
          tainted.add(src.hash);
          changed = true;
        }
      }
    }
  }

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
