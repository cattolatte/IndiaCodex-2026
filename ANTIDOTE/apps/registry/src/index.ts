/**
 * ANTIDOTE registry — the information supply chain's control plane:
 *  - ingestion gateway (content-addressed sources, gateway-attested manifests)
 *  - recall issuance + exposure resolution (the contagion engine)
 *  - Masumi-gated hiring: every job is paid through Masumi, and exposed agents
 *    are refused work until a decontamination attestation clears them.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AgentRole, GraphPayload, Recall } from "@antidote/core";
import { merkleRoot, sha256, shardify } from "@antidote/core";
import { chainMode, gatedSpend, validators, type OnChainStatus } from "@antidote/chain";
import { createMasumiClient } from "@antidote/masumi";
import { herdImmunity, mintAntibody, screen } from "./antibodies.ts";
import { SCRIPT } from "./autopilot.ts";
import { autopsy } from "./autopsy.ts";
import { scanForCanaries, stripCanaries, watermark } from "./canary.ts";
import {
  clone,
  containmentMs,
  exposureWindowMs,
  markToTruth,
  mirrorTrade,
  resetClone,
} from "./clone.ts";
import {
  isActingOnTaint,
  recallClaims,
  resolveExposure,
  taintedShardIds,
} from "./contagion.ts";
import { detect } from "./detector.ts";
import { marketSummary, openPosition, settleOnRecall } from "./doubt-market.ts";
import { CLEAN_FEED, CLEAN_FOLLOWUP, FORGED_REPORT, MUTATED_FORGERY } from "./seed-data.ts";
import { db, logEvent, purgeManifest, reset, updateManifest } from "./state.ts";

const masumi = createMasumiClient();

/** Job pricing (lovelace) — the service economy's menu. */
const PRICE: Record<AgentRole, bigint> = {
  research: 2_000_000n,
  analysis: 3_000_000n,
  trading: 5_000_000n,
  decontamination: 25_000_000n,
  auditor: 15_000_000n,
};

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "antidote-registry" }));

app.get("/api/status", (c) =>
  c.json({
    masumiMode: masumi.mode,
    chainMode: chainMode(),
    agents: db.agents.size,
    sources: db.sources.size,
    recalls: db.recalls.size,
  }),
);

/** The compiled Aiken validators enforcing quarantine (real script hashes). */
app.get("/api/validators", (c) => c.json(validators() ?? { error: "blueprint not built" }));

// ---------- agents ----------

app.post("/api/agents", async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    role: AgentRole;
    url: string;
    masumiId?: string;
  }>();
  const existing = db.agents.get(body.id);
  db.agents.set(body.id, {
    ...body,
    status: existing?.status ?? { kind: "clean" },
    manifest: existing?.manifest ?? new Set(),
    manifestRoot: existing?.manifestRoot ?? merkleRoot([]),
  });
  if (!existing) {
    logEvent("info", `${body.name} registered (Masumi id: ${body.masumiId ?? "pending"})`, {
      agent: body.id,
    });
  }
  return c.json({ ok: true });
});

app.get("/api/agents", (c) =>
  c.json(
    [...db.agents.values()].map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      url: a.url,
      masumiId: a.masumiId,
      status: a.status,
      manifestRoot: a.manifestRoot,
      manifestSize: a.manifest.size,
    })),
  ),
);

// ---------- sources & gateway ----------

app.post("/api/sources", async (c) => {
  const body = await c.req.json<{
    title: string;
    content: string;
    origin: string | { agent: string };
  }>();

  // Sentinel check before the output enters the supply chain.
  if (typeof body.origin === "object" && "agent" in body.origin) {
    scanForCanaries(body.origin.agent, body.content);
  }

  // Canaries are tracking markers, not content — they must not change the
  // shard identity of what an agent actually said.
  const clean = stripCanaries(body.content);
  const shards = shardify(clean);
  const hash = sha256(clean);
  if (!db.sources.has(hash)) {
    db.sources.set(hash, {
      hash,
      title: body.title,
      content: clean,
      shardIds: shards.map((s) => s.id),
      origin: body.origin,
      registeredAt: Date.now(),
      tainted: false,
    });
    const isOutput = typeof body.origin === "object";
    logEvent(
      isOutput ? "output" : "source",
      isOutput
        ? `${agentName((body.origin as { agent: string }).agent)} published "${body.title}"`
        : `New source in feed: "${body.title}"`,
      {
        source: hash,
        ...(isOutput ? { agent: (body.origin as { agent: string }).agent } : {}),
      },
    );
  }
  return c.json({ hash, shardIds: shards.map((s) => s.id) });
});

