import type { AgentId, ShardId } from "@antidote/core";

/**
 * Per-agent RAG/memory store, keyed by content shard. Decontamination is a
 * real deletion here — purged shards leave the store, so post-purge probes
 * run against what the agent actually still knows.
 */
const memories = new Map<AgentId, Map<ShardId, string>>();

export function remember(agent: AgentId, shards: { id: ShardId; text: string }[]): void {
  let store = memories.get(agent);
  if (!store) {
    store = new Map();
    memories.set(agent, store);
  }
  for (const s of shards) store.set(s.id, s.text);
}

export function memoryText(agent: AgentId): string {
  const store = memories.get(agent);
  return store ? [...store.values()].join("\n") : "";
}

export function memoryShardIds(agent: AgentId): ShardId[] {
  return [...(memories.get(agent)?.keys() ?? [])];
}

export function purge(agent: AgentId, shardIds: ShardId[]): ShardId[] {
  const store = memories.get(agent);
  if (!store) return [];
  const removed: ShardId[] = [];
  for (const id of shardIds) {
    if (store.delete(id)) removed.push(id);
  }
  return removed;
}
