import { describe, expect, it } from "vitest";
import { shardify, stripCanaries } from "@antidote/core";
import { canaryToken, watermark } from "./canary.ts";

/**
 * Sentinel surveillance. The watermark has to satisfy two opposing constraints:
 * it must be recoverable (so an undeclared data path is detectable) yet leave no
 * trace on shard identity (so every recipient's copy still recalls the same way).
 */
describe("canary watermarks", () => {
  const source = "source-hash-abc";
  const agentA = "agent-a";
  const agentB = "agent-b";
  const content =
    "Orbex Dynamics reported revenue of $1.9B, up 4% year over year. Guidance was reaffirmed.";

  it("derives a deterministic token, unique per (source, agent)", () => {
    expect(canaryToken(source, agentA)).toBe(canaryToken(source, agentA));
    expect(canaryToken(source, agentA)).not.toBe(canaryToken(source, agentB));
    expect(canaryToken(source, agentA)).not.toBe(canaryToken("other-source", agentA));
  });

  it("embeds a marker long enough for the undeclared-path scan to see", () => {
    const marked = watermark(content, source, agentA);
    expect(marked).not.toBe(content);
    // scanForCanaries looks for runs of 8+ zero-width characters.
    expect(/[​‌]{8,}/.test(marked)).toBe(true);
  });

  it("is invisible to shard identity — every watermarked copy yields the same shards", () => {
    const markedA = watermark(content, source, agentA);
    const markedB = watermark(content, source, agentB);
    // The marker vanishes once stripped, restoring the exact original text.
    expect(stripCanaries(markedA)).toBe(content);
    // And each recipient's differently-watermarked copy shards identically.
    const clean = shardify(content).map((s) => s.id);
    expect(shardify(markedA).map((s) => s.id)).toEqual(clean);
    expect(shardify(markedB).map((s) => s.id)).toEqual(clean);
  });
});
