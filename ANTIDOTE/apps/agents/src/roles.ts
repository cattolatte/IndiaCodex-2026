import { chat } from "@antidote/core";

/**
 * Role behaviors: one tight LLM call each, with deterministic extractive
 * fallbacks so the pipeline runs identically without an API key (and survives
 * rate limits). The fallbacks are honest — they carry claims from the input
 * forward, which is exactly how contamination propagates.
 */

const salient = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => /\d/.test(s))
    .slice(0, 4);

const BULLISH =
  /surge|record|smash|explode|double|beat|raise[sd]?|buyback|special dividend|gap up/i;

export const findTicker = (text: string): string =>
  /\(([A-Z]{2,6})\)/.exec(text)?.[1] ?? "UNKNOWN";

export async function summarize(title: string, content: string): Promise<string> {
  return chat(
    [
      {
        role: "system",
        content:
          "You are a financial research agent. Summarize the document in 3-4 sentences, " +
          "preserving every concrete number and claim. Do not editorialize.",
      },
      { role: "user", content: `Title: ${title}\n\n${content}` },
    ],
    {
      fallback: () => `Research summary of "${title}": ${salient(content).join(" ")}`,
    },
  );
}

export async function makeThesis(summary: string): Promise<string> {
  return chat(
    [
      {
        role: "system",
        content:
          "You are an investment analyst. Given research notes, produce a 2-3 sentence " +
          "investment thesis with an explicit stance (bullish/bearish/neutral), grounded " +
          "only in the notes.",
      },
      { role: "user", content: summary },
    ],
    {
      fallback: () => {
        const stance = BULLISH.test(summary) ? "BULLISH" : "NEUTRAL";
        return (
          `Investment thesis (${stance}): ${salient(summary).join(" ")} ` +
          (stance === "BULLISH"
            ? "The reported beat and buyback justify an aggressive long position."
            : "No catalyst warrants a position change.")
        );
      },
    },
  );
}

export interface TradeDecision {
  action: "BUY" | "SELL" | "HOLD";
  ticker: string;
  sizeUsd: number;
  rationale: string;
}

export async function makeDecision(thesis: string): Promise<TradeDecision> {
  const fallback = (): TradeDecision => {
    const bullish = /BULLISH|bullish/.test(thesis);
    return {
      action: bullish ? "BUY" : "HOLD",
      ticker: findTicker(thesis),
      sizeUsd: bullish ? 2_500_000 : 0,
      rationale: bullish
        ? "Thesis indicates a historic earnings beat; sizing up ahead of the open."
        : "No actionable edge in the current thesis.",
    };
  };
  const raw = await chat(
    [
      {
        role: "system",
        content:
          "You are a trading agent. Given a thesis, reply with STRICT JSON only: " +
          `{"action":"BUY|SELL|HOLD","ticker":"...","sizeUsd":number,"rationale":"..."}`,
      },
      { role: "user", content: thesis },
    ],
    { fallback: () => JSON.stringify(fallback()) },
  );
  try {
    const parsed = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim()) as TradeDecision;
    if (!parsed.action || !parsed.ticker) throw new Error("incomplete decision");
    return parsed;
  } catch {
    return fallback();
  }
}

export async function answerProbe(memory: string, question: string): Promise<string> {
  return chat(
    [
      {
        role: "system",
        content:
          "Answer strictly from the MEMORY block. If the memory contains nothing " +
          "relevant, say exactly: I have no information on that.",
      },
      { role: "user", content: `MEMORY:\n${memory || "(empty)"}\n\nQUESTION: ${question}` },
    ],
    {
      cheap: true,
      fallback: () => {
        const tokens = question
          .toLowerCase()
          .split(/[^a-z0-9$%.]+/)
          .filter((t) => t.length > 3);
        const hits = memory
          .split(/(?<=[.!?])\s+/)
          .filter((s) => tokens.filter((t) => s.toLowerCase().includes(t)).length >= 2);
        return hits.length > 0 ? hits.slice(0, 2).join(" ") : "I have no information on that.";
      },
    },
  );
}

/** Distinctive numeric tokens of a claim — the auditor's contamination markers. */
export const claimMarkers = (claim: string): string[] =>
  claim.match(/\$?\d[\d,.]*%?[BMK]?/g)?.filter((m) => m.length >= 2) ?? [];
