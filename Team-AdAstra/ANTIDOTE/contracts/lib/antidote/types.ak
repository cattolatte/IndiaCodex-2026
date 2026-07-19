use aiken/crypto.{VerificationKeyHash}

/// Identity of an agent in the fleet (its Masumi agent identifier, as bytes).
pub type AgentId =
  ByteArray

/// sha256 digest of a recalled source document.
pub type SourceHash =
  ByteArray

/// Merkle root over an agent's ingestion manifest.
pub type ManifestRoot =
  ByteArray

pub type Severity {
  /// Advisory: flag it, but don't stop the agent transacting.
  Advisory
  /// Quarantine: the agent cannot transact until decontamination is attested.
  Quarantine
}

/// A recall posted by a staked issuer. False recalls are slashable — the alarm
/// itself is accountable.
pub type RecallDatum {
  source: SourceHash,
  shard_root: ByteArray,
  severity: Severity,
  issuer: VerificationKeyHash,
  stake_lovelace: Int,
  issued_at: Int,
}

/// The health status carried by an agent's own UTXO. One status UTXO per agent
/// (not one global registry) so the gate reads it as a cheap reference input
/// with no eUTXO contention between agents.
pub type AgentStatus {
  /// No outstanding recall touches this agent.
  Clean
  /// Exposed under `recall`, no attestation yet — transactions are blocked.
  Exposed { recall: SourceHash }
  /// Decontaminated and verified by `auditor` — transactions flow again.
  Cleared { recall: SourceHash, auditor: VerificationKeyHash }
}

pub type AgentStatusDatum {
  agent: AgentId,
  status: AgentStatus,
  /// Manifest root the agent last committed to (recommitted after a purge).
  manifest_root: ManifestRoot,
  updated_at: Int,
}

/// Posted by a staked auditor after the probe battery passes.
pub type AttestationDatum {
  agent: AgentId,
  recall: SourceHash,
  auditor: VerificationKeyHash,
  /// Hash of the probe report — the evidence the verdict was earned.
  probe_report: ByteArray,
  /// Manifest root proven clean of the recalled shards.
  manifest_root: ManifestRoot,
  cleared_at: Int,
}

pub type StatusRedeemer {
  /// A recall issuer flags this agent as exposed.
  Flag
  /// An auditor clears the agent, referencing an attestation UTXO.
  Clear
}
