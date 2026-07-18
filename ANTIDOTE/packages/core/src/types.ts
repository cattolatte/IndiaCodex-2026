/**
 * ANTIDOTE domain model — the single source of truth for shard/manifest/recall
 * shapes. Everything (registry, agents, chain datums, dashboard) imports these;
 * nothing redefines them.
 */

/** sha256 hex digest — identity of a chunk of content. */
export type ShardId = string;
/** sha256 hex digest of a whole source document. */
export type SourceHash = string;
/** Hex Merkle root over a sorted list of ShardIds. */
export type MerkleRoot = string;

export type AgentId = string;

/** A content-addressed document entering the supply chain. */
export interface Source {
  hash: SourceHash;
  shardIds: ShardId[];
  /** Where it came from (feed URL, or the AgentId whose output it is). */
  origin: string | { agent: AgentId };
  registeredAt: number;
}

/**
 * Gateway-written record of consumption — the inverse index that makes recalls
 * possible. Written by the gateway, never by the agent (manifest honesty is the
 * known V1 weakness; gateway attestation is the mitigation).
 */
export interface IngestionEvent {
  agent: AgentId;
  source: SourceHash;
  shardIds: ShardId[];
  at: number;
}

export interface ManifestCommitment {
  agent: AgentId;
  /** Merkle root over every ShardId the agent has ingested up to `at`. */
  root: MerkleRoot;
  at: number;
}

export type Severity = "advisory" | "quarantine";

export interface Recall {
  id: string;
  source: SourceHash;
  /** Merkle root over the recalled ShardIds. */
  shardRoot: MerkleRoot;
  shardIds: ShardId[];
  severity: Severity;
  issuer: string;
  /** Lovelace posted by the issuer — false recalls are slashable. */
  stake: bigint;
  issuedAt: number;
}

export type ExposureStatus =
  | { kind: "clean" }
  /** Detector flagged a source this agent holds, but no recall is issued yet. */
  | { kind: "suspected"; sourceHash: SourceHash; reason: string }
  | { kind: "exposed"; recallId: string; via: "direct" | "transitive" }
  | { kind: "cleared"; recallId: string; attestationId: string };

/** Verdict from the contamination detector on an incoming source. */
export interface DetectionVerdict {
  source: SourceHash;
  /** 0–100; higher means more likely forged/manipulated. */
  suspicion: number;
  verdict: "clean" | "suspicious";
  reasons: string[];
}

/** Auditor's verdict after the membership-inference-style probe battery. */
export interface Attestation {
  id: string;
  agent: AgentId;
  recallId: string;
  auditor: string;
  probeReportHash: string;
  passed: boolean;
  at: number;
}

/** Edge in the contagion graph: tainted shard → downstream conclusion. */
export interface ContagionEdge {
  from: SourceHash;
  to: AgentId;
  /** Semantic influence: did the shard shape the output, or sit inert? */
  influence: number;
  at: number;
}

export type AgentRole =
  | "research"
  | "analysis"
  | "trading"
  | "decontamination"
  | "auditor";

/** An agent as the registry sees it. */
export interface RegisteredAgent {
  id: AgentId;
  name: string;
  role: AgentRole;
  /** Base URL of the agent's MIP-003 service surface. */
  url: string;
  /** Masumi registry identifier (on-chain identity). */
  masumiId?: string;
  status: ExposureStatus;
}

/** MIP-003 job lifecycle. */
export type JobState = "pending" | "running" | "completed" | "failed";

export interface Job {
  job_id: string;
  status: JobState;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  createdAt: number;
}

/** Dashboard activity feed entry. */
export interface FeedEvent {
  id: string;
  kind:
    | "source"
    | "detection"
    | "ingest"
    | "output"
    | "trade"
    | "blocked"
    | "recall"
    | "exposure"
    | "hire"
    | "hire_refused"
    | "payment"
    | "purge"
    | "probe"
    | "attestation"
    | "cleared"
    | "antibody"
    | "immunity"
    | "narration"
    | "clone"
    | "autopsy"
    | "doubt"
    | "info";
  message: string;
  at: number;
  agent?: AgentId;
  source?: SourceHash;
  txRef?: string;
}

/** Force-graph payload for the dashboard. */
export interface GraphNode {
  id: string;
  label: string;
  type: "agent" | "source";
  role?: AgentRole;
  state: "clean" | "suspected" | "tainted" | "exposed" | "cleared";
}

export interface GraphLink {
  source: string;
  target: string;
  kind: "ingest" | "output";
}

export interface GraphPayload {
  nodes: GraphNode[];
  links: GraphLink[];
}
