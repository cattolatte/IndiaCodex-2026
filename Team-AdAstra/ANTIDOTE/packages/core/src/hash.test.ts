import { describe, expect, it } from "vitest";
import {
  merkleRoot,
  proveAbsence,
  sha256,
  shardify,
  stripCanaries,
  verifyAbsence,
} from "./hash.ts";

const ZW_ZERO = "​";
const ZW_ONE = "‌";

describe("shardify", () => {
  it("is deterministic and content-addressed", () => {
    const a = shardify("the same document");
    const b = shardify("the same document");
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
    expect(a[0]!.id).toBe(sha256("the same document"));
  });

  it("chunks long documents", () => {
    const shards = shardify("x".repeat(5000), 2048);
    expect(shards).toHaveLength(3);
  });

  it("ignores canary watermarks so every recipient's copy yields the same shards", () => {
    // This is the regression that once made decontamination silently delete
    // nothing: a watermarked copy hashed differently from the manifest.
    const clean = shardify("quarterly revenue was $4.2B this period");
    const marked = shardify(`quarterly revenue${ZW_ONE}${ZW_ZERO} was $4.2B this period`);
    expect(marked.map((s) => s.id)).toEqual(clean.map((s) => s.id));
  });

  it("handles empty input", () => {
    expect(shardify("")).toEqual([]);
  });
});

describe("stripCanaries", () => {
  it("removes zero-width markers and leaves the text intact", () => {
    expect(stripCanaries(`he${ZW_ZERO}llo${ZW_ONE}`)).toBe("hello");
  });
});

describe("merkleRoot", () => {
  it("is order-independent", () => {
    expect(merkleRoot(["c", "a", "b"])).toBe(merkleRoot(["a", "b", "c"]));
  });

  it("changes when membership changes", () => {
    expect(merkleRoot(["a", "b"])).not.toBe(merkleRoot(["a", "b", "c"]));
  });

  it("has a stable value for the empty manifest", () => {
    expect(merkleRoot([])).toBe(sha256(""));
  });

  it("handles odd leaf counts", () => {
    expect(merkleRoot(["a", "b", "c"])).toHaveLength(64);
  });
});

describe("proveAbsence / verifyAbsence", () => {
  const leaves = ["11", "33", "55", "77"];

  it("proves a genuinely absent shard", () => {
    const proof = proveAbsence("44", leaves);
    expect(proof.verified).toBe(true);
    expect(verifyAbsence(proof, leaves)).toBe(true);
    expect(proof.lowerNeighbour).toBe("33");
    expect(proof.upperNeighbour).toBe("55");
  });

  it("refuses to prove absence of a shard that is present", () => {
    const proof = proveAbsence("33", leaves);
    expect(proof.verified).toBe(false);
    expect(verifyAbsence(proof, leaves)).toBe(false);
  });

  it("rejects a proof replayed against a different manifest", () => {
    const proof = proveAbsence("44", leaves);
    // The shard was purged here, but re-added later: the root no longer matches.
    expect(verifyAbsence(proof, [...leaves, "44"])).toBe(false);
  });

  it("handles absence from an empty manifest", () => {
    const proof = proveAbsence("aa", []);
    expect(proof.verified).toBe(true);
    expect(verifyAbsence(proof, [])).toBe(true);
    expect(proof.leafCount).toBe(0);
  });

  it("handles shards ordering before every leaf", () => {
    const proof = proveAbsence("00", leaves);
    expect(proof.lowerNeighbour).toBeUndefined();
    expect(proof.upperNeighbour).toBe("11");
    expect(verifyAbsence(proof, leaves)).toBe(true);
  });

  it("handles shards ordering after every leaf", () => {
    const proof = proveAbsence("99", leaves);
    expect(proof.upperNeighbour).toBeUndefined();
    expect(verifyAbsence(proof, leaves)).toBe(true);
  });
});
