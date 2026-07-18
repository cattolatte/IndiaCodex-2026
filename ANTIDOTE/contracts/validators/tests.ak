use antidote/types.{
  AgentStatusDatum, AttestationDatum, Cleared, Clean, Exposed, Quarantine,
  RecallDatum,
}
use cardano/address.{Address, Script, VerificationKey}
use cardano/assets
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction,
}
use quarantine.{blocks_transactions, cleared_by_attestation, transactable}

const agent_a = "agent-trading"

const agent_b = "agent-research"

const recall_1 = "sha256-forged-earnings"

const auditor_key = #"a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0"

const issuer_key = #"b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1"

fn script_address() -> Address {
  Address { payment_credential: Script("antidote"), stake_credential: None }
}

fn wallet_address() -> Address {
  Address {
    payment_credential: VerificationKey(auditor_key),
    stake_credential: None,
  }
}

fn ref(n: Int) -> OutputReference {
  OutputReference { transaction_id: #"cafe", output_index: n }
}

/// A reference input carrying an agent status datum.
fn status_input(datum: AgentStatusDatum, n: Int) -> Input {
  Input {
    output_reference: ref(n),
    output: Output {
      address: script_address(),
      value: assets.from_lovelace(2_000_000),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

fn attestation_input(datum: AttestationDatum, n: Int) -> Input {
  Input {
    output_reference: ref(n),
    output: Output {
      address: script_address(),
      value: assets.from_lovelace(2_000_000),
      datum: InlineDatum(datum),
      reference_script: None,
    },
  }
}

/// A reference input with no datum at all — noise the gate must ignore.
fn junk_input(n: Int) -> Input {
  Input {
    output_reference: ref(n),
    output: Output {
      address: wallet_address(),
      value: assets.from_lovelace(5_000_000),
      datum: NoDatum,
      reference_script: None,
    },
  }
}

fn tx_with(refs: List<Input>, signatories: List<ByteArray>) -> Transaction {
  Transaction { ..transaction.placeholder, reference_inputs: refs, extra_signatories: signatories }
}

fn status_of(agent: ByteArray, status) -> AgentStatusDatum {
  AgentStatusDatum {
    agent,
    status,
    manifest_root: #"deadbeef",
    updated_at: 1000,
  }
}

// ---------------------------------------------------------------------------
// The gate: a clean agent transacts, an exposed agent cannot.
// ---------------------------------------------------------------------------

test clean_agent_can_transact() {
  let tx = tx_with([status_input(status_of(agent_a, Clean), 0)], [])
  transactable(tx, agent_a)
}

test exposed_agent_is_blocked() {
  let tx =
    tx_with([status_input(status_of(agent_a, Exposed { recall: recall_1 }), 0)], [])
  !transactable(tx, agent_a)
}

test cleared_agent_can_transact_again() {
  let status =
    status_of(agent_a, Cleared { recall: recall_1, auditor: auditor_key })
  let tx = tx_with([status_input(status, 0)], [])
  transactable(tx, agent_a)
}

/// Omitting the status reference input must NOT be a way to slip past the gate.
test missing_status_is_blocked() {
  let tx = tx_with([junk_input(0)], [])
  !transactable(tx, agent_a)
}

/// Another agent's clean status must not clear this agent.
test other_agents_status_does_not_apply() {
  let tx = tx_with([status_input(status_of(agent_b, Clean), 0)], [])
  !transactable(tx, agent_a)
}

/// An exposed agent stays blocked even when a clean sibling is referenced.
test exposed_agent_blocked_among_clean_peers() {
  let tx =
    tx_with(
      [
        status_input(status_of(agent_b, Clean), 0),
        status_input(status_of(agent_a, Exposed { recall: recall_1 }), 1),
        junk_input(2),
      ],
      [],
    )
  !transactable(tx, agent_a)
}

// ---------------------------------------------------------------------------
// Clearing requires a real, auditor-signed attestation for the same recall.
// ---------------------------------------------------------------------------

fn attestation(agent: ByteArray, recall: ByteArray) -> AttestationDatum {
  AttestationDatum {
    agent,
    recall,
    auditor: auditor_key,
    probe_report: #"9999",
    manifest_root: #"deadbeef",
    cleared_at: 2000,
  }
}

test clear_succeeds_with_signed_attestation() {
  let current = status_of(agent_a, Exposed { recall: recall_1 })
  let tx =
    tx_with([attestation_input(attestation(agent_a, recall_1), 0)], [auditor_key])
  cleared_by_attestation(tx, current)
}

/// An attestation nobody signed proves nothing.
test clear_fails_without_auditor_signature() {
  let current = status_of(agent_a, Exposed { recall: recall_1 })
  let tx = tx_with([attestation_input(attestation(agent_a, recall_1), 0)], [])
  !cleared_by_attestation(tx, current)
}

/// An attestation for a different recall must not clear this one.
test clear_fails_for_wrong_recall() {
  let current = status_of(agent_a, Exposed { recall: recall_1 })
  let tx =
    tx_with(
      [attestation_input(attestation(agent_a, "some-other-recall"), 0)],
      [auditor_key],
    )
  !cleared_by_attestation(tx, current)
}

/// An attestation for a different agent must not clear this agent.
test clear_fails_for_wrong_agent() {
  let current = status_of(agent_a, Exposed { recall: recall_1 })
  let tx =
    tx_with([attestation_input(attestation(agent_b, recall_1), 0)], [auditor_key])
  !cleared_by_attestation(tx, current)
}

/// No attestation at all: no clearing.
test clear_fails_with_no_attestation() {
  let current = status_of(agent_a, Exposed { recall: recall_1 })
  let tx = tx_with([junk_input(0)], [auditor_key])
  !cleared_by_attestation(tx, current)
}

/// A clean agent has nothing to clear.
test clear_fails_when_not_exposed() {
  let current = status_of(agent_a, Clean)
  let tx =
    tx_with([attestation_input(attestation(agent_a, recall_1), 0)], [auditor_key])
  !cleared_by_attestation(tx, current)
}

// ---------------------------------------------------------------------------
// Recall severity
// ---------------------------------------------------------------------------

test quarantine_severity_blocks() {
  let recall =
    RecallDatum {
      source: recall_1,
      shard_root: #"1234",
      severity: Quarantine,
      issuer: issuer_key,
      stake_lovelace: 50_000_000,
      issued_at: 900,
    }
  blocks_transactions(recall)
}

test advisory_severity_does_not_block() {
  let recall =
    RecallDatum {
      source: recall_1,
      shard_root: #"1234",
      severity: types.Advisory,
      issuer: issuer_key,
      stake_lovelace: 50_000_000,
      issued_at: 900,
    }
  !blocks_transactions(recall)
}
