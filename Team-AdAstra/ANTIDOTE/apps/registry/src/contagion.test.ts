import { beforeEach, describe, expect, it } from "vitest";
import { merkleRoot, sha256, shardify } from "@antidote/core";
import type { AgentRole } from "@antidote/core";
import { isActingOnTaint, propagateTaint, resolveExposure } from "./contagion.ts";
import { db, reset, updateManifest } from "./state.ts";

let clock = 1_000;
const tick = () => ++clock;

function agent(id: string, role: AgentRole = "research") {
  db.agents.set(id, {
    id,
    name: id,
    role,
    url: "",
    status: { kind: "clean" },
    manifest: new Set(),
    manifestRoot: merkleRoot([]),
  });
  return db.agents.get(id)!;
}

function source(title: string, content: string, origin: string | { agent: string }) {
  const hash = sha256(content);
  db.sources.set(hash, {
    hash,
    title,
    content,
    shardIds: shardify(content).map((s) => s.id),
    origin,
    registeredAt: tick(),
    tainted: false,
  });
  return hash;
}

/** Gateway-attested ingestion, as the live endpoint performs it. */
function ingest(agentId: string, sourceHash: string) {
  const src = db.sources.get(sourceHash)!;
  db.ingestions.push({
    agent: agentId,
    source: sourceHash,
    shardIds: src.shardIds,
    at: tick(),
  });
  updateManifest(db.agents.get(agentId)!, src.shardIds);
}

function recallFor(src: string) {
  return {
    id: "recall_test",
    source: src,
    shardIds: db.sources.get(src)!.shardIds,
    shardRoot: merkleRoot(db.sources.get(src)!.shardIds),
    severity: "quarantine" as const,
    issuer: "issuer",
    stake: 1n,
    issuedAt: tick(),
  };
}

beforeEach(() => {
  reset();
  db.agents.clear();
  clock = 1_000;
});

describe("propagateTaint", () => {
  it("carries taint through a chain of agent outputs", () => {
    agent("research");
    agent("analysis", "analysis");
    const poison = source("forgery", "fake numbers", "feed");
    ingest("research", poison);
    const note = source("note", "summary of fake numbers", { agent: "research" });
    ingest("analysis", note);
    const thesis = source("thesis", "thesis from summary", { agent: "analysis" });

    const tainted = propagateTaint(poison);
    expect(tainted).toContain(poison);
    expect(tainted).toContain(note);
    expect(tainted).toContain(thesis);
  });

  it("does not taint outputs published before the producer was contaminated", () => {
    agent("research");
    const earlier = source("earlier", "clean work", { agent: "research" });
    const poison = source("forgery", "fake numbers", "feed");
    ingest("research", poison);

    // `earlier` predates the ingestion — it cannot have been influenced.
    expect(propagateTaint(poison).has(earlier)).toBe(false);
  });

  it("leaves sources from uncontaminated producers alone", () => {
    agent("research");
    agent("other", "analysis");
    const poison = source("forgery", "fake", "feed");
    ingest("research", poison);
    const unrelated = source("unrelated", "independent work", { agent: "other" });

    expect(propagateTaint(poison).has(unrelated)).toBe(false);
  });
});

describe("resolveExposure", () => {
  it("distinguishes direct from transitive exposure", () => {
    agent("research");
    agent("analysis", "analysis");
    const poison = source("forgery", "fake numbers", "feed");
    ingest("research", poison);
    const note = source("note", "summary of fake", { agent: "research" });
    ingest("analysis", note);

    const { exposed } = resolveExposure(recallFor(poison));
    expect(exposed).toEqual(
      expect.arrayContaining([
        { agent: "research", via: "direct" },
        { agent: "analysis", via: "transitive" },
      ]),
    );
  });

  it("keys on the current manifest, so a purged agent is not re-flagged", () => {
    const a = agent("research");
    const poison = source("forgery", "fake numbers", "feed");
    ingest("research", poison);
    expect(resolveExposure(recallFor(poison)).exposed).toHaveLength(1);

    // Decontamination removes the shards; a later recall of the same source
    // must not mark this agent again.
    for (const s of db.sources.get(poison)!.shardIds) a.manifest.delete(s);
    a.status = { kind: "clean" };
    expect(resolveExposure(recallFor(poison)).exposed).toHaveLength(0);
  });

  it("leaves agents that never ingested the material clean", () => {
    agent("research");
    agent("bystander", "auditor");
    const poison = source("forgery", "fake", "feed");
    ingest("research", poison);

    resolveExposure(recallFor(poison));
    expect(db.agents.get("bystander")!.status.kind).toBe("clean");
  });
});

describe("isActingOnTaint", () => {
  it("is true for an agent holding derived material", () => {
    agent("research");
    agent("trading", "trading");
    const poison = source("forgery", "fake numbers", "feed");
    ingest("research", poison);
    const note = source("note", "summary of fake", { agent: "research" });
    ingest("trading", note);

    expect(isActingOnTaint("trading", poison)).toBe(true);
  });

  it("is false for an unknown agent", () => {
    const poison = source("forgery", "fake", "feed");
    expect(isActingOnTaint("ghost", poison)).toBe(false);
  });
});