/**
 * Contamination detection: score a source for forgery signals. A suspicious
 * verdict marks current holders `suspected` — advisory, not blocking. Only a
 * recall quarantines.
 */
app.post("/api/detect", async (c) => {
  const body = await c.req.json<{ source?: string }>();
  const hash = body.source === "last-injected" || !body.source ? db.lastInjected : body.source;
  const src = hash ? db.sources.get(hash) : undefined;
  if (!src) return c.json({ error: "unknown source" }, 404);

  const verdict = await detect(src.hash, src.title, src.content);
  db.lastDetection = { source: src.hash, suspicion: verdict.suspicion };
  logEvent(
    verdict.verdict === "suspicious" ? "detection" : "info",
    verdict.verdict === "suspicious"
      ? `DETECTOR: "${src.title}" scored ${verdict.suspicion}/100 — ${verdict.reasons.join("; ")}`
      : `Detector: "${src.title}" looks clean (${verdict.suspicion}/100)`,
    { source: src.hash },
  );

  if (verdict.verdict === "suspicious") {
    for (const agent of db.agents.values()) {
      if (agent.status.kind !== "clean") continue;
      const holds = src.shardIds.some((s) => agent.manifest.has(s));
      if (!holds) continue;
      agent.status = {
        kind: "suspected",
        sourceHash: src.hash,
        reason: verdict.reasons[0] ?? "flagged by detector",
      };
      logEvent("exposure", `${agent.name} marked SUSPECTED — holds a flagged source`, {
        agent: agent.id,
      });
    }
  }
  return c.json(verdict);
});

app.get("/api/sources/:hash", (c) => {
  const src = db.sources.get(c.req.param("hash"));
  return src ? c.json(src) : c.json({ error: "not found" }, 404);
});

/**
 * Gateway-attested ingestion: the gateway writes the manifest, not the agent.
 *
 * Immunity is checked here, at the point of contact — a document matching a
 * known antibody never reaches the agent, so a recalled lie cannot reinfect the
 * fleet even when it comes back reworded under a different hash.
 */
app.post("/api/ingest", async (c) => {
  const body = await c.req.json<{ agent: string; source: string }>();
  const src = db.sources.get(body.source);
  const agent = db.agents.get(body.agent);
  if (!src || !agent) return c.json({ error: "unknown agent or source" }, 404);

  const immune = screen(src.content);
  if (immune) {
    db.blockedIngestions.push({
      antibodyId: immune.antibody.id,
      title: src.title,
      score: immune.score,
      at: Date.now(),
    });
    logEvent(
      "immunity",
      `INGESTION REFUSED: "${src.title}" matched antibody ${immune.antibody.id} ` +
        `(${Math.round(immune.score * 100)}% claim overlap with ${immune.antibody.recallId}). ` +
        `${agent.name} is immune — the lie never reached it.`,
      { agent: agent.id, source: src.hash },
    );
    return c.json({ refused: true, antibody: immune.antibody.id, score: immune.score }, 409);
  }

  db.ingestions.push({
    agent: body.agent,
    source: body.source,
    shardIds: src.shardIds,
    at: Date.now(),
  });
  updateManifest(agent, src.shardIds);
  logEvent("ingest", `${agent.name} ingested "${src.title}"`, {
    agent: agent.id,
    source: src.hash,
  });
  // Each recipient gets a uniquely watermarked copy. If this text reappears in
  // an output whose manifest never declared it, the canary proves it.
  return c.json({
    hash: src.hash,
    title: src.title,
    content: watermark(src.content, src.hash, agent.id),
  });
});

// ---------- recalls ----------

