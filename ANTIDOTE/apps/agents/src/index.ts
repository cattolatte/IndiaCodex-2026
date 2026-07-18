/**
 * The agent fleet. Each agent is ONE tight LLM call (free tier, OpenAI-compatible
 * endpoint via LLM_BASE_URL/LLM_MODEL — $0 budget, see docs/TECH-STACK.md) —
 * believably wrong beats smart (see docs/MILESTONES.md S1). All ingestion goes
 * through the registry gateway so manifests stay gateway-attested, and every
 * agent exposes the MIP-003 service surface from S1 (Masumi track: register
 * and hire in S3 is wiring, not rework).
 *
 * Fleet (S1):   research → analysis → trading
 * Immune (S3):  decontamination (hired + PAID via Masumi),
 *               auditor (paid Masumi service; LLM_MODEL_CHEAP probe battery)
 */
import type { AgentId } from "@antidote/core";

export interface FleetAgent {
  id: AgentId;
  role: "research" | "analysis" | "trading" | "decontamination" | "auditor";
  /** System prompt lives here so behavior is reviewable in one place. */
  prompt: string;
}

export const fleet: FleetAgent[] = [
  { id: "agent-research", role: "research", prompt: "TODO(S1)" },
  { id: "agent-analysis", role: "analysis", prompt: "TODO(S1)" },
  { id: "agent-trading", role: "trading", prompt: "TODO(S1)" },
];

console.log(
  "antidote-agents: fleet defined, pipeline lands in S1 —",
  fleet.map((a) => a.id).join(", "),
);
