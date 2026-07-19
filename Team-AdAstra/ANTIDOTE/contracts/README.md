# ANTIDOTE — Aiken validators (Plutus V3, Preprod)

The enforcement layer. Quarantine is not a courtesy check in our own backend — an
exposed agent's spending transaction is composed with `quarantine_gate`, which reads
that agent's status UTXO as a **reference input** and fails the transaction outright.
Enforcement happens at consensus: deterministic, cross-organizational, and impossible
for one operator to lift on another operator's agent.

```bash
aiken check    # 14 tests, including the adversarial cases
aiken build    # emits plutus.json, consumed by packages/chain
```

## Validators

| Validator | Responsibility |
|---|---|
| `quarantine_gate` | Composed into agent spending flows. Permits the spend only when the agent's referenced status is `Clean` or `Cleared`. A **missing** status reference input fails — you cannot bypass the gate by omitting the evidence. |
| `agent_status` | One status UTXO **per agent** (never one global registry UTXO), so lookups are cheap reference inputs and agents never contend for the same eUTXO. `Flag` requires the recall issuer's signature; `Clear` requires an auditor-signed attestation for the *same* recall. |
| `recall_registry` | Holds `RecallDatum` with the issuer's locked stake. Reclaiming stake needs the issuer's signature — which is what makes a false recall slashable in the dispute path. |

## What the tests prove

Beyond the happy path, the suite pins down the ways enforcement could be cheated:

- omitting the status reference input does **not** pass the gate
- another agent's `Clean` status does **not** clear this agent
- an exposed agent stays blocked even when clean peers are referenced
- an attestation nobody signed does **not** clear a quarantine
- an attestation for a different recall, or a different agent, does **not** clear it
- an agent that isn't exposed cannot be "cleared"

## Datum shapes

See [lib/antidote/types.ak](lib/antidote/types.ak): `RecallDatum`, `AgentStatusDatum`
(`Clean | Exposed | Cleared`), `AttestationDatum`.

`packages/chain` loads the compiled blueprint and reports the real script hashes; the
dashboard displays them. With `BLOCKFROST_PROJECT_ID_PREPROD` set and funded wallets,
the same path submits live Preprod transactions.