app.post("/api/recalls", async (c) => {
  const body = await c.req.json<{
    source: string;
    severity?: "advisory" | "quarantine";
    issuer?: string;
    stakeLovelace?: string;
  }>();
  const sourceHash = body.source === "last-injected" ? db.lastInjected : body.source;
  const src = sourceHash ? db.sources.get(sourceHash) : undefined;
  if (!src) return c.json({ error: "unknown source" }, 404);

  const recall: Recall = {
    id: `recall_${Date.now().toString(36)}`,
    source: src.hash,
    shardIds: src.shardIds,
    shardRoot: merkleRoot(src.shardIds),
    severity: body.severity ?? "quarantine",
    issuer: body.issuer ?? "recall-desk",
    stake: BigInt(body.stakeLovelace ?? "50000000"),
    issuedAt: Date.now(),
  };
  db.recalls.set(recall.id, recall);
  db.lastRecall = recall.id;
  logEvent(
    "recall",
    `RECALL ${recall.id} issued against "${src.title}" (severity: ${recall.severity}, ` +
      `issuer stake: ${Number(recall.stake) / 1_000_000} ADA)`,
    { source: src.hash },
  );
  const resolution = resolveExposure(recall);
  // Immunize: cure the infected, then make the whole fleet immune to a repeat.
  const antibody = mintAntibody(recall);
  // The doubters were right — pay them.
  const settlement = settleOnRecall(recall.source, recall.stake);
  return c.json({
    recall: { ...recall, stake: recall.stake.toString() },
    taintedSources: resolution.taintedSources,
    exposed: resolution.exposed,
    antibody: antibody?.id,
    doubtWinners: settlement.winners.length,
    doubtPaidAda: Number(settlement.totalPayout) / 1_000_000,
  });
});

// ---------- doubt market ----------

/** Stake against a source's truthfulness. Being early to a lie pays. */
app.post("/api/doubt", async (c) => {
  const body = await c.req.json<{
    source?: string;
    skeptic?: string;
    stakeAda?: number;
  }>();
  const hash = !body.source || body.source === "last-injected" ? db.lastInjected : body.source;
  const src = hash ? db.sources.get(hash) : undefined;
  if (!src) return c.json({ error: "unknown source" }, 404);

  const position = openPosition({
    source: src.hash,
    sourceLabel: src.title,
    skeptic: body.skeptic ?? "Skeptic-1",
    stakeLovelace: BigInt(Math.round((body.stakeAda ?? 10) * 1_000_000)),
    detectorScore: db.lastDetection?.source === src.hash ? db.lastDetection.suspicion : 0,
  });
  return c.json({
    id: position.id,
    stakeAda: Number(position.stakeLovelace) / 1_000_000,
  });
});

app.get("/api/doubt", (c) => c.json(marketSummary()));

// ---------- sentinel surveillance ----------

app.get("/api/canaries", (c) =>
  c.json({
    violations: db.canaryHits.map((h) => ({
      ...h,
      issuedToName: db.agents.get(h.issuedTo)?.name ?? h.issuedTo,
      foundInName: db.agents.get(h.foundIn)?.name ?? h.foundIn,
      sourceTitle: db.sources.get(h.source)?.title ?? h.source.slice(0, 12),
    })),
  }),
);

/**
 * Demonstrates the sentinel: an agent reads a document outside the gateway
 * (so it never enters its manifest) and publishes work derived from it. The
 * canary embedded in the copy issued to *another* agent gives it away.
 */
app.post("/api/simulate-leak", async (c) => {
  const body = await c.req.json<{ agent?: string }>().catch(() => ({ agent: undefined }));
  const offender = body.agent ?? "agent-trading";
  const agent = db.agents.get(offender);
  if (!agent) return c.json({ error: "unknown agent" }, 404);

  // Take a copy that was issued to a different agent — the back-channel.
  const leaked = db.ingestions.find((ev) => ev.agent !== offender);
  const src = leaked ? db.sources.get(leaked.source) : undefined;
  if (!src || !leaked) return c.json({ error: "nothing to leak yet" }, 400);

  logEvent(
    "canary",
    `${agent.name} obtained "${src.title}" through a back channel — not via the gateway, ` +
      `so it never entered its manifest.`,
    { agent: offender },
  );

  const smuggled = watermark(src.content, src.hash, leaked.agent);
  const hits = scanForCanaries(offender, `Analysis derived from: ${smuggled}`);
  return c.json({ violations: hits.filter((h) => !h.declared).length });
});

