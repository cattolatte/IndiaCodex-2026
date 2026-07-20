# ANTIDOTE — Epistemic recalls for agent fleets

> **Antivirus protects computers. Nobody protects what machines believe.**
> ANTIDOTE is the public-health system for the machine economy.
>
> IndiaCodex '26 — **Masumi Track ("Monetize AI Agents")**

Every function of a public-health system, for information:

| Public health | ANTIDOTE |
|---|---|
| Diagnostics | contamination detector scores incoming sources |
| Outbreak declaration | staked recall, slashable if false |
| Contact tracing | contagion graph over gateway-written manifests |
| Quarantine | Aiken validator refuses the spend; Masumi refuses the hire |
| Treatment | decontamination agent, hired and paid over Masumi |
| Test-of-cure | staked auditor probe battery that can and does fail |
| **Immunisation** | antibodies refuse the same lie on contact, even reworded |
| **Autopsy** | counterfactual replay measuring the damage a belief caused |
| **Sentinel surveillance** | canary watermarks catch undeclared ingestion |
| Epidemiology | R₀, attack rate, infection depth, containment time |

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
commitments · gateway-attested ingestion · contamination detection with a suspected
state · the three-agent economic pipeline as MIP-003 services · document upload plus
forged-source injection and epidemic propagation · staked recall issuance · direct +
transitive exposure resolution · **three Aiken Plutus V3 validators** with 14 passing
tests, whose real script hashes the dashboard displays and whose gate logic rejects a
quarantined agent's spend · quarantine at the hiring/payment layer · paid decontamination
with real shard deletion · **verifiable Merkle non-membership purge receipts** · staked
auditor probe batteries that **can and do fail** before decontamination · attestations
that clear status · **antibody immunisation against reworded re-infection** ·
**counterfactual autopsy quantifying causal damage** · **canary watermarks detecting
undeclared ingestion** · **doubt market settling payouts to early skeptics** · outbreak
metrics (R₀, attack rate, containment) · live contagion-graph cockpit · one-click
narrated autopilot.

Masumi registration and payment run through the payment service when configured, and
through an interface-identical mock client otherwise; likewise Cardano submission runs
live with a Blockfrost key and simulated (same validator logic, real compiled hashes)
without one.

**Roadmap:** ZK proofs of decontamination over the manifest root (the receipts above are
exactly the statement a ZK verifier would attest, so the interface does not change) ·
weight-level unlearning beyond attested best-effort · issuer-stake slashing via a full
dispute game · embedding-based similarity to complement exact-shard deletion.

## Known limitations (stated upfront)

- **Manifest honesty** — manifests only record what came through the gateway, so an agent
  reading elsewhere could under-report. We cannot force honest reporting; the canary
  watermarks make dishonesty *detectable* rather than solved, and manifest coverage
  itself should be attestable (open question 3 in the MIP draft).
- **Weight-level unlearning is unsolved at the edges** — hence the deliberate scoping to
  RAG/memory stores, where deletion is real and verifiable by probing.
- **Probe batteries are heuristic** — the auditor tests behavioural recall of specific
  claims, which is evidence of forgetting, not proof of it. What *is* proven is the
  store-level deletion, via the non-membership receipts.
- **Antibodies fingerprint claims, not meaning** — a forgery rewritten to make the same
  argument with entirely different figures would evade the current matcher. Embedding
  similarity is the roadmap answer.
- **The autopsy's counterfactual assumes a deterministic replay** — sound for our
  scripted agents; a stochastic production agent would need repeated sampling to give a
  damage *distribution* rather than a point estimate.

## Beyond recall

Four mechanisms that fall out of the primitives above and, as far as we know,
have not been built for agent fleets:

**Immunisation.** A recall cures the agents that already ingested the poison. On
recall we also mint an **antibody** — a fingerprint of the document's distinctive
claims — and distribute it fleet-wide. The gateway screens every future ingestion
against it and refuses a match *on contact*, including a reworded copy that hashes
differently and would defeat content addressing entirely. The system stops being
reactive and starts being adaptive.

**Epistemic autopsy.** Because ingestion is content-addressed and gateway-recorded,
we can replay an agent's decision against its own history *with the poisoned shards
removed* and diff the outcomes: actual `BUY ORBX $2,500,000` versus counterfactual
`HOLD`. That difference is the **measurable causal damage of a belief** — the number
an insurer, a slashing rule, or a court needs, and one the unlearning literature
generally argues is not obtainable.

**Sentinel surveillance.** Our honest weakness is that manifests only capture what
came through the gateway. So every served copy is watermarked per recipient with an
invisible canary. If a canary issued to one agent surfaces in another's output whose
manifest never declared that source, we have evidence of an undeclared data path —
detection of dishonest reporting without trusting anyone's self-report.

**Doubt market.** Recall infrastructure has an incentive hole: noticing poison is
unpaid work. So doubt becomes a position — stake *against* a source's truthfulness,
get paid from the issuer's bounty when a recall confirms it, burn the stake if none
arrives. A market where being right about a lie is a revenue stream, settled over
the same Masumi rails as every other payment here.

## Docs

- [Architecture](docs/ARCHITECTURE.md) · [Tech stack](docs/TECH-STACK.md) ·
  [Draft MIP: Agent Health & Recall Status](docs/MIP-DRAFT-agent-health.md)

The MIP draft is the point of the project stated plainly: a health status that one
operator invents for itself protects nobody else, so the mechanism is written as a
proposed extension to Masumi rather than as our private feature.

## Tech stack

