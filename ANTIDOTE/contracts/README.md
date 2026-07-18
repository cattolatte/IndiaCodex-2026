# ANTIDOTE — On-chain validator designs (roadmap)

This build enforces quarantine at the **Masumi payment/hiring layer** — the shared rails
where agent money already moves. The next iteration moves enforcement down to the
validator level so *any* Cardano transaction of an exposed agent fails at consensus.
The design (datums and validator responsibilities) lives in
[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) → "On-chain design sketch".

Planned validators (Aiken, Plutus V3, Preprod):

1. **Recall registry** — recall UTXOs with `RecallDatum`; issuer stake locked; slash path.
2. **Quarantine gate** — composed into agent payment flows; reads the agent's per-agent
   status UTXO via reference input; fails the spend while `Exposed` and un-attested.
3. **Attestation** — auditor-posted `AttestationDatum` flips status to `Cleared`.

Per-agent status UTXOs (not one global registry UTXO) avoid eUTXO contention.

Bootstrap, when picked up:

```bash
curl -sSfL https://install.aiken-lang.org | bash
aikup
aiken new antidote/contracts   # then flatten here
aiken check && aiken build     # emits plutus.json consumed by packages/chain via Mesh
```
