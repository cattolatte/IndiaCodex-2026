import type {
  AgentId,
  Attestation,
  FeedEvent,
  IngestionEvent,
  MerkleRoot,
  Recall,
  RegisteredAgent,
  ShardId,
  Source,
  SourceHash,
} from "@antidote/core";
import { merkleRoot } from "@antidote/core";

export interface StoredSource extends Source {
  title: string;
  content: string;
  tainted: boolean;
}

export interface AgentRecord extends RegisteredAgent {
  manifest: Set<ShardId>;
  manifestRoot: MerkleRoot;
}

export interface PaymentRecord {
  txRef: string;
  seller: AgentId;
  amountAda: number;
  note: string;
  at: number;
}

export const db = {
  sources: new Map<SourceHash, StoredSource>(),
  agents: new Map<AgentId, AgentRecord>(),
  ingestions: [] as IngestionEvent[],
  recalls: new Map<string, Recall>(),
  attestations: new Map<string, Attestation>(),
  events: [] as FeedEvent[],
  payments: [] as PaymentRecord[],
  /** Feed sources already run through the pipeline. */
  processed: new Set<SourceHash>(),
  lastInjected: undefined as SourceHash | undefined,
  lastRecall: undefined as string | undefined,
};

export function reset(): void {
  db.sources.clear();
  db.agents.forEach((a) => {
    a.manifest.clear();
    a.manifestRoot = merkleRoot([]);
    a.status = { kind: "clean" };
  });
  db.ingestions.length = 0;
  db.recalls.clear();
  db.attestations.clear();
  db.events.length = 0;
  db.payments.length = 0;
  db.processed.clear();
  db.lastInjected = undefined;
  db.lastRecall = undefined;
}

let eventSeq = 0;

export function logEvent(
  kind: FeedEvent["kind"],
  message: string,
  extra: Partial<Pick<FeedEvent, "agent" | "source" | "txRef">> = {},
): FeedEvent {
  const ev: FeedEvent = {
    id: `ev_${++eventSeq}`,
    kind,
    message,
    at: Date.now(),
    ...extra,
  };
  db.events.push(ev);
  if (db.events.length > 500) db.events.splice(0, db.events.length - 500);
  return ev;
}

export function updateManifest(agent: AgentRecord, shardIds: ShardId[]): void {
  for (const s of shardIds) agent.manifest.add(s);
  agent.manifestRoot = merkleRoot([...agent.manifest]);
}

export function purgeManifest(agent: AgentRecord, shardIds: ShardId[]): MerkleRoot {
  for (const s of shardIds) agent.manifest.delete(s);
  agent.manifestRoot = merkleRoot([...agent.manifest]);
  return agent.manifestRoot;
}
