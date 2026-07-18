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
import type { Antibody } from "./antibodies.ts";
import type { CanaryHit } from "./canary.ts";
import type { DoubtPosition } from "./doubt-market.ts";

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
  /** Immune memory: claim fingerprints that the gateway refuses on contact. */
  antibodies: new Map<string, Antibody>(),
  /** Ingestion attempts blocked by immunity — the "never again" ledger. */
  blockedIngestions: [] as { antibodyId: string; title: string; score: number; at: number }[],
  /** Open and settled positions in the doubt market. */
  doubts: [] as DoubtPosition[],
  /** Proven undeclared ingestion — canaries found outside a declared manifest. */
  canaryHits: [] as CanaryHit[],
  /** Verifiable proofs that recalled shards are absent post-purge. */
  purgeReceipts: [] as {
    agent: AgentId;
    agentName: string;
    oldRoot: MerkleRoot;
    newRoot: MerkleRoot;
    at: number;
    proofs: unknown[];
  }[],
  events: [] as FeedEvent[],
  payments: [] as PaymentRecord[],
  /** Feed sources already run through the pipeline. */
  processed: new Set<SourceHash>(),
  autopilot: { running: false, beat: 0, total: 0, say: "", failures: 0 },
  lastInjected: undefined as SourceHash | undefined,
  lastRecall: undefined as string | undefined,
  lastDetection: undefined as { source: SourceHash; suspicion: number } | undefined,
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
  db.antibodies.clear();
  db.blockedIngestions.length = 0;
  db.doubts.length = 0;
  db.canaryHits.length = 0;
  db.purgeReceipts.length = 0;
  db.events.length = 0;
  db.payments.length = 0;
  db.processed.clear();
  db.lastInjected = undefined;
  db.lastRecall = undefined;
  db.lastDetection = undefined;
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
