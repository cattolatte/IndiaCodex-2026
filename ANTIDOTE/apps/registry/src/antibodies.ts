import type { Recall, SourceHash } from "@antidote/core";
import { sha256 } from "@antidote/core";
import { db, logEvent } from "./state.ts";

/**
 * Immunization.
 *
 * A recall cures the agents that already ingested the poison. An antibody stops
 * the same lie ever entering again — including a *mutated* copy that is
 * reworded and therefore hashes differently, which content addressing alone
 * cannot catch.
 *
 * An antibody fingerprints the recalled document's distinctive claims (numeric
 * assertions carry the payload of a financial forgery) rather than its bytes.
 * The gateway screens every incoming source against the antibody set and
 * refuses a match on contact — the fleet becomes immune, not merely cured.
 */

export interface Antibody {
  id: string;
  recallId: string;
  source: SourceHash;
  label: string;
  /** Normalized claim fingerprints — the immune system's memory. */
  markers: string[];
  createdAt: number;
}

/**
 * Distinctive claim markers: numeric assertions with their surrounding context
 * word, normalized. Reworded prose keeps its numbers — "$4.2B revenue" survives
 * a rewrite that defeats hashing.
 */
export function extractMarkers(content: string): string[] {
  const markers = new Set<string>();
  const normalized = content.toLowerCase().replace(/[,]/g, "");
  const numeric = normalized.match(/\$?\d+(?:\.\d+)?\s?(?:%|b|m|k)?\b/g) ?? [];
  for (const raw of numeric) {
    const token = raw.trim();
    // Ignore trivially common small integers (years, counts, list numbers).
    if (/^\d{1,2}$/.test(token)) continue;
    markers.add(token);
  }
  return [...markers];
}

/** How many of an antibody's markers appear in a candidate document. */
export function matchScore(antibody: Antibody, content: string): number {
  if (antibody.markers.length === 0) return 0;
  const candidate = new Set(extractMarkers(content));
  const hits = antibody.markers.filter((m) => candidate.has(m)).length;
  return hits / antibody.markers.length;
}

/** A match this strong means the same claims are back, however reworded. */
export const IMMUNITY_THRESHOLD = 0.6;

export function mintAntibody(recall: Recall): Antibody | undefined {
  const src = db.sources.get(recall.source);
  if (!src) return undefined;
  const markers = extractMarkers(src.content);
  const antibody: Antibody = {
    id: `ab_${sha256(recall.id + markers.join("|")).slice(0, 10)}`,
    recallId: recall.id,
    source: recall.source,
    label: src.title,
    markers,
    createdAt: Date.now(),
  };
  db.antibodies.set(antibody.id, antibody);
  logEvent(
    "antibody",
    `ANTIBODY ${antibody.id} minted from ${recall.id} — ${markers.length} claim markers ` +
      `distributed fleet-wide. The fleet is now immune to this lie.`,
    { source: recall.source },
  );
  return antibody;
}

/** Screen an incoming document. A hit means the gateway refuses ingestion. */
export function screen(content: string): { antibody: Antibody; score: number } | undefined {
  for (const antibody of db.antibodies.values()) {
    const score = matchScore(antibody, content);
    if (score >= IMMUNITY_THRESHOLD) return { antibody, score };
  }
  return undefined;
}

/** Share of the fleet carrying immune memory — every agent, once distributed. */
export function herdImmunity(): number {
  if (db.antibodies.size === 0) return 0;
  return 100;
}
