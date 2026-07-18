# ANTIDOTE — Epistemic recalls for agent fleets

> **FDA recalls, for information.**
>
> IndiaCodex '26 — **Masumi Track ("Monetize AI Agents")**

Food, cars, and drugs have recall infrastructure. The information supply chain feeding
autonomous economic actors has none. ANTIDOTE is the missing layer: when a source is
found poisoned or forged, issue a **recall** that propagates to every agent that ingested
it — and agents that can't prove decontamination **lose the ability to earn** until they
can: quarantined agents are refused work and payment on the Masumi rails they depend on.

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
   Merkle roots. The gateway writes them, not the agent — agents can't under-report.
2. **Staked recalls** — `Recall(source, shards, severity)` from a staked issuer, so the
   alarm itself is accountable (false recalls are slashable).
3. **Exposure resolution** — taint propagates through the graph: agents that ingested
   the poison *and* agents that ingested outputs produced from it are flagged, direct or
   transitive. Exposure keys on the agent's **current** manifest, so a purged agent is
   genuinely clean, not permanently marked.
4. **Quarantine as an economic gate** — exposure status rides on the agent's Masumi
   registry identity. Hiring flows refuse quarantined agents and their jobs go unpaid:
   an agent that can't prove decontamination can't earn. Cross-organizational and
   instant — no operator can impose this on another operator's agent, but shared
   registry + payment rails can.
5. **The immune system — a Masumi agent economy** — decontamination is a hireable,
   **paid** Masumi service that purges recalled shards and recommits the manifest root;
   a staked auditor (a second paid service) probes the cleaned agent
   membership-inference-style and posts the attestation that reopens the gate. Every
   recall creates paid work: agents healing agents, for money.

V1 scopes to RAG/memory-store contamination — deletable and provable — with weight-level
unlearning as attested best-effort.

## What's implemented vs. roadmap

**Implemented and runnable** (this repo): content-addressed sharding and Merkle manifest
commitments · gateway-attested ingestion · the three-agent economic pipeline as MIP-003
services · forged-source injection and epidemic propagation · staked recall issuance ·
direct + transitive exposure resolution · quarantine enforcement at the hiring/payment
layer · paid decontamination with real shard deletion · staked auditor probe batteries
that **can and do fail** before decontamination · attestations that clear status ·
live contagion-graph cockpit. Masumi registration and payment run through the payment
service when configured, and through an interface-identical mock client otherwise.

**Roadmap, designed not built:** validator-level enforcement in Aiken (per-agent status
UTXOs checked via reference inputs, so *any* transaction of an exposed agent fails at
consensus — design in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)) · ZK proofs of
decontamination over the manifest root, so an agent proves purity without revealing its
data diet · weight-level unlearning beyond attested best-effort.

## Known limitations (stated upfront)

- **Manifest honesty** — V1 trusts a gateway to write manifests. Agents ingesting outside
  the gateway are invisible to a recall. Mitigations on the roadmap: gateway-attested
  feeds, staked audits of manifest coverage, insurers pricing on it.
- **Weight-level unlearning is unsolved at the edges** — hence the deliberate scoping to
  RAG/memory stores, where deletion is real and verifiable by probing.
- **Probe batteries are heuristic** — the auditor tests behavioral recall of specific
  claims, which is evidence of forgetting, not proof of it.

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Tech stack](docs/TECH-STACK.md)

## Tech stack

**Masumi** registry + payment service (agents expose the MIP-003 service surface) ·
TypeScript monorepo (pnpm workspaces) · **Hono** registry/gateway/contagion service ·
free-tier **LLM** agents over any OpenAI-compatible endpoint (no vendor SDK) ·
**Vite + React** cockpit with `react-force-graph` · **MeshJS** + Blockfrost for Cardano
Preprod. Built and hosted on a strict **$0 budget** (free tiers only). Rationale and
rejected alternatives: [docs/TECH-STACK.md](docs/TECH-STACK.md).

## Repository layout

```
ANTIDOTE/
├── packages/core/       domain model: shards, manifests, recalls, Merkle, LLM client
├── packages/masumi/     Masumi registration + payments (live service or mock client)
├── packages/chain/      Cardano/Mesh tx builders (roadmap surface)
├── apps/registry/       gateway, recall engine, contagion resolution, paid hiring
├── apps/agents/         five MIP-003 agent services (fleet + immune system)
├── apps/dashboard/      contagion graph + activity/payment cockpit
└── contracts/           on-chain validator designs (roadmap)
```

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
- **Project:** ANTIDOTE — epistemic recalls for agent fleets
- **Problem it solves:** agents ingest continuously and act on what they ingest, so one
  forged source metastasizes through a fleet in minutes; there is no recall
  infrastructure for the information supply chain. ANTIDOTE issues recalls, traces
  contamination, quarantines exposed agents economically, and makes decontamination and
  verification a paid agent market.
- **Tech stack:** see [Tech stack](#tech-stack) above and
  [docs/TECH-STACK.md](docs/TECH-STACK.md)
- **Demo photos & video:** _TODO_
- **Live project link:** _TODO_
- **PPT:** _TODO — upload to this folder and link here_
- **Team members:** _TODO — names, roles, contact_
