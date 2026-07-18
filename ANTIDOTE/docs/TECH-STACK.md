# ANTIDOTE — Tech stack (Masumi Track)

One language end-to-end (TypeScript), one repo, the smallest stack that can carry a
live demo. Built for the **Masumi track ("Monetize AI Agents")** — Masumi integration
is the core of the system, not an add-on.

## Decisions

| Layer | Choice | Why |
|---|---|---|
| **Masumi (core)** | Preprod registry + self-hosted **payment service** (Docker); every agent speaks **MIP-003** | Agent identity, hiring, and payment. Decontamination and audit are *paid* Masumi services — the monetization story. A mock client with identical interface keeps local dev running without the service. |
| Language | **TypeScript everywhere** | One toolchain for agents, registry, chain code, UI. MIP-003 is plain HTTP — nothing forces Python. |
| Monorepo | **pnpm workspaces** | Five packages don't need a build graph. |
| Agents | **Free-tier LLM** via OpenAI-compatible API (Groq primary, Gemini backup), plain `fetch`, no SDK | $0 budget rule. Fleet agents are one tight LLM call each; auditor probes use the small/fast model (many cheap calls). Provider swap is 4 env vars (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_MODEL_CHEAP`). MIP-003 endpoints wrap them. |
| Smart contracts | **Aiken** (Plutus V3), Preprod — roadmap | This build enforces quarantine at the Masumi payment/hiring layer; the validator-level gate is designed in ARCHITECTURE.md as the next iteration. |
| Off-chain tx | **MeshJS** (`@meshsdk/core`) + **Blockfrost** | Wallet/tx plumbing for Preprod payments and, on the roadmap, the Aiken blueprint. |
| Registry / API | **Hono** + in-memory stores | Demo infrastructure, not a product database; restart-fast for rehearsals. |
| Contagion graph | In the registry service; LLM-scored semantic influence | Inference over ingestion events we already store — no graph DB. |
| Dashboard | **Vite + React** | Fastest dev loop; graph viz via `react-force-graph`. Shows the Masumi payment feed alongside the contagion graph. |
| Content addressing | `sha256` shards + Merkle roots (`node:crypto`) | Identity, not distribution — no IPFS in V1. |

## Out of scope for this build

- **ZK decontamination proofs** — roadmap. The Merkle manifest commitment is the
  documented seam a ZK verifier would slot into.

## Explicitly rejected

- **Python/CrewAI for agents** (Masumi's quickstart templates use it): MIP-003 is
  language-agnostic HTTP; splitting the toolchain buys nothing.
- **Lucid Evolution** over Mesh: fine library; Mesh covers Node + browser + Aiken
  blueprints with one dependency.
- **Next.js**: the dashboard is a local demo cockpit; SSR is dead weight.
- **A real database**: in-memory + JSON snapshots restart-fast during rehearsal.
- **plu-ts / OpShin / raw Plutus**: Aiken has won hackathon DX.

## External services & accounts (get these first)

- [ ] Masumi preprod: payment service self-hosted via Docker + registry access
- [ ] Groq free-tier API key (agents + influence scoring + auditor); Gemini free-tier
      key as backup provider
- [ ] Blockfrost project ID for **Preprod** (free tier)
- [ ] Preprod test-ADA from the [Cardano faucet](https://docs.cardano.org/cardano-testnets/tools/faucet)
      — fund 5+ wallets (3 fleet agents, decontam, auditor, recall issuer)
- [ ] Free hosting accounts (Vercel for the dashboard, Render for the services)

## Budget policy: $0, enforced

No paid API, no paid tier, no card on file anywhere. Full audit:

| Item | Provider | Cost |
|---|---|---|
| LLM inference | Groq free tier (backup: Gemini free tier) | $0 — demo uses dozens of calls, limits are thousands/day |
| Chain access | Blockfrost free tier | $0 (50k req/day) |
| Transaction funds | Cardano Preprod faucet (tADA) | $0 |
| Masumi | Preprod network + self-hosted payment service | $0 |
| Payment-service Postgres | Neon free tier (or Docker on the host VM) | $0 |
| Dashboard hosting | Vercel free (static Vite build) | $0 |
| API/agents hosting | Render free web service | $0 |
| Keep-warm pings | GitHub Actions cron or UptimeRobot free | $0 |
| Domain | `*.vercel.app` / `*.onrender.com` | $0 |

If a dependency ever demands payment, we change the dependency, not the budget.

## Toolchain

- Node ≥ 22 (repo developed on 26.x), pnpm ≥ 9
- Docker (Masumi payment service)
- Aiken — `curl -sSfL https://install.aiken-lang.org | bash` then `aikup` (roadmap)
