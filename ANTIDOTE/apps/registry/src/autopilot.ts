/**
 * Demo autopilot.
 *
 * Runs the entire story unattended, emitting a narration line before each beat
 * so a viewer (or a judge on the live link) can follow what is happening
 * without being told. Also the project's end-to-end regression test: if the
 * autopilot completes, every subsystem works together.
 */

export interface Beat {
  /** Narration shown in the dashboard banner while the beat runs. */
  say: string;
  /** Registry endpoint to call. */
  path: string;
  body?: unknown;
  /** Pause after the beat so the graph animation lands (ms). */
  hold?: number;
}

export const SCRIPT: Beat[] = [
  {
    say: "A three-agent fleet — research, analysis, trading — runs on a live market feed. Every hire is paid through Masumi.",
    path: "/api/seed",
    hold: 1500,
  },
  {
    say: "On clean information the fleet behaves: the trader reads the real filing and correctly holds.",
    path: "/api/tick",
    hold: 2000,
  },
  {
    say: "Now a forged earnings report enters the feed. Nobody has flagged it yet.",
    path: "/api/inject",
    hold: 1500,
  },
  {
    say: "The detector scores it for forgery signals and marks holders SUSPECTED — advisory only. Nothing is blocked yet.",
    path: "/api/detect",
    body: { source: "last-injected" },
    hold: 2500,
  },
  {
    say: "Watch the lie spread: research summarises it, analysis builds a thesis on that summary, and the trader sizes a $2.5M position on a forgery.",
    path: "/api/tick",
    hold: 3000,
  },
  {
    say: "A staked recall is issued. Exposure resolves through gateway-written manifests: research directly, analysis and trading transitively — through each other's outputs.",
    path: "/api/recalls",
    body: { source: "last-injected" },
    hold: 3000,
  },
  {
    say: "Mid-mistake, the trader tries to act on its position — and the transaction is rejected on-chain by the quarantine_gate validator. Not our backend being polite: the script refuses the spend.",
    path: "/api/execute",
    body: { agent: "agent-trading", description: "BUY ORBX $2,500,000" },
    hold: 3500,
  },
  {
    say: "The same status closes the other door: Masumi hiring routes around all three quarantined agents. They cannot spend, and they cannot earn.",
    path: "/api/tick",
    hold: 3000,
  },
  {
    say: "A decontamination agent is hired and paid 25 ADA over Masumi. It purges the recalled shards and recommits each manifest root.",
    path: "/api/hire",
    body: { role: "decontamination", input: { recall_id: "latest" } },
    hold: 2500,
  },
  {
    say: "A staked auditor is paid 15 ADA to probe them. The same questions that exposed contamination before now return no recollection — verified ignorance. Attestations post and the gate opens.",
    path: "/api/hire",
    body: { role: "auditor", input: { recall_id: "latest" } },
    hold: 3000,
  },
  {
    say: "The real correction publishes. The fleet is hireable again and trades correctly.",
    path: "/api/feed-update",
    hold: 1200,
  },
  { say: "Recovered — and still earning.", path: "/api/tick", hold: 2500 },
  {
    say: "But a recall only cures. Here comes the same lie again, reworded — a completely different hash, so content addressing cannot catch it.",
    path: "/api/reinject",
    hold: 2500,
  },
  {
    say: "The fleet is immune. The antibody minted from the recall matches the claims and the gateway refuses ingestion on contact. The lie never reaches an agent twice.",
    path: "/api/tick",
    hold: 3000,
  },
];
