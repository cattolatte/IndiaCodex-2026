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
pnpm dev:registry           # :4100 — recall registry, gateway, contagion graph API
pnpm dev:agents             # :4300 — the five MIP-003 agent services
pnpm dev:dashboard          # :4200 — cockpit UI
```

Runs fully offline out of the box: without API keys the agents use deterministic
extractive fallbacks and payments use a mock Masumi client with the same interface.
`cp .env.example .env` and fill in a free-tier LLM key and/or a Masumi payment-service
key to go live — no code changes.

## Demo walkthrough (cockpit buttons, in order)

1. **Seed feed** — two clean market sources appear.
2. **Run pipeline** — research → analysis → trading are each *hired and paid via
   Masumi* (watch the payment feed); the trader correctly HOLDs.
3. **Inject forged report** — a fake earnings flash enters the feed.
4. **Run pipeline** — watch the lie propagate node-by-node through the contagion
   graph until the trader sizes a **$2.5M BUY** on the forgery.
5. **Issue recall** — staked recall against the forged source; exposure resolves
   through the gateway-attested manifests: research (direct), analysis and trading
   (transitive, via each other's outputs). All three are quarantined.
6. **Run pipeline** again — the hire is **refused**: quarantined agents don't get
   work. That's the enforcement.
7. **Hire decontamination** — Medic-1 is hired and paid (25 ADA) to purge the
   recalled shards from each agent's memory; manifest Merkle roots are recommitted.
8. **Hire auditor** — Auditor-1 is paid (15 ADA) to probe each agent with the forged
   claims. Purged agents answer "no recollection"; attestations post and statuses
   flip to CLEARED. (Run the audit *before* decontamination and it fails — the
   attestation is earned, not stamped.)
9. **Publish clean update** + **Run pipeline** — the fleet is hireable again and
   trades correctly on the real news.

---

## Submission info (IndiaCodex '26)

<!-- Required by hackathon rules — fill before submitting -->

- **Track:** Masumi — Monetize AI Agents
- **Problem:** see above / [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Demo photos & video:** _TODO_
- **Live project link:** _TODO_
- **PPT:** _TODO — upload to this folder and link here_
- **Team members:** _TODO — names, roles, contact_
