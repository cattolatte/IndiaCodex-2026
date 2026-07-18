# Draft MIP: Agent Health & Recall Status Extension

**Status:** Draft · **Type:** Standards Track · **Layer:** Registry / Payment
**Author:** ANTIDOTE (IndiaCodex '26, Masumi track)
**Requires:** MIP-003 (Agentic Service API)

> This is a proposal, not a claim of adoption. It is written as a spec because the
> mechanism below is only useful if it is *shared* — a health status one operator
> invents for itself protects nobody else.

## Abstract

Masumi gives autonomous agents identity, discovery, and payment. It does not yet
give them **health**. This extension adds a recall-aware status to an agent's
registry identity, defines how that status is set and cleared, and specifies how
hiring and payment flows should honour it — so that an agent known to be acting on
poisoned information can be routed around by every participant, not just by the
operator who noticed.

## Motivation

Agents ingest continuously — documents, feeds, and each other's outputs — and act
on what they ingest. Contamination is therefore epidemic rather than local: a
forged source becomes a research note, which becomes a thesis, which becomes a
trade. The information supply chain feeding autonomous economic actors has no
recall mechanism; food, vehicles, and pharmaceuticals all do.

The gap is not detection. It is **distribution and enforcement**: knowing which
agents consumed a poisoned source, and making that knowledge economically binding
across organisational boundaries. A registry that already brokers identity and
payment is the natural place to carry it.

## Specification

### 1. Health states

An agent's registry entry carries exactly one health state:

| State | Meaning | Effect on hiring |
|---|---|---|
| `Clean` | No outstanding recall touches this agent. | Hireable. |
| `Suspected` | A source it holds was flagged by a detector; no recall issued. | Hireable; advisory surfaced to the hirer. |
| `Exposed` | A recall covers material in this agent's ingestion manifest. | **MUST NOT** be hired for paid work until cleared. |
| `Cleared` | Decontaminated and verified by a staked auditor. | Hireable. |

State is derived, never self-asserted: `Exposed` follows from a recall plus a
manifest, and `Cleared` requires an attestation (§4).

### 2. Ingestion manifests

Participants SHOULD record consumption as a manifest of content-addressed shards
(sha256 over chunked source text), committed as a Merkle root. Manifests SHOULD be
written by the ingestion gateway rather than the agent, since an agent that
self-reports its data diet can under-report it.

Manifests need not be published. Only the root is required for the proofs in §5,
which is what allows a participant to prove decontamination without disclosing
what it reads — its data diet is competitive information.

### 3. Recalls

```
Recall {
  source:      sha256,        // the poisoned document
  shard_root:  merkle_root,   // shards being recalled
  severity:    advisory | quarantine,
  issuer:      vkey_hash,
  stake:       lovelace,      // slashable if the recall is false
  issued_at:   posix_time
}
```

Recalls MUST carry issuer stake. An alarm that costs nothing to raise is an alarm
that will be raised maliciously; the stake makes the issuer accountable and funds
the settlement in §7.

Exposure resolution MUST be transitive: an agent that ingested an output derived
from recalled material is exposed even if it never saw the original. Exposure
SHOULD be evaluated against the agent's *current* manifest, so that a purged agent
is genuinely clean rather than permanently marked.

### 4. Attestations

```
Attestation {
  agent:         agent_id,
  recall:        sha256,
  auditor:       vkey_hash,     // staked
  probe_report:  sha256,        // hash of the verification evidence
  manifest_root: merkle_root,   // root proven free of the recalled shards
  cleared_at:    posix_time
}
```

An attestation MUST be produced by a party other than the agent being cleared, and
that party SHOULD be staked. Verification SHOULD be behavioural — probing whether
the agent still acts on the recalled claims — because deletion from a store is
necessary but not sufficient evidence of forgetting.

A verification that cannot fail is not a verification. Implementations SHOULD be
able to demonstrate the failing case.

### 5. Proof of decontamination

Given a committed manifest root, a participant proves a recalled shard is absent by
Merkle non-membership. Because the mechanism depends only on the root, the same
statement can later be proven in zero knowledge — the agent proves purity without
revealing its data diet. Implementations MAY start with plain Merkle proofs and
substitute a ZK verifier without changing the interface.

### 6. Enforcement

Two independent gates, either sufficient, both preferable:

- **Registry / hiring gate.** Hiring flows MUST refuse `Exposed` agents for paid
  work. Cheap, immediate, and requires no chain integration.
- **Validator gate.** Economically relevant transactions MAY be composed with a
  script that reads the agent's status UTXO as a reference input and fails while
  the agent is `Exposed`. A **missing** status reference MUST fail closed —
  otherwise the gate is bypassed by omitting the evidence.

Per-agent status UTXOs are RECOMMENDED over one global registry UTXO to avoid
eUTXO contention between unrelated agents.

### 7. Immunisation and the doubt market (OPTIONAL)

Two extensions this proposal considers valuable but does not require:

- **Antibodies.** On recall, participants MAY derive a claim fingerprint from the
  recalled source and refuse future ingestion that matches it. This catches
  reworded copies that hash differently, converting a recall from a cure into
  immunity.
- **Doubt settlement.** Participants MAY stake *against* a source's truthfulness.
  A confirming recall pays the skeptics from the issuer's bounty; silence burns
  the stake. This creates an incentive to find poison early, which is otherwise
  unpaid work.

## Rationale

Why the registry rather than each operator's own infrastructure: quarantine only
works if it is a gate every participant respects and none controls. An operator
can clean its own agents; it cannot stop someone else's contaminated agent from
transacting with it. A shared registry can.

Why staking throughout: every actor in this system — recall issuer, auditor,
skeptic — is making a claim that others act on economically. Each claim should
cost something to make falsely.

## Backwards compatibility

Additive. Agents that do not implement this extension appear as `Clean` and behave
exactly as they do today; participants that ignore health status are unaffected.
The MIP-003 service surface is unchanged.

## Reference implementation

ANTIDOTE implements §§1–7 end to end: gateway-attested manifests, detection,
staked recalls with transitive exposure, hiring refusal, three Aiken Plutus V3
validators for the §6 validator gate, paid decontamination and staked audit over
Masumi rails, Merkle non-membership receipts, antibody-based immunity, and doubt
settlement. See the repository root.

## Open questions

1. Should `Suspected` be visible to hirers, or only to the agent's operator?
   Publishing unproven suspicion has its own failure modes.
2. What is the correct slashing procedure for a false recall — automatic, or
   through a dispute game with a challenge window?
3. Should manifest *coverage* itself be attestable, so that participants can be
   rated on how much of their ingestion is gateway-observed?
