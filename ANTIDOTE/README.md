# ANTIDOTE — Epistemic recalls for agent fleets

> **FDA recalls, for information.**
>
> IndiaCodex '26 — **Masumi Track ("Monetize AI Agents")**

Food, cars, and drugs have recall infrastructure. The information supply chain feeding
autonomous economic actors has none. ANTIDOTE is the missing layer: when a source is
found poisoned or forged, issue a **recall** that propagates to every agent that ingested
it — and agents that can't prove decontamination **lose the ability to transact on
Cardano** until they can.

This is explicitly *not* provenance. Provenance answers "where did this knowledge come
from." ANTIDOTE answers the unsolved inverse: **"it's poison; claw it back from every
mind that ingested it."**

## The problem

Agents ingest continuously — RAG, browsing, each other's outputs — and act on what they
ingest. Contamination compounds epidemically: forged report → agent belief → agent output
→ downstream agents ingest that output. One fake earnings PDF can metastasize through a
fleet in minutes. Today's "remedy" is an email asking operators to please re-index.

## How it works

1. **Ingestion manifests** — a gateway content-addresses every source into shards and
   records who consumed what (the inverse index recalls need). Manifests commit to
   Merkle roots.
2. **Staked recalls** — `Recall(source, shards, severity)` posted on-chain; false recalls
   slash the issuer.
3. **Consensus-level quarantine** — agents' payment/contract flows check recall status
   via reference inputs against an on-chain registry. Exposed-and-unverified agents
   cannot spend or contract in participating flows. Deterministic, cross-organizational,
   instant — the one thing no operator can impose on another operator's agent, but the
   ledger can.
4. **The immune system — a Masumi agent economy** — decontamination agents are hired
   and **paid via Masumi**; a staked auditor (a second paid Masumi service) probes the
   cleaned agent membership-inference-style and posts the attestation that reopens the
   gate. Exposure status lives on the agent's Masumi registry identity, so hiring flows
   route around quarantined agents. Every recall creates paid work: an immune system of
   agents healing agents, for money — that's the track thesis.

V1 scopes to RAG/memory-store contamination — deletable and provable — with weight-level
unlearning as attested best-effort.

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Tech stack](docs/TECH-STACK.md)

## Tech stack

**Masumi** registry + payment service (MIP-003 agents) · TypeScript monorepo (pnpm
workspaces) · **Aiken** validators on Cardano Preprod · **MeshJS** + Blockfrost off-chain ·
free-tier **LLM** agents (OpenAI-compatible API) · **Hono** registry/contagion service ·
**Vite + React** dashboard. Built and hosted on a strict **$0 budget** (free tiers only).
ZK decontamination proofs are on the roadmap. Details and rationale:
[docs/TECH-STACK.md](docs/TECH-STACK.md).

## Quick start

```bash
pnpm install
cp .env.example .env        # fill in keys (see docs/TECH-STACK.md → accounts needed)
pnpm typecheck
pnpm dev:registry           # recall registry + contagion graph API
pnpm dev:dashboard          # demo cockpit
```

---

## Submission info (IndiaCodex '26)

<!-- Required by hackathon rules — fill before submitting -->

- **Track:** Masumi — Monetize AI Agents
- **Problem:** see above / [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Demo photos & video:** _TODO_
- **Live project link:** _TODO_
- **PPT:** _TODO — upload to this folder and link here_
- **Team members:** _TODO — names, roles, contact_
