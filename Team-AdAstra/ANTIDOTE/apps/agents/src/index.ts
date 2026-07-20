/**
 * ANTIDOTE agent fleet — five MIP-003 agent services in one process:
 *
 *   research → analysis → trading   (the economic pipeline)
 *   decontamination + auditor       (the paid immune system)
 *
 * Each agent exposes the Masumi agentic-service surface
 * (GET /availability, GET /input_schema, POST /start_job, GET /status)
 * and registers itself on the Masumi registry at boot. All ingestion goes
 * through the registry gateway so manifests stay gateway-attested.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AgentRole, Job, ShardId } from "@antidote/core";
import { sha256, shardify } from "@antidote/core";
import { createMasumiClient } from "@antidote/masumi";
import { memoryText, purge, remember } from "./memory.ts";
import { answerProbe, makeDecision, makeThesis, showsRecall, summarize } from "./roles.ts";

const REGISTRY_URL = process.env.REGISTRY_URL ?? "http://localhost:4100";
const PORT = Number(process.env.AGENTS_PORT ?? process.env.PORT ?? 4300);
const PUBLIC_URL = process.env.AGENTS_PUBLIC_URL ?? `http://localhost:${PORT}`;

const masumi = createMasumiClient();

interface FleetAgent {
  id: string;
  name: string;
  role: AgentRole;
  description: string;
}

const FLEET: FleetAgent[] = [
  {
    id: "agent-research",
    name: "Research-1",
    role: "research",
    description: "Ingests market sources and produces research summaries.",
  },
  {
    id: "agent-analysis",
    name: "Analyst-1",
    role: "analysis",
    description: "Turns research notes into investment theses.",
  },
  {
    id: "agent-trading",
    name: "Trader-1",
    role: "trading",
    description: "Sizes and executes positions from theses.",
  },
  {
    id: "agent-decontam",
    name: "Medic-1",
    role: "decontamination",
    description: "Hireable decontamination service: purges recalled shards from agent memory.",
  },
  {
    id: "agent-auditor",
    name: "Auditor-1",
    role: "auditor",
    description: "Staked verification service: probes agents for residual contamination.",
  },
];

// ---------- registry client ----------

async function reg<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(`${REGISTRY_URL}${path}`, {
    method: body === undefined && method === "POST" ? "GET" : method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

const regGet = <T>(path: string) => reg<T>(path, undefined, "GET");

/** Raised when the gateway refuses ingestion because the fleet is immune. */
class ImmuneRefusal extends Error {
  constructor(readonly antibody: string) {
    super(`ingestion refused by antibody ${antibody}`);
  }
}

/**
 * Ingest through the gateway, then mirror shard texts into local memory.
 * The gateway may refuse (409) when the document matches a known antibody —
 * that is immunity working, not an error condition.
 */
