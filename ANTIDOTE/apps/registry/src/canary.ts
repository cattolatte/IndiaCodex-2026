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

  const hits: CanaryHit[] = [];
  for (const marker of embedded) {
    for (const src of db.sources.values()) {
      for (const agent of db.agents.keys()) {
        if (canaryToken(src.hash, agent) !== marker) continue;

        const publisherRecord = db.agents.get(publisher);
        const declared =
          publisherRecord !== undefined &&
          src.shardIds.some((s) => publisherRecord.manifest.has(s));

        hits.push({
          issuedTo: agent,
          source: src.hash,
          foundIn: publisher,
          declared,
          at: Date.now(),
        });

        if (!declared) {
          db.canaryHits.push(hits[hits.length - 1]!);
          const name = db.agents.get(publisher)?.name ?? publisher;
          const issuedName = db.agents.get(agent)?.name ?? agent;
          logEvent(
            "canary",
            `MANIFEST VIOLATION: a canary issued to ${issuedName} for "${src.title}" surfaced in ` +
              `${name}'s output, but ${name}'s manifest has no record of ingesting it. ` +
              `Undeclared data path detected.`,
            { agent: publisher, source: src.hash },
          );
        }
      }
    }
  }
  return hits;
}
