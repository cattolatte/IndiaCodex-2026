# ANTIDOTE — Architecture

**One line:** FDA recalls, for information. When a source feeding autonomous agents is
found poisoned, issue a recall that propagates to every agent that ingested it — and
agents that can't prove decontamination lose the ability to transact until they can.

Not provenance ("where did this come from") — the inverse: **"it's poison; claw it back
from every mind that ingested it."**

**IndiaCodex '26 — Masumi Track ("Monetize AI Agents").** The immune system is the
monetization: decontamination and auditing are hireable, *paid* Masumi agent services,
and every fleet agent speaks MIP-003. Every recall creates paid work — an immune system
of agents healing agents, for money.

## System overview

```mermaid
flowchart TB
    subgraph Fleet["Agent fleet (apps/agents)"]
        R[Research agent] --> A[Analysis agent] --> T[Trading agent]
    end

    subgraph Registry["Registry service (apps/registry)"]
        GW[Ingestion gateway\nmanifests + Merkle roots]
        RC[Recall API]
        CG[Contagion graph\nLLM-scored influence]
    end

    subgraph Chain["Cardano Preprod (contracts/ + packages/chain)"]
        REG[Recall registry UTXOs\nstaked issuers]
        GATE[Quarantine gate validator\nreference-input check]
        ATT[Attestation UTXOs]
    end

    subgraph Immune["Immune system — paid Masumi services"]
        D[Decontamination agent\nhired + paid via Masumi]
        AU[Auditor agent\npaid, staked probe battery]
    end

    Feeds[(Content-addressed\nsources)] --> GW --> Fleet
    Fleet -- outputs become sources --> GW
    RC --> REG
    GW -- exposure resolution --> CG
    T -- spend attempt --> GATE
    GATE -. reference input .-> REG
    GATE -. reference input .-> ATT
    RC --> D --> AU -- attestation --> ATT
    CG --> Dash[Dashboard\napps/dashboard]
```

## The recall lifecycle

1. **Ingest** — every document enters through the gateway, which chunks it into
   content-addressed **shards** (sha256) and appends to the consuming agent's
   **ingestion manifest**. Agent outputs are re-registered as sources, so
   agent→agent consumption is captured — that's what makes contamination epidemic
   and recalls transitive.
2. **Commit** — manifests are committed as Merkle roots. The root is the privacy seam:
   V1 proves (non-)membership with Merkle paths. (Roadmap, not built here: a ZK verifier
   — e.g. Midnight — could replace the Merkle check over the same root, proving
   decontamination without revealing the data diet.)
3. **Recall** — `Recall { source_hash, shard_root, severity, issuer }` posted with issuer
   stake (false recalls slashable). Mirrored on-chain as a registry UTXO.
4. **Exposure resolution** — registry walks the manifests: agents holding tainted shards
   (directly or transitively) are flagged **exposed**; the contagion graph scores
   *semantic influence* (LLM-scored) to rank who actually acted on the poison vs. merely
   stored it.
5. **Quarantine** — the flagged agent's economically relevant transactions include the
   quarantine-gate script, which checks recall + attestation state **via reference
   inputs**. Exposed-and-unverified ⇒ validator rejects the spend. This is the
   consensus-level teeth: no operator can impose it on another operator's agent, but the
   ledger can.
6. **Decontaminate** — a decontamination agent (hired and **paid via Masumi**) purges
   tainted shards from the RAG/memory store and emits a purge proof against the manifest
   root. Exposure status also lives on the agent's Masumi registry identity, so hiring
   flows route around quarantined agents even before any custom validator runs.
   V1 scope: stores, where deletion is real and provable. Weight-level unlearning is
   attested best-effort — stated upfront.
7. **Verify & clear** — a staked auditor runs a membership-inference-style probe battery
   (does the agent still act on the poisoned fact?). Pass ⇒ attestation UTXO posts ⇒
   gate opens ⇒ transactions flow.

## On-chain enforcement (implemented)

Quarantine is enforced at two layers that reinforce each other: at the Masumi
payment/hiring layer — where the money already moves — **and** at consensus, by three
Aiken Plutus V3 validators in [contracts/](../contracts/README.md). The validators
compile (`plutus.json`), pass **14 tests** including the adversarial cases, and
`packages/chain` loads the blueprint so the dashboard shows their real script hashes.

- **Per-agent status UTXO**, not one global registry UTXO — avoids eUTXO contention and
  makes the gate's reference-input lookup O(1). See
  [lib/antidote/types.ak](../contracts/lib/antidote/types.ak) for the exact shapes:
  - `RecallDatum { source, shard_root, severity, issuer, stake_lovelace, issued_at }`
  - `AgentStatusDatum { agent, status: Clean | Exposed { recall } | Cleared { recall, auditor }, manifest_root, updated_at }`
  - `AttestationDatum { agent, recall, auditor, probe_report, manifest_root, cleared_at }`
- **`quarantine_gate`**: composed into the agent's spending flow; reads the agent's
  status UTXO as a reference input and permits the spend only when the status is `Clean`
  or `Cleared`. A **missing** status reference input fails, so the gate cannot be
  bypassed by omitting the evidence.
- **`agent_status`**: `Flag` requires the recall issuer's signature; `Clear` requires an
  auditor-signed attestation for the *same* recall and agent — another agent's clearance,
  or an unsigned attestation, does not open the gate.
- **`recall_registry`**: holds the issuer's locked stake; reclaiming it needs the
  issuer's signature, which is the basis for slashing a false recall. A full automated
  dispute game is post-hackathon.

## Repo layout

```
ANTIDOTE/
├── docs/                  # you are here
├── contracts/             # Aiken Plutus V3 validators (quarantine_gate, agent_status, recall_registry)
├── packages/
│   ├── core/              # domain model: sources, shards, manifests, recalls, Merkle
│   ├── masumi/            # Masumi registration + payments (live service or mock client)
│   └── chain/             # Mesh tx builders + Blockfrost provider wiring
└── apps/
    ├── registry/          # Hono API: gateway, recalls, exposure, contagion graph
    ├── agents/            # fleet (research/analysis/trading) + decontam + auditor
    └── dashboard/         # Vite+React control-room cockpit (contagion graph + live activity/payment feeds)
```

`packages/core` is the contract between everything — all shard/manifest/recall types and
hashing live there and nowhere else.

## Build scope

V1 scopes decontamination to RAG/memory stores — where deletion is real and provable —
with weight-level unlearning as attested best-effort. Ingestion manifests are
gateway-attested (the gateway writes them, not the agent). Enforcement runs at both the
Masumi payment/hiring layer and the Aiken quarantine gate; ZK decontamination proofs
over the manifest root are the remaining roadmap item.
