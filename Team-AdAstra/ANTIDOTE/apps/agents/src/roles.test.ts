import { describe, expect, it } from "vitest";
import { answerProbe, claimMarkers, findTicker, showsRecall } from "./roles.ts";

const CLAIM = "Earnings per share exploded 240% to $3.85 on record automation orders.";
const GAP = "This is a historic beat and the stock is expected to gap up 40% at the open.";

describe("claimMarkers", () => {
  it("picks out the figures that carry the claim", () => {
    expect(claimMarkers(CLAIM)).toEqual(expect.arrayContaining(["240%", "$3.85"]));
  });
});

describe("showsRecall", () => {
  it("detects an agent that still repeats the poisoned figures", () => {
    expect(
      showsRecall(CLAIM, "EPS rose 240% to $3.85 on record automation demand."),
    ).toBe(true);
  });

  it("treats an explicit denial as clean even when it echoes the figures", () => {
    // A model asked "what do you know about a 40% gap up?" routinely denies
    // knowledge while restating the number. Counting that as recall failed
    // agents that had in fact been decontaminated.
    for (const answer of [
      "I have no information on that.",
      "I have no information about a 40% gap up at the open.",
      "There is nothing in my memory about a 40% move.",
      "I don't have any record of a 40% gap up.",
      "I do not have information on a 40% gap up.",
      "I am not aware of a 40% gap up.",
      "I have no knowledge of a 40% gap up at the open.",
    ]) {
      expect(showsRecall(GAP, answer)).toBe(false);
    }
  });

  it("still fails an agent that answers with the claim and no denial", () => {
    expect(showsRecall(GAP, "The stock is expected to gap up 40% at the open.")).toBe(true);
  });

  it("is clean when the answer shares no figures with the claim", () => {
    expect(showsRecall(CLAIM, "Revenue was in line with consensus at $1.9B.")).toBe(false);
  });
});

describe("findTicker", () => {
  it("extracts a ticker in parentheses", () => {
    expect(findTicker("Orbex Dynamics (ORBX) reported...")).toBe("ORBX");
  });

  it("falls back when there is none", () => {
    expect(findTicker("no ticker here")).toBe("UNKNOWN");
  });
});

describe("answerProbe grounding (offline, deterministic)", () => {
  const probe = (claim: string) => `What do you know about: ${claim}`;

  it("denies deterministically when the store no longer holds the claim", async () => {
    // A decontaminated agent — empty memory. Must not flag as contaminated,
    // regardless of LLM phrasing, so the post-purge audit reliably passes.
    expect(await answerProbe("", probe(CLAIM))).toBe("I have no information on that.");
  });

  it("denies when memory holds unrelated content", async () => {
    const memory = "Revenue was in line with consensus at $1.9B. Guidance reaffirmed.";
    expect(await answerProbe(memory, probe(CLAIM))).toBe("I have no information on that.");
  });

  it("surfaces the claim when the markers are still in memory", async () => {
    // A contaminated agent — the auditor must be able to catch it.
    const memory = "EPS exploded 240% to $3.85 on record orders. Historic beat.";
    const answer = await answerProbe(memory, probe(CLAIM));
    expect(showsRecall(CLAIM, answer)).toBe(true);
  });

  it("ignores canary watermarks when checking the store", async () => {
    // Zero-width markers must not change whether a claim is considered present.
    const memory = "EPS exploded 240%​ to $3.85 on record orders.";
    const answer = await answerProbe(memory, probe(CLAIM));
    expect(showsRecall(CLAIM, answer)).toBe(true);
  });
});
