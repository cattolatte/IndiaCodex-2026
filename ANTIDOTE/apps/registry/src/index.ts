/**
 * Recall registry + ingestion gateway + contagion graph API.
 *
 * S1: gateway (sources, ingestion manifests)
 * S2: recalls, exposure resolution, contagion graph
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { IngestionEvent, Recall, Source } from "@antidote/core";

// In-memory by design — demo infrastructure, restart-fast (see docs/TECH-STACK.md).
export const sources = new Map<string, Source>();
export const ingestions: IngestionEvent[] = [];
export const recalls = new Map<string, Recall>();

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true, service: "antidote-registry" }));

// S1: POST /sources (gateway registration), POST /ingestions
// S2: POST /recalls, GET /exposure/:agent, GET /contagion-graph

const port = Number(process.env.REGISTRY_PORT ?? 4100);
serve({ fetch: app.fetch, port }, () => {
  console.log(`antidote-registry listening on :${port}`);
});