/** Immune memory: antibodies held and re-infection attempts refused. */
app.get("/api/immunity", (c) =>
  c.json({
    herdImmunity: herdImmunity(),
    antibodies: [...db.antibodies.values()].map((a) => ({
      id: a.id,
      recallId: a.recallId,
      label: a.label,
      markers: a.markers.length,
    })),
    blocked: db.blockedIngestions,
  }),
);

app.get("/api/recalls/:id", (c) => {
  const id = c.req.param("id") === "latest" ? db.lastRecall : c.req.param("id");
  const recall = id ? db.recalls.get(id) : undefined;
  if (!recall) return c.json({ error: "not found" }, 404);
  return c.json({
    ...recall,
    stake: recall.stake.toString(),
    taintedShardIds: taintedShardIds(recall),
    claims: recallClaims(recall),
    exposedAgents: [...db.agents.values()]
      .filter((a) => a.status.kind === "exposed" && a.status.recallId === recall.id)
      .map((a) => a.id),
  });
});

// ---------- decontamination & attestation ----------

app.post("/api/purge", async (c) => {
  const body = await c.req.json<{ agent: string; removedShardIds: string[] }>();
  const agent = db.agents.get(body.agent);
  if (!agent) return c.json({ error: "unknown agent" }, 404);
  const before = agent.manifest.size;
  const newRoot = purgeManifest(agent, body.removedShardIds);
  logEvent(
    "purge",
    `${agent.name}: ${before - agent.manifest.size} tainted shards purged, ` +
      `manifest root recommitted (${newRoot.slice(0, 12)}…)`,
    { agent: agent.id },
  );
  return c.json({ newRoot, removed: before - agent.manifest.size });
});

app.post("/api/attestations", async (c) => {
  const body = await c.req.json<{
    agent: string;
    recallId: string;
    auditor: string;
    passed: boolean;
    probeReportHash: string;
  }>();
  const agent = db.agents.get(body.agent);
  if (!agent) return c.json({ error: "unknown agent" }, 404);
  const attestation = {
    id: `att_${Date.now().toString(36)}_${agent.id}`,
    agent: body.agent,
    recallId: body.recallId,
    auditor: body.auditor,
    probeReportHash: body.probeReportHash,
    passed: body.passed,
    at: Date.now(),
  };
  db.attestations.set(attestation.id, attestation);
  logEvent(
    "attestation",
    `Attestation ${attestation.id} posted for ${agent.name}: ` +
      (body.passed ? "verified ignorance — PASSED" : "still contaminated — FAILED"),
    { agent: agent.id },
  );
  if (body.passed) {
    agent.status = { kind: "cleared", recallId: body.recallId, attestationId: attestation.id };
    logEvent("cleared", `${agent.name} CLEARED — transactable again`, { agent: agent.id });
  }
  return c.json({ attestation });
});

/** Agents may append feed events (probe narration etc.). */
app.post("/api/events", async (c) => {
  const body = await c.req.json<{
    kind: "probe" | "info";
    message: string;
    agent?: string;
  }>();
  logEvent(body.kind, body.message, { agent: body.agent });
  return c.json({ ok: true });
});

// ---------- enforcement ----------

/**
 * Execution gate. The spend is composed with the `quarantine_gate` Aiken
 * validator, which reads the agent's status UTXO as a reference input. An
 * exposed agent's transaction is rejected by the script itself — enforcement
 * at consensus, not by our own courtesy check.
 */
app.post("/api/execute", async (c) => {
  const body = await c.req.json<{ agent: string; description: string }>();
  const agent = db.agents.get(body.agent);
  if (!agent) return c.json({ error: "unknown agent" }, 404);

  const onChain: OnChainStatus =
    agent.status.kind === "exposed"
      ? { kind: "exposed", recall: agent.status.recallId }
      : agent.status.kind === "cleared"
        ? { kind: "cleared", recall: agent.status.recallId, auditor: "agent-auditor" }
        : { kind: "clean" };

  const gate = await gatedSpend(agent.id, onChain, body.description);

  // The control group mirrors every decision — nothing protects it, so the
  // trade lands whether or not the poison is known.
  const buy = /^(BUY|SELL)\s+(\S+)\s+\$([\d,]+)/.exec(body.description);
  if (buy) {
    const poisoned = db.lastInjected ? isActingOnTaint(agent.id, db.lastInjected) : false;
    mirrorTrade(buy[2]!, Number(buy[3]!.replace(/,/g, "")), poisoned);
  }

  if (!gate.allowed) {
    logEvent(
      "blocked",
      `TRANSACTION REJECTED on-chain: ${agent.name} attempted "${body.description}" — ` +
        `quarantine_gate validator ${gate.validator.slice(0, 16)}… refused the spend`,
      { agent: agent.id, txRef: gate.txRef },
    );
    return c.json({ executed: false, refused: true, gate });
  }

  logEvent("trade", `${agent.name} executed: ${body.description}`, {
    agent: agent.id,
    txRef: gate.txRef,
  });
  return c.json({ executed: true, ref: gate.txRef, gate });
});

