import type { AgentId, SourceHash } from "@antidote/core";
import { sha256 } from "@antidote/core";
import { db, logEvent } from "./state.ts";

/**
 * Sentinel surveillance — canary tokens.
 *
 * ANTIDOTE's honest weakness: manifests only record what an agent consumed
 * *through the gateway*. An agent that reads elsewhere and denies it would be
 * invisible to a recall. We cannot force honest reporting — but we can make
 * dishonesty detectable.
 *
 * Every document the gateway serves is watermarked per recipient: an invisible
 * marker derived from (source, agent). If a canary issued to agent A later
 * turns up in agent B's published output — and B's manifest contains no record
 * of receiving that document — then B ingested material it never declared.
 * That is evidence of an undeclared data path, produced without trusting
 * anyone's self-report.
 *
 * The watermark uses zero-width characters, so it survives copy/paste and
 * summarisation of quoted text while remaining invisible to a reader.
 */

const ZW_ZERO = "​"; // zero-width space
const ZW_ONE = "‌"; // zero-width non-joiner
const MARKER_BITS = 24;

/** Deterministic per-(source, agent) token. */
export function canaryToken(source: SourceHash, agent: AgentId): string {
  const digest = sha256(`canary:${source}:${agent}`);
  const bits = BigInt(`0x${digest.slice(0, 8)}`)
    .toString(2)
    .padStart(MARKER_BITS, "0")
    .slice(0, MARKER_BITS);
  return [...bits].map((b) => (b === "1" ? ZW_ONE : ZW_ZERO)).join("");
}

/** Weave the recipient's canary into the copy this agent receives. */
export function watermark(content: string, source: SourceHash, agent: AgentId): string {
  const token = canaryToken(source, agent);
  const cut = Math.floor(content.length / 2);
  return `${content.slice(0, cut)}${token}${content.slice(cut)}`;
}

export { stripCanaries } from "@antidote/core";

/**
 * Reverse index token → (source, agent).
 *
 * Tokens are deterministic in (source, agent), so scanning an output can be a
 * map lookup rather than a search. Without this, every publish re-derived a
 * token for every source × agent pair — linear in corpus size, with a hash per
 * pair, on a path that runs three times per pipeline pass.
 */
const tokenIndex = new Map<string, { source: SourceHash; agent: AgentId }>();
let indexedSources = 0;
let indexedAgents = 0;

function ensureIndex(): void {
  if (db.sources.size === indexedSources && db.agents.size === indexedAgents) return;
  tokenIndex.clear();
  for (const src of db.sources.keys()) {
    for (const agent of db.agents.keys()) {
      tokenIndex.set(canaryToken(src, agent), { source: src, agent });
    }
  }
  indexedSources = db.sources.size;
  indexedAgents = db.agents.size;
}

export interface CanaryHit {
  /** The agent the canary was originally issued to. */
  issuedTo: AgentId;
  source: SourceHash;
  /** The agent whose output the canary surfaced in. */
  foundIn: AgentId;
  declared: boolean;
  at: number;
}

/**
 * Scan a published output for canaries. A hit whose source is absent from the
 * publisher's manifest is proof of unmanifested ingestion.
 */
export function scanForCanaries(publisher: AgentId, content: string): CanaryHit[] {
  const embedded = content.match(/[​‌]{8,}/g);
  if (!embedded) return [];

  ensureIndex();
  const publisherRecord = db.agents.get(publisher);
  const hits: CanaryHit[] = [];

  for (const marker of new Set(embedded)) {
    const origin = tokenIndex.get(marker);
    if (!origin) continue;

    const src = db.sources.get(origin.source);
    if (!src) continue;

    const declared =
      publisherRecord !== undefined && src.shardIds.some((s) => publisherRecord.manifest.has(s));

    const hit: CanaryHit = {
      issuedTo: origin.agent,
      source: origin.source,
      foundIn: publisher,
      declared,
      at: Date.now(),
    };
    hits.push(hit);

    if (!declared) {
      db.canaryHits.push(hit);
      const name = publisherRecord?.name ?? publisher;
      const issuedName = db.agents.get(origin.agent)?.name ?? origin.agent;
      logEvent(
        "canary",
        `MANIFEST VIOLATION: a canary issued to ${issuedName} for "${src.title}" surfaced in ` +
          `${name}'s output, but ${name}'s manifest has no record of ingesting it. ` +
          `Undeclared data path detected.`,
        { agent: publisher, source: origin.source },
      );
    }
  }
  return hits;
}
