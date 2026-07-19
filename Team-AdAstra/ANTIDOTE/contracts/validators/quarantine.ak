use aiken/collection/list
use antidote/types.{
  AgentStatus, AgentStatusDatum, AttestationDatum, Clean, Cleared, Clear, Exposed,
  Flag, Quarantine, RecallDatum, StatusRedeemer,
}
use cardano/transaction.{OutputReference, Transaction, Datum, InlineDatum}

/// ---------------------------------------------------------------------------
/// The quarantine gate.
///
/// This is the teeth. An agent's spending transactions are composed with this
/// script; it reads the agent's own status UTXO as a *reference input* and
/// fails the transaction outright while the agent is exposed and unattested.
///
/// Enforcement therefore happens at consensus: it is deterministic, applies
/// across organizations, and no operator can lift it for another operator's
/// agent. Remove the ledger and a recall degrades to a mailing list.
/// ---------------------------------------------------------------------------
validator quarantine_gate(agent: ByteArray) {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    transactable(self, agent)
  }

  else(_) {
    fail
  }
}

/// An agent may transact when its referenced status UTXO says Clean or Cleared.
/// A missing status reference input is a failure, not a pass — you cannot slip
/// a spend through by simply omitting the evidence.
pub fn transactable(self: Transaction, agent: ByteArray) -> Bool {
  when find_status(self, agent) is {
    Some(status) ->
      when status is {
        Clean -> True
        Cleared { .. } -> True
        Exposed { .. } -> False
      }
    None -> False
  }
}

/// Locate this agent's status among the transaction's reference inputs.
fn find_status(self: Transaction, agent: ByteArray) -> Option<AgentStatus> {
  self.reference_inputs
    |> list.filter_map(
        fn(input) {
          when decode_status(input.output.datum) is {
            Some(status_datum) ->
              if status_datum.agent == agent {
                Some(status_datum.status)
              } else {
                None
              }
            None -> None
          }
        },
      )
    |> list.head()
}

fn decode_status(datum: Datum) -> Option<AgentStatusDatum> {
  when datum is {
    InlineDatum(data) ->
      if data is status_datum: AgentStatusDatum {
        Some(status_datum)
      } else {
        None
      }
    _ -> None
  }
}

/// ---------------------------------------------------------------------------
/// Agent status registry.
///
/// One status UTXO per agent (never a single global registry UTXO) so the gate
/// above reads it as a cheap reference input and agents never contend for the
/// same eUTXO.
///
/// Flag: the recall issuer moves an agent to Exposed.
/// Clear: only permitted when an attestation for the same recall, signed by the
/// attesting auditor, is present in the transaction — decontamination has to be
/// verified, not merely claimed.
/// ---------------------------------------------------------------------------
validator agent_status(issuer: ByteArray) {
  spend(
    datum: Option<AgentStatusDatum>,
    redeemer: StatusRedeemer,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(current) = datum
    when redeemer is {
      Flag -> list.has(self.extra_signatories, issuer)
      Clear -> cleared_by_attestation(self, current)
    }
  }

  else(_) {
    fail
  }
}

/// A clear is valid only if the transaction carries an attestation for this
/// agent and this recall, and the attesting auditor signed it.
pub fn cleared_by_attestation(
  self: Transaction,
  current: AgentStatusDatum,
) -> Bool {
  when current.status is {
    Exposed { recall } ->
      self.reference_inputs
        |> list.any(
            fn(input) {
              when decode_attestation(input.output.datum) is {
                Some(att) ->
                  att.agent == current.agent && att.recall == recall && list.has(
                    self.extra_signatories,
                    att.auditor,
                  )
                None -> False
              }
            },
          )
    // Only an exposed agent can be cleared.
    _ -> False
  }
}

fn decode_attestation(datum: Datum) -> Option<AttestationDatum> {
  when datum is {
    InlineDatum(data) ->
      if data is att: AttestationDatum {
        Some(att)
      } else {
        None
      }
    _ -> None
  }
}

/// ---------------------------------------------------------------------------
/// Recall registry.
///
/// A recall locks issuer stake. Reclaiming that stake requires the issuer's
/// signature, which is what makes a false recall slashable in the dispute
/// path — the alarm is accountable.
/// ---------------------------------------------------------------------------
validator recall_registry {
  spend(
    datum: Option<RecallDatum>,
    _redeemer: Data,
    _own_ref: OutputReference,
    self: Transaction,
  ) {
    expect Some(recall) = datum
    list.has(self.extra_signatories, recall.issuer)
  }

  else(_) {
    fail
  }
}

/// A quarantine-severity recall is the one that blocks transactions.
pub fn blocks_transactions(recall: RecallDatum) -> Bool {
  recall.severity == Quarantine
}