**Masumi** registry + payment service (agents expose the MIP-003 service surface) ·
TypeScript monorepo (pnpm workspaces) · **Hono** registry/gateway/contagion service ·
free-tier **LLM** agents over any OpenAI-compatible endpoint (no vendor SDK) ·
**Vite + React** cockpit with `react-force-graph` · **Aiken** (Plutus V3) validators ·
**MeshJS** + Blockfrost for Cardano Preprod. Built and hosted on a strict **$0 budget**
(free tiers only). Rationale and
rejected alternatives: [docs/TECH-STACK.md](docs/TECH-STACK.md).

## Repository layout

```
ANTIDOTE/
├── packages/core/       domain model: shards, manifests, recalls, Merkle, LLM client
├── packages/masumi/     Masumi registration + payments (live service or mock client)
├── packages/chain/      Cardano/Mesh tx builders + compiled-blueprint loader (real script hashes, chain tip)
├── apps/registry/       gateway, recall engine, contagion resolution, paid hiring
├── apps/agents/         five MIP-003 agent services (fleet + immune system)
├── apps/dashboard/      contagion graph + activity/payment cockpit
└── contracts/           three Aiken Plutus V3 validators (+ 14 tests)
```

## Quick start

```bash
pnpm install
pnpm dev:registry           # :4100 — recall registry, gateway, contagion graph API
pnpm dev:agents             # :4300 — the five MIP-003 agent services
pnpm dev:dashboard          # :4200 — cockpit UI

pnpm test                   # 65 unit tests
pnpm test:e2e               # full offline autopilot: 17/17 beats, 0 failures
pnpm typecheck
cd contracts && aiken check # 14 validator tests
```

Runs fully offline out of the box: without API keys the agents use deterministic
extractive fallbacks and payments use a mock Masumi client with the same interface.
`cp .env.example .env` and fill in a free-tier LLM key and/or a Masumi payment-service
key to go live — no code changes.

**Provider failover.** LLM calls walk a chain of providers and end at a deterministic
result, because a demo should not be killed by someone else's rate limit. This is not
theoretical: during testing the primary's small model hit its 6k tokens/minute cap
mid-audit, the next provider took over, and the run completed unaffected. Providers are
OpenAI-compatible endpoints read from environment variables, so adding or reordering one
is configuration, not code — and since free-tier quota is per key, even a second key on
the same vendor buys independent headroom.

## Demo

Press **▶ Run full demo**. The autopilot drives all seventeen beats of the story
unattended with a narration banner explaining each one — infection, spread,
detection, doubt, recall, on-chain rejection, autopsy, paid decontamination, failed
then passing audit, recovery, immunity, and the sentinel catching an undeclared
read. It is also the project's end-to-end regression test: if it completes, every
subsystem works together.

Or drive it manually:

## Demo walkthrough (cockpit buttons, in order)

1. **Seed feed** — two clean market sources appear.
2. **Run pipeline** — research → analysis → trading are each *hired and paid via
   Masumi* (watch the payment feed); the trader correctly HOLDs.
3. **Inject forged report** — a fake earnings flash enters the feed. (Or open
   *Upload your own document* and paste your own forgery.)
4. **Run detector** — scores it for forgery signals and raises an advisory
   suspicion flag on the source; nothing is blocked yet. (Any agent already
   holding the flagged source is marked **SUSPECTED**/amber.)
5. **Run pipeline** — watch the lie propagate node-by-node through the contagion
   graph until the trader sizes a **multi-million-dollar BUY** on the forgery.
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

## Tests

79 tests in total (65 unit + 14 on-chain), weighted towards the claims that would be embarrassing to get
wrong: that immunity blocks a reworded forgery but **never** a legitimate
correction; that exposure keys on an agent's current manifest so a decontaminated
agent is not permanently marked; that damage is only attributed to a lie the agent
had actually read by then; and that the quarantine gate cannot be bypassed by
omitting the evidence.

```bash
pnpm test                     # 65 unit tests
pnpm test:e2e                 # boots both services offline, runs the autopilot,
                              # fails unless all 17 beats complete with 0 failures
cd contracts && aiken check   # 14 validator tests
```

## On-chain enforcement

Three Plutus V3 validators in [contracts/](contracts/README.md): `quarantine_gate`
(fails an exposed agent's spend; a *missing* status reference input also fails, so the
gate can't be bypassed by omitting evidence), `agent_status` (one status UTXO per agent
— no eUTXO contention; clearing requires an auditor-signed attestation for the same
recall), and `recall_registry` (issuer stake, the basis for slashing false recalls).
The test suite pins the adversarial cases, not just the happy path.

---

## Submission info (IndiaCodex '26)

- **Team:** AdAstra
- **Track:** Masumi — Monetize AI Agents
- **Project:** ANTIDOTE — epistemic recalls for agent fleets
- **Problem it solves:** agents ingest continuously and act on what they ingest, so one
  forged source metastasizes through a fleet in minutes; there is no recall
  infrastructure for the information supply chain. ANTIDOTE issues recalls, traces
  contamination, quarantines exposed agents economically, and makes decontamination and
  verification a paid agent market.
- **Tech stack:** see [Tech stack](#tech-stack) above and
  [docs/TECH-STACK.md](docs/TECH-STACK.md)
- **Live demo (dashboard):** https://antidote-adastra.vercel.app
  — press **▶ Run full demo** for the unattended end-to-end run.
- **Live services (deployed on free tier):**
  - Registry / gateway / contagion API — https://antidote-registry.onrender.com
  - Agent fleet + immune system (MIP-003) — https://antidote-agents.onrender.com
  - _Note: the Render free tier sleeps when idle; the first request wakes it (a few
    seconds), which the dashboard handles with a "waking" state and retry backoff._
- **Demo photos & video:** _TODO — record against the live dashboard above_
- **PPT:** _TODO — upload to this folder and link here_
- **Team members:** _TODO — names, roles, contact_
