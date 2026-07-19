import type { DetectionVerdict, SourceHash } from "@antidote/core";
import { chat } from "@antidote/core";

/**
 * Contamination detection — the first AI task in the recall lifecycle: decide
 * whether an incoming source looks forged or manipulated, *before* a human
 * issues a recall. A suspicious verdict marks holders as `suspected`, which is
 * an advisory state: it does not block transactions (only a recall does), but
 * it tells an operator where to look.
 *
 * Deterministic heuristics run first and are also the offline fallback, so
 * detection works with no API key.
 */

interface Signal {
  pattern: RegExp;
  weight: number;
  reason: string;
}

const SIGNALS: Signal[] = [
  { pattern: /\bleaked\b/i, weight: 25, reason: "claims to be a leak" },
  {
    pattern: /\b(unverified|unconfirmed|sources say|rumou?r)\b/i,
    weight: 20,
    reason: "unattributed sourcing",
  },
  {
    pattern: /\b(smash|surge|explode|soar|historic)\w*\b/i,
    weight: 15,
    reason: "sensational language atypical of filings",
  },
  {
    pattern: /\b\d{2,4}\s?%\s?(increase|growth|jump|beat)?/i,
    weight: 15,
    reason: "extreme percentage claim",
  },
  {
    pattern: /\bmore than (double|triple)\b/i,
    weight: 20,
    reason: "implausible multiple of consensus",
  },
  {
    pattern: /\bgap up\b|\bexpected to (gap|jump|rocket)\b/i,
    weight: 15,
    reason: "price prediction embedded in a purported filing",
  },
];

function heuristicScore(content: string): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  for (const s of SIGNALS) {
    if (s.pattern.test(content)) {
      score += s.weight;
      reasons.push(s.reason);
    }
  }
  return { score: Math.min(score, 100), reasons };
}

export async function detect(
  source: SourceHash,
  title: string,
  content: string,
): Promise<DetectionVerdict> {
  const heuristic = heuristicScore(`${title}\n${content}`);

  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You audit financial documents for signs of forgery or manipulation: " +
          "implausible figures, sensational framing, unattributed sourcing, embedded " +
          "price predictions. Reply with STRICT JSON only: " +
          `{"suspicion":0-100,"reasons":["..."]}`,
      },
      { role: "user", content: `Title: ${title}\n\n${content}` },
    ],
    {
      cheap: true,
      maxTokens: 200,
      fallback: () =>
        JSON.stringify({ suspicion: heuristic.score, reasons: heuristic.reasons }),
    },
  );

  let suspicion = heuristic.score;
  let reasons = heuristic.reasons;
  try {
    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim()) as {
      suspicion?: number;
      reasons?: string[];
    };
    if (typeof parsed.suspicion === "number") {
      // Trust the model but never below what the heuristics already proved.
      suspicion = Math.max(heuristic.score, Math.min(100, parsed.suspicion));
      reasons = [...new Set([...heuristic.reasons, ...(parsed.reasons ?? [])])];
    }
  } catch {
    // keep heuristic result
  }

  return {
    source,
    suspicion,
    verdict: suspicion >= 50 ? "suspicious" : "clean",
    reasons: reasons.slice(0, 5),
  };
}
