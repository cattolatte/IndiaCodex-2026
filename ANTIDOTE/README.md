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
2. **Detection** — incoming sources are scored for forgery signals (implausible
   figures, unattributed sourcing, embedded price predictions). A suspicious verdict
   marks holders **suspected** — advisory, so an operator knows where to look before
   anyone pulls the alarm.
3. **Staked recalls** — `Recall(source, shards, severity)` from a staked issuer, so the
   alarm itself is accountable (false recalls are slashable).
4. **Exposure resolution** — taint propagates through the graph: agents that ingested
   the poison *and* agents that ingested outputs produced from it are flagged, direct or
   transitive. Exposure keys on the agent's **current** manifest, so a purged agent is
   genuinely clean, not permanently marked.
5. **Quarantine enforced on-chain** — the agent's spending transaction is composed with
   the `quarantine_gate` Aiken validator, which reads that agent's status UTXO as a
   **reference input** and fails the transaction while it is exposed and unattested.
   Enforcement at consensus: deterministic, cross-organizational, and impossible for
   one operator to lift on another operator's agent. Exposure status also rides on the
   agent's Masumi registry identity, so hiring flows route around it — a quarantined
   agent can neither spend nor earn.
6. **The immune system — a Masumi agent economy** — decontamination is a hireable,
   **paid** Masumi service that purges recalled shards and recommits the manifest root;
   a staked auditor (a second paid service) probes the cleaned agent
   membership-inference-style and posts the attestation that reopens the gate. Every
   recall creates paid work: agents healing agents, for money.

V1 scopes to RAG/memory-store contamination — deletable and provable — with weight-level
unlearning as attested best-effort.

## What's implemented vs. roadmap

**Implemented and runnable** (this repo): content-addressed sharding and Merkle manifest
commitments · gateway-attested ingestion · contamination detection with a
suspected state · the three-agent economic pipeline as MIP-003 services · document
upload plus forged-source injection and epidemic propagation · staked recall issuance ·
direct + transitive exposure resolution · **three Aiken Plutus V3 validators** with 14
passing tests, whose real script hashes the dashboard displays and whose gate logic
rejects a quarantined agent's spend · quarantine at the hiring/payment layer · paid
decontamination with real shard deletion · staked auditor probe batteries that **can and
do fail** before decontamination · attestations that clear status · live contagion-graph
cockpit. Masumi registration and payment run through the payment service when
configured, and through an interface-identical mock client otherwise; likewise Cardano
submission runs live with a Blockfrost key and simulated (same validator logic, real
compiled hashes) without one.

**Roadmap:** ZK proofs of decontamination over the manifest root, so an agent proves
purity without revealing its data diet · weight-level unlearning beyond attested
best-effort · issuer-stake slashing via a full dispute game.

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
3. **Inject forged report** — a fake earnings flash enters the feed. (Or open
   *Upload your own document* and paste your own forgery.)
4. **Run detector** — scores it for forgery signals and marks any holder
   **SUSPECTED** (amber) — advisory, nothing is blocked yet.
5. **Run pipeline** — watch the lie propagate node-by-node through the contagion
   graph until the trader sizes a **$2.5M BUY** on the forgery.
6. **Issue recall** — staked recall against the forged source; exposure resolves
   through the gateway-attested manifests: research (direct), analysis and trading
   (transitive, via each other's outputs). All three are quarantined.
7. **Run pipeline** again — two gates fire: the hire is **refused** (quarantined
   agents don't get work), and any spend attempt is **rejected by the
   `quarantine_gate` validator**, named in the activity feed by its script hash.
8. **Hire decontamination** — Medic-1 is hired and paid (25 ADA) to purge the
   recalled shards from each agent's memory; manifest Merkle roots are recommitted.
9. **Hire auditor** — Auditor-1 is paid (15 ADA) to probe each agent with the forged
   claims. Purged agents answer "no recollection"; attestations post and statuses
   flip to CLEARED. (Run the audit *before* decontamination and it fails — the
   attestation is earned, not stamped.)
10. **Publish clean update** + **Run pipeline** — the fleet is hireable again and
    trades correctly on the real news.

## On-chain enforcement

```bash
cd contracts && aiken check   # 14 tests
```

Three Plutus V3 validators in [contracts/](contracts/README.md): `quarantine_gate`
(fails an exposed agent's spend; a *missing* status reference input also fails, so the
gate can't be bypassed by omitting evidence), `agent_status` (one status UTXO per agent
— no eUTXO contention; clearing requires an auditor-signed attestation for the same
recall), and `recall_registry` (issuer stake, the basis for slashing false recalls).
The test suite pins the adversarial cases, not just the happy path.

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