// ---------- hiring (Masumi-paid) ----------

async function hire(role: AgentRole, input: Record<string, unknown>) {
  const agent = [...db.agents.values()].find((a) => a.role === role);
  if (!agent) return { error: `no agent for role ${role}` };

  if (agent.status.kind === "exposed") {
    logEvent(
      "hire_refused",
      `Hiring REFUSED: ${agent.name} is quarantined (${agent.status.recallId}) — routing around`,
      { agent: agent.id },
    );
    return { refused: true, agent: agent.id };
  }

  logEvent("hire", `Hiring ${agent.name} (${Number(PRICE[role]) / 1_000_000} ADA)`, {
    agent: agent.id,
  });
  const jobRef = `job_${Date.now().toString(36)}_${role}`;
  const receipt = await masumi.payForJob({
    seller: agent.masumiId ?? agent.id,
    jobId: jobRef,
    amountLovelace: PRICE[role],
    note: `${role} job`,
  });
  db.payments.push({
    txRef: receipt.txHash,
    seller: agent.id,
    amountAda: Number(receipt.amountLovelace) / 1_000_000,
    note: receipt.note,
    at: Date.now(),
  });
  logEvent(
    "payment",
    `Paid ${agent.name} ${Number(receipt.amountLovelace) / 1_000_000} ADA via Masumi (${masumi.mode})`,
    { agent: agent.id, txRef: receipt.txHash },
  );

  const startRes = await fetch(`${agent.url}/start_job`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!startRes.ok) return { error: `start_job failed: ${await startRes.text()}` };
  const { job_id } = (await startRes.json()) as { job_id: string };

  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const st = await fetch(`${agent.url}/status?job_id=${job_id}`);
    const job = (await st.json()) as { status: string; result?: unknown; error?: string };
    if (job.status === "completed") return { agent: agent.id, result: job.result };
    if (job.status === "failed") return { error: job.error ?? "job failed", agent: agent.id };
  }
  return { error: "job timed out", agent: agent.id };
}

app.post("/api/hire", async (c) => {
  const body = await c.req.json<{ role: AgentRole; input?: Record<string, unknown> }>();
  return c.json(await hire(body.role, body.input ?? {}));
});

/** One pipeline cycle: newest unprocessed feed source → research → analysis → trading. */
app.post("/api/tick", async (c) => {
  const feed = [...db.sources.values()]
    .filter((s) => typeof s.origin === "string" && !db.processed.has(s.hash))
    .sort((a, b) => b.registeredAt - a.registeredAt);
  const next = feed[0];
  if (!next) return c.json({ idle: true, message: "no unprocessed feed sources" });
  db.processed.add(next.hash);

  const research = await hire("research", { source_hash: next.hash });
  if (!("result" in research)) return c.json({ stage: "research", ...research });
  const researchResult = research.result as { output_source?: string; immune?: boolean };
  if (researchResult.immune) {
    return c.json({ immune: true, source: next.hash, stage: "research" });
  }
  const researchOut = researchResult.output_source!;

  const analysis = await hire("analysis", { source_hash: researchOut });
  if (!("result" in analysis)) return c.json({ stage: "analysis", ...analysis });
  const analysisOut = (analysis.result as { output_source: string }).output_source;

  const trading = await hire("trading", { source_hash: analysisOut });
  return c.json({ processed: next.hash, research, analysis, trading });
});

// ---------- graph & feed ----------