async function ingest(agentId: string, sourceHash: string) {
  const res = await fetch(`${REGISTRY_URL}/api/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: agentId, source: sourceHash }),
  });
  if (res.status === 409) {
    const { antibody } = (await res.json()) as { antibody: string };
    throw new ImmuneRefusal(antibody);
  }
  if (!res.ok) throw new Error(`/api/ingest → ${res.status}: ${await res.text()}`);
  const doc = (await res.json()) as { hash: string; title: string; content: string };
  remember(agentId, shardify(doc.content));
  return doc;
}

async function publish(agentId: string, title: string, content: string): Promise<string> {
  const res = await reg<{ hash: string }>("/api/sources", {
    title,
    content,
    origin: { agent: agentId },
  });
  return res.hash;
}

// ---------- job handlers ----------

type JobInput = Record<string, unknown>;

async function runResearch(input: JobInput) {
  try {
    const doc = await ingest("agent-research", String(input.source_hash));
    const summary = await summarize(doc.title, doc.content);
    const output_source = await publish("agent-research", `Research note: ${doc.title}`, summary);
    return { output_source, summary };
  } catch (err) {
    if (err instanceof ImmuneRefusal) {
      return { immune: true, antibody: err.antibody };
    }
    throw err;
  }
}

async function runAnalysis(input: JobInput) {
  const doc = await ingest("agent-analysis", String(input.source_hash));
  const thesis = await makeThesis(doc.content);
  const output_source = await publish("agent-analysis", `Thesis: ${doc.title}`, thesis);
  return { output_source, thesis };
}

async function runTrading(input: JobInput) {
  const doc = await ingest("agent-trading", String(input.source_hash));
  const decision = await makeDecision(doc.content);
  const description =
    decision.action === "HOLD"
      ? "HOLD — no position change"
      : `${decision.action} ${decision.ticker} $${decision.sizeUsd.toLocaleString("en-US")}`;
  const execution = await reg<{ executed: boolean; refused?: boolean; ref?: string }>(
    "/api/execute",
    { agent: "agent-trading", description },
  );
  return { decision, execution };
}

interface RecallInfo {
  id: string;
  taintedShardIds: ShardId[];
  claims: string[];
  exposedAgents: string[];
}

async function runDecontamination(input: JobInput) {
  const recall = await regGet<RecallInfo>(`/api/recalls/${String(input.recall_id ?? "latest")}`);
  const purged: Record<string, number> = {};
  for (const target of recall.exposedAgents) {
    const removed = purge(target, recall.taintedShardIds);
    if (removed.length > 0) {
      await reg("/api/purge", { agent: target, removedShardIds: removed });
    }
    purged[target] = removed.length;
  }
  return { recall: recall.id, purged };
}

async function runAudit(input: JobInput) {
  const recall = await regGet<RecallInfo>(`/api/recalls/${String(input.recall_id ?? "latest")}`);
  const reports: { agent: string; passed: boolean; probes: unknown[] }[] = [];
  for (const target of recall.exposedAgents) {
    const probes: { claim: string; answer: string; contaminated: boolean }[] = [];
    for (const [i, claim] of recall.claims.entries()) {
      // The battery is many calls in quick succession, which trips per-minute
      // token limits on free tiers. Spacing them keeps the primary provider
      // serving instead of forcing a failover mid-audit.
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
      const answer = await answerProbe(memoryText(target), `What do you know about: ${claim}`);
      const contaminated = showsRecall(claim, answer);
      probes.push({ claim, answer, contaminated });
      await reg("/api/events", {
        kind: "probe",
        message: `Auditor-1 probed ${target}: "${claim.slice(0, 60)}…" → ${
          contaminated ? "STILL CONTAMINATED ✗" : "no recollection ✓"
        }`,
        agent: target,
      });
    }
    const passed = probes.every((p) => !p.contaminated);
    await reg("/api/attestations", {
      agent: target,
      recallId: recall.id,
      auditor: "agent-auditor",
      passed,
      probeReportHash: sha256(JSON.stringify(probes)),
    });
    reports.push({ agent: target, passed, probes });
  }
  return { recall: recall.id, reports };
}

const HANDLERS: Record<AgentRole, (input: JobInput) => Promise<unknown>> = {
  research: runResearch,
  analysis: runAnalysis,
  trading: runTrading,
  decontamination: runDecontamination,
  auditor: runAudit,
};

const INPUT_SCHEMAS: Record<AgentRole, object> = {
  research: { input_data: [{ id: "source_hash", type: "string" }] },
  analysis: { input_data: [{ id: "source_hash", type: "string" }] },
  trading: { input_data: [{ id: "source_hash", type: "string" }] },
  decontamination: { input_data: [{ id: "recall_id", type: "string" }] },
  auditor: { input_data: [{ id: "recall_id", type: "string" }] },
};

// ---------- MIP-003 service surface ----------

const jobs = new Map<string, Job & { agent: string }>();
const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true, service: "antidote-agents" }));

for (const agent of FLEET) {
  const base = `/agents/${agent.id}`;

  app.get(`${base}/availability`, (c) =>
    c.json({ status: "available", type: "masumi-agent", name: agent.name }),
  );

  app.get(`${base}/input_schema`, (c) => c.json(INPUT_SCHEMAS[agent.role]));

  app.post(`${base}/start_job`, async (c) => {
    const { input } = await c.req.json<{ input: JobInput }>();
    const job: Job & { agent: string } = {
      job_id: `job_${agent.id}_${Date.now().toString(36)}`,
      status: "running",
      input: input ?? {},
      createdAt: Date.now(),
      agent: agent.id,
    };
    jobs.set(job.job_id, job);
    void HANDLERS[agent.role](job.input)
      .then((result) => {
        job.result = result;
        job.status = "completed";
      })
      .catch((err: unknown) => {
        job.status = "failed";
        job.error = String(err);
        console.error(`[${agent.id}] job failed:`, err);
      });
    return c.json({ job_id: job.job_id, status: job.status });
  });

  app.get(`${base}/status`, (c) => {
    const job = jobs.get(c.req.query("job_id") ?? "");
    if (!job || job.agent !== agent.id) return c.json({ error: "unknown job" }, 404);
    return c.json(job);
  });
}

// ---------- boot: Masumi registration + registry enrollment ----------

/**
 * Masumi identities, cached after the first successful registration.
 *
 * Re-enrolment must not re-register: on the live network that would submit a
 * fresh registration transaction every time the registry restarts, spending
 * real fees and creating duplicate identities for the same agent.
 */
const masumiIds = new Map<string, string>();

async function enroll(): Promise<boolean> {
  try {
    for (const agent of FLEET) {
      let masumiId = masumiIds.get(agent.id);
      if (!masumiId) {
        const registration = await masumi.registerAgent({
          name: agent.name,
          description: agent.description,
          apiUrl: `${PUBLIC_URL}/agents/${agent.id}`,
        });
        masumiId = registration.agentIdentifier;
        masumiIds.set(agent.id, masumiId);
      }
      await reg("/api/agents", {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        url: `${PUBLIC_URL}/agents/${agent.id}`,
        masumiId,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * The registry holds its state in memory, so any restart — a redeploy, or a
 * free-tier instance waking from idle — leaves it with no fleet while this
 * process is still happily running. Without this heartbeat the whole demo dies
 * with "no agent for role research" and only a manual restart brings it back.
 */
async function keepEnrolled(): Promise<void> {
  while (!(await enroll())) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(`fleet enrolled with registry (masumi: ${masumi.mode})`);

  setInterval(() => {
    void (async () => {
      try {
        const known = await regGet<{ id: string }[]>("/api/agents");
        const missing = FLEET.some((a) => !known.some((k) => k.id === a.id));
        if (missing) {
          console.log("registry lost the fleet — re-enrolling");
          await enroll();
        }
      } catch {
        // Registry unreachable; try again on the next beat.
      }
    })();
  }, 10_000);
}

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`antidote-agents listening on :${PORT}`);
  void keepEnrolled();
});