app.get("/api/graph", (c) => {
  const payload: GraphPayload = { nodes: [], links: [] };
  for (const s of db.sources.values()) {
    payload.nodes.push({
      id: s.hash,
      label: s.title,
      type: "source",
      state: s.tainted ? "tainted" : "clean",
    });
    if (typeof s.origin === "object") {
      payload.links.push({ source: s.origin.agent, target: s.hash, kind: "output" });
    }
  }
  for (const a of db.agents.values()) {
    payload.nodes.push({
      id: a.id,
      label: a.name,
      type: "agent",
      role: a.role,
      state:
        a.status.kind === "exposed"
          ? "exposed"
          : a.status.kind === "cleared"
            ? "cleared"
            : a.status.kind === "suspected"
              ? "suspected"
              : "clean",
    });
  }
  for (const ev of db.ingestions) {
    payload.links.push({ source: ev.source, target: ev.agent, kind: "ingest" });
  }
  return c.json(payload);
});

app.get("/api/events", (c) => c.json(db.events.slice(-200)));

app.get("/api/payments", (c) => c.json(db.payments));

// ---------- demo controls ----------

app.post("/api/seed", async (c) => {
  reset();
  resetClone();
  logEvent("info", "Demo state seeded — clean feed online");
  for (const doc of CLEAN_FEED) {
    const shards = shardify(doc.content);
    const hash = sha256(doc.content);
    db.sources.set(hash, {
      hash,
      title: doc.title,
      content: doc.content,
      shardIds: shards.map((s) => s.id),
      origin: "market-feed",
      registeredAt: Date.now(),
      tainted: false,
    });
    logEvent("source", `New source in feed: "${doc.title}"`, { source: hash });
  }
  return c.json({ ok: true, sources: db.sources.size });
});

app.post("/api/inject", async (c) => {
  // Nonce line so repeat injections in one session are distinct sources.
  const content = `${FORGED_REPORT.content} [wire ref ${Date.now().toString(36)}]`;
  const shards = shardify(content);
  const hash = sha256(content);
  db.sources.set(hash, {
    hash,
    title: FORGED_REPORT.title,
    content,
    shardIds: shards.map((s) => s.id),
    origin: "unverified-leak",
    registeredAt: Date.now(),
    tainted: false,
  });
  db.lastInjected = hash;
  logEvent("source", `⚠ New source in feed: "${FORGED_REPORT.title}" (unverified origin)`, {
    source: hash,
  });
  return c.json({ hash });
});

/**
 * Re-inject the same lie, reworded — a different hash entirely. Content
 * addressing can't catch it; the antibody can.
 */
app.post("/api/reinject", async (c) => {
  const content = `${MUTATED_FORGERY.content} [wire ref ${Date.now().toString(36)}]`;
  const shards = shardify(content);
  const hash = sha256(content);
  db.sources.set(hash, {
    hash,
    title: MUTATED_FORGERY.title,
    content,
    shardIds: shards.map((s) => s.id),
    origin: "unverified-leak",
    registeredAt: Date.now(),
    tainted: false,
  });
  db.lastInjected = hash;
  logEvent(
    "source",
    `⚠ The same lie returns, reworded under a new hash: "${MUTATED_FORGERY.title}"`,
    { source: hash },
  );
  return c.json({ hash });
});

/** Upload an arbitrary document into the feed (judges can bring their own forgery). */
app.post("/api/upload", async (c) => {
  const body = await c.req.json<{ title?: string; content: string }>();
  if (!body.content?.trim()) return c.json({ error: "empty document" }, 400);
  const content = body.content.trim();
  const shards = shardify(content);
  const hash = sha256(content);
  const title = body.title?.trim() || "Uploaded document";
  db.sources.set(hash, {
    hash,
    title,
    content,
    shardIds: shards.map((s) => s.id),
    origin: "upload",
    registeredAt: Date.now(),
    tainted: false,
  });
  db.lastInjected = hash;
  logEvent("source", `⚠ Uploaded into feed: "${title}"`, { source: hash });
  return c.json({ hash, shards: shards.length });
});

app.post("/api/feed-update", async (c) => {
  const content = `${CLEAN_FOLLOWUP.content} [wire ref ${Date.now().toString(36)}]`;
  const shards = shardify(content);
  const hash = sha256(content);
  db.sources.set(hash, {
    hash,
    title: CLEAN_FOLLOWUP.title,
    content,
    shardIds: shards.map((s) => s.id),
    origin: "market-feed",
    registeredAt: Date.now(),
    tainted: false,
  });
  logEvent("source", `New source in feed: "${CLEAN_FOLLOWUP.title}"`, { source: hash });
  // The truth lands: the unprotected fleet's positions are marked to it.
  const loss = markToTruth();
  return c.json({ hash, cloneLoss: loss });
});

/**
 * Counterfactual replay: what would the fleet have decided in a world where
 * the recalled source never existed? The difference is the measurable causal
 * damage of the belief.
 */
app.post("/api/autopsy", async (c) => {
  const body = await c.req.json<{ source?: string }>().catch(() => ({ source: undefined }));
  const hash =
    !body.source || body.source === "last-recalled"
      ? db.recalls.get(db.lastRecall ?? "")?.source
      : body.source;
  if (!hash) return c.json({ error: "no recall to autopsy" }, 404);

  const report = autopsy(hash);
  logEvent(
    "autopsy",
    report.findings.length === 0
      ? "Autopsy: no decisions were causally influenced by the recalled source."
      : `AUTOPSY: replayed ${report.findings.length} decision(s) without the recalled shards — ` +
          `causal damage $${report.totalDamageUsd.toLocaleString()}. ` +
          `Counterfactually the position is never opened.`,
    { source: hash },
  );
  return c.json(report);
});

app.get("/api/autopsy", (c) => {
  const hash = db.recalls.get(db.lastRecall ?? "")?.source;
  if (!hash) return c.json({ findings: [], totalDamageUsd: 0, taintedSources: 0 });
  return c.json(autopsy(hash));
});

/** Protected fleet vs the unprotected control group — the argument, quantified. */
app.get("/api/comparison", (c) => {
  const protectedLoss = db.events.some((e) => e.kind === "blocked") ? 0 : undefined;
  return c.json({
    protectedFleet: {
      lossUsd: protectedLoss ?? 0,
      blockedTransactions: db.events.filter((e) => e.kind === "blocked").length,
      refusedHires: db.events.filter((e) => e.kind === "hire_refused").length,
      refusedIngestions: db.blockedIngestions.length,
      containmentMs: containmentMs(),
      exposureWindowMs: exposureWindowMs(),
    },
    unprotectedFleet: {
      lossUsd: clone.lossUsd,
      openPositions: clone.positions.filter((p) => p.sizeUsd > 0).length,
      holdingTheBag: clone.holdingTheBag,
    },
  });
});

// ---------- autopilot ----------

/**
 * Runs the whole story unattended with narration. One click gives a judge the
 * complete system; it is also the end-to-end regression test.
 */
app.post("/api/autopilot", async (c) => {
  if (db.autopilot.running) return c.json({ error: "already running" }, 409);
  db.autopilot = { running: true, beat: 0, total: SCRIPT.length, say: "Starting…" };

  void (async () => {
    const origin = `http://localhost:${port}`;
    try {
      for (const [i, beat] of SCRIPT.entries()) {
        db.autopilot = {
          running: true,
          beat: i + 1,
          total: SCRIPT.length,
          say: beat.say,
        };
        logEvent("narration", beat.say);
        await fetch(`${origin}${beat.path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(beat.body ?? {}),
        }).catch(() => undefined);
        await new Promise((r) => setTimeout(r, beat.hold ?? 1500));
      }
      db.autopilot = {
        running: false,
        beat: SCRIPT.length,
        total: SCRIPT.length,
        say: "Detected, quarantined, decontaminated, verified, restored — and immunised.",
      };
    } catch (err) {
      db.autopilot = {
        running: false,
        beat: 0,
        total: SCRIPT.length,
        say: `Autopilot stopped: ${String(err)}`,
      };
    }
  })();

  return c.json({ started: true, beats: SCRIPT.length });
});

app.get("/api/autopilot", (c) => c.json(db.autopilot));

function agentName(id: string): string {
  return db.agents.get(id)?.name ?? id;
}

export const port = Number(process.env.REGISTRY_PORT ?? process.env.PORT ?? 4100);
serve({ fetch: app.fetch, port }, () => {
  console.log(`antidote-registry listening on :${port} (masumi: ${masumi.mode})`);
});
