import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import type { FeedEvent, GraphPayload } from "@antidote/core";
import { apiGet, apiPost } from "./api.ts";

interface AgentView {
  id: string;
  name: string;
  role: string;
  masumiId?: string;
  status: { kind: string; via?: string };
  manifestSize: number;
}

interface StatusView {
  masumiMode: string;
  chainMode: string;
  agents: number;
  sources: number;
  recalls: number;
}

interface ValidatorView {
  plutusVersion: string;
  validators: { name: string; hash: string }[];
}

interface ImmunityView {
  herdImmunity: number;
  antibodies: { id: string; recallId: string; label: string; markers: number }[];
  blocked: { antibodyId: string; title: string; score: number; at: number }[];
}

const STATE_COLORS: Record<string, string> = {
  clean: "#22c55e",
  suspected: "#f59e0b",
  tainted: "#ef4444",
  exposed: "#ef4444",
  cleared: "#3b82f6",
};

const EVENT_ICONS: Record<FeedEvent["kind"], string> = {
  source: "📰",
  detection: "🧪",
  ingest: "📥",
  output: "📤",
  trade: "💰",
  blocked: "⛔",
  recall: "🚨",
  exposure: "☣️",
  hire: "🤝",
  hire_refused: "🚫",
  payment: "💸",
  purge: "🧹",
  probe: "🔎",
  attestation: "📜",
  cleared: "✅",
  antibody: "💉",
  immunity: "🛡️",
  narration: "🎬",
  clone: "🩸",
  autopsy: "🔬",
  doubt: "📉",
  canary: "🐤",
  info: "ℹ️",
};

interface EpiView {
  r0: number;
  attackRatePct: number;
  infectionDepth: number;
  taintedSources: number;
  containmentMs?: number;
  exposureWindowMs?: number;
  immunised: boolean;
}

interface ReceiptView {
  agentName: string;
  oldRoot: string;
  newRoot: string;
  proofs: { shard: string; verified: boolean; independentlyVerified: boolean }[];
}

interface CanaryView {
  violations: {
    issuedToName: string;
    foundInName: string;
    sourceTitle: string;
    at: number;
  }[];
}

/** The whole cockpit in one payload — see the registry's /api/state. */
interface StateView {
  status: StatusView;
  agents: AgentView[];
  graph: GraphPayload;
  events: FeedEvent[];
  autopilot: AutopilotView;
  immunity: ImmunityView;
  comparison: ComparisonView;
  autopsy: AutopsyView;
  doubt: DoubtView;
  canaries: CanaryView["violations"];
  epidemiology: EpiView;
  receipts: ReceiptView[];
}

interface DoubtView {
  openPositions: number;
  openStakeAda: number;
  settledPositions: number;
  totalPaidAda: number;
  positions: {
    id: string;
    skeptic: string;
    sourceLabel: string;
    stakeAda: number;
    detectorScoreAtOpen: number;
    settled?: { won: boolean; payoutAda: number };
  }[];
}

interface AutopsyView {
  taintedSources: number;
  totalDamageUsd: number;
  findings: {
    agent: string;
    actual: string;
    counterfactual: string;
    damageUsd: number;
    reasoning: string;
  }[];
}

interface AutopilotView {
  running: boolean;
  beat: number;
  total: number;
  say: string;
}

interface ComparisonView {
  protectedFleet: {
    lossUsd: number;
    blockedTransactions: number;
    refusedHires: number;
    refusedIngestions: number;
    containmentMs?: number;
    exposureWindowMs?: number;
  };
  unprotectedFleet: { lossUsd: number; openPositions: number; holdingTheBag: boolean };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function App() {
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], links: [] });
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [status, setStatus] = useState<StatusView | null>(null);
  const [chain, setChain] = useState<ValidatorView | null>(null);
  const [immunity, setImmunity] = useState<ImmunityView | null>(null);
  const [auto, setAuto] = useState<AutopilotView | null>(null);
  const [cmp, setCmp] = useState<ComparisonView | null>(null);
  const [post, setPost] = useState<AutopsyView | null>(null);
  const [doubt, setDoubt] = useState<DoubtView | null>(null);
  const [canaries, setCanaries] = useState<CanaryView | null>(null);
  const [epi, setEpi] = useState<EpiView | null>(null);
  const [receipts, setReceipts] = useState<ReceiptView[]>([]);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [upTitle, setUpTitle] = useState("");
  const [upBody, setUpBody] = useState("");
  const graphSig = useRef("");

  useEffect(() => {
    apiGet<ValidatorView>("/api/validators")
      .then(setChain)
      .catch(() => undefined);
  }, []);

  /**
   * One request per tick. The force-graph is only re-seeded when the topology
   * or a node's state actually changes, otherwise React would hand it new
   * object identities every poll and the simulation would restart mid-demo.
   */
  const refresh = useCallback(async () => {
    try {
      const s = await apiGet<StateView>("/api/state");
      const sig =
        s.graph.nodes.map((n) => `${n.id}:${n.state}`).join("|") + `#${s.graph.links.length}`;
      if (sig !== graphSig.current) {
        graphSig.current = sig;
        setGraph({
          nodes: s.graph.nodes.map((n) => ({ ...n })),
          links: s.graph.links.map((l) => ({ ...l })),
        });
      }
      setEvents(s.events);
      setAgents(s.agents);
      setStatus(s.status);
      setImmunity(s.immunity);
      setAuto(s.autopilot);
      setCmp(s.comparison);
      setPost(s.autopsy);
      setDoubt(s.doubt);
      setCanaries({ violations: s.canaries });
      setEpi(s.epidemiology);
      setReceipts(s.receipts);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), auto?.running ? 700 : 2000);
    return () => clearInterval(t);
  }, [refresh, auto?.running]);

  const act = async (label: string, path: string, body?: unknown) => {
    setBusy(label);
    try {
      await apiPost(path, body);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(null);
      void refresh();
    }
  };

  const controls: { label: string; path: string; body?: unknown; danger?: boolean }[] = [
    { label: "Seed feed", path: "/api/seed" },
    { label: "Run pipeline", path: "/api/tick" },
    { label: "Inject forged report", path: "/api/inject", danger: true },
    { label: "Run detector", path: "/api/detect", body: { source: "last-injected" } },
    { label: "Issue recall", path: "/api/recalls", body: { source: "last-injected" } },
    {
      label: "Hire decontamination",
      path: "/api/hire",
      body: { role: "decontamination", input: { recall_id: "latest" } },
    },
    {
      label: "Hire auditor",
      path: "/api/hire",
      body: { role: "auditor", input: { recall_id: "latest" } },
    },
    { label: "Publish clean update", path: "/api/feed-update" },
    { label: "Re-inject (reworded)", path: "/api/reinject", danger: true },
  ];

  return (
    <div className="shell">
      <header>
        <h1>
          ANTIDOTE <span className="sub">epistemic recalls for agent fleets</span>
        </h1>
        <div className="chips">
          {offline && (
            <span className="chip offline">
              registry unreachable — retrying (free hosting can take ~50s to wake)
            </span>
          )}
          <span className="chip">Masumi: {status?.masumiMode ?? "…"}</span>
          <span className="chip">Cardano: {status?.chainMode ?? "…"}</span>
          <span className="chip">sources {status?.sources ?? 0}</span>
          <span className="chip">recalls {status?.recalls ?? 0}</span>
        </div>
      </header>

      {immunity && immunity.antibodies.length > 0 && (
        <div className="immunity">
          <span className="ilabel">
            💉 Immune memory · herd immunity {immunity.herdImmunity}%
          </span>
          {immunity.antibodies.map((a) => (
            <span key={a.id} className="antibody">
              {a.id} <em>{a.markers} markers</em>
            </span>
          ))}
          {immunity.blocked.length > 0 && (
            <span className="blocked-count">
              {immunity.blocked.length} re-infection
              {immunity.blocked.length === 1 ? "" : "s"} refused on contact
            </span>
          )}
        </div>
      )}

      {chain && (
        <div className="validators">
          <span className="vlabel">Plutus {chain.plutusVersion} validators enforcing quarantine:</span>
          {chain.validators.map((v) => (
            <span key={v.name} className="validator" title={v.hash}>
              {v.name} <code>{v.hash.slice(0, 12)}…</code>
            </span>
          ))}
        </div>
      )}

      {auto && (auto.running || auto.beat > 0) && (
        <div className={`narration${auto.running ? " live" : ""}`}>
          <span className="beat">
            {auto.running ? `${auto.beat}/${auto.total}` : "✓"}
          </span>
          <p>{auto.say}</p>
        </div>
      )}

      <div className="controls">
        <button
          className="primary"
          disabled={busy !== null || auto?.running}
          onClick={() => void act("Autopilot", "/api/autopilot")}
        >
          {auto?.running ? "▶ Running…" : "▶ Run full demo"}
        </button>
        {controls.map((ctl) => (
          <button
            key={ctl.label}
            className={ctl.danger ? "danger" : ""}
            disabled={busy !== null}
            onClick={() => void act(ctl.label, ctl.path, ctl.body)}
          >
            {busy === ctl.label ? "…working" : ctl.label}
          </button>
        ))}
      </div>

      <details className="upload">
        <summary>Upload your own document into the feed</summary>
        <input
          value={upTitle}
          onChange={(e) => setUpTitle(e.target.value)}
          placeholder="Document title"
        />
        <textarea
          value={upBody}
          onChange={(e) => setUpBody(e.target.value)}
          rows={4}
          placeholder="Paste any document — a forged earnings report, a poisoned research note…"
        />
        <button
          disabled={busy !== null || upBody.trim().length === 0}
          onClick={() => {
            void act("Upload", "/api/upload", { title: upTitle, content: upBody });
            setUpBody("");
            setUpTitle("");
          }}
        >
          Upload to feed
        </button>
      </details>

      <div className="agents">
        {agents.map((a) => (
          <div key={a.id} className="agent" style={{ borderColor: STATE_COLORS[a.status.kind] ?? "#64748b" }}>
            <strong>{a.name}</strong>
            <span className="role">{a.role}</span>
            <span className="state" style={{ color: STATE_COLORS[a.status.kind] ?? "#94a3b8" }}>
              {a.status.kind.toUpperCase()}
              {a.status.via ? ` (${a.status.via})` : ""}
            </span>
            <span className="mid">{a.masumiId ?? "unregistered"}</span>
          </div>
        ))}
      </div>

      {cmp && (cmp.unprotectedFleet.lossUsd > 0 || cmp.protectedFleet.blockedTransactions > 0) && (
        <div className="versus">
          <div className="side protected">
            <h3>ANTIDOTE fleet</h3>
            <span className="figure good">{usd(cmp.protectedFleet.lossUsd)}</span>
            <span className="sub">lost to the forgery</span>
            <ul>
              <li>{cmp.protectedFleet.blockedTransactions} transaction(s) rejected on-chain</li>
              <li>{cmp.protectedFleet.refusedHires} hire(s) refused</li>
              <li>{cmp.protectedFleet.refusedIngestions} re-infection(s) refused</li>
              {cmp.protectedFleet.exposureWindowMs !== undefined && (
                <li>
                  lie was actionable for{" "}
                  {(cmp.protectedFleet.exposureWindowMs / 1000).toFixed(1)}s, then contained in{" "}
                  {cmp.protectedFleet.containmentMs
                    ? `${cmp.protectedFleet.containmentMs}ms`
                    : "<1ms"}
                </li>
              )}
            </ul>
          </div>
          <div className="side unprotected">
            <h3>Identical fleet, no ANTIDOTE</h3>
            <span className="figure bad">
              {cmp.unprotectedFleet.lossUsd > 0 ? `−${usd(cmp.unprotectedFleet.lossUsd)}` : usd(0)}
            </span>
            <span className="sub">
              {cmp.unprotectedFleet.holdingTheBag
                ? "still holding positions built on a lie"
                : "marked to the truth"}
            </span>
            <ul>
              <li>no recall infrastructure</li>
              <li>no quarantine — every trade landed</li>
              <li>still ingests the same lie on its next pass</li>
            </ul>
          </div>
        </div>
      )}

      {epi && epi.taintedSources > 0 && (
        <div className="epi">
          <h3>🦠 Outbreak surveillance</h3>
          <div className="stats">
            <span>
              <em>R₀</em>
              {epi.r0}
            </span>
            <span>
              <em>attack rate</em>
              {epi.attackRatePct}%
            </span>
            <span>
              <em>infection depth</em>
              {epi.infectionDepth}
            </span>
            <span>
              <em>tainted sources</em>
              {epi.taintedSources}
            </span>
            <span>
              <em>exposure window</em>
              {epi.exposureWindowMs !== undefined
                ? `${(epi.exposureWindowMs / 1000).toFixed(1)}s`
                : "—"}
            </span>
            <span>
              <em>containment</em>
              {epi.containmentMs !== undefined
                ? epi.containmentMs > 0
                  ? `${epi.containmentMs}ms`
                  : "<1ms"
                : "—"}
            </span>
            <span>
              <em>immunised</em>
              {epi.immunised ? "yes" : "no"}
            </span>
          </div>
        </div>
      )}

      {receipts.length > 0 && (
        <div className="receipts">
          <h3>🧾 Purge receipts — verifiable non-membership</h3>
          {receipts.map((r, i) => (
            <div key={i} className="receipt">
              <strong>{r.agentName}</strong>
              <code>
                {r.oldRoot.slice(0, 10)}… → {r.newRoot.slice(0, 10)}…
              </code>
              {r.proofs.map((p) => (
                <span key={p.shard} className={p.independentlyVerified ? "ok" : "bad"}>
                  {p.independentlyVerified ? "✓" : "✗"} shard {p.shard.slice(0, 10)}… proven
                  absent
                </span>
              ))}
            </div>
          ))}
          <p className="note">
            Deletion is proven against the recommitted manifest root, not asserted. The
            same statement is what a ZK proof would attest without revealing the manifest.
          </p>
        </div>
      )}

      {canaries && canaries.violations.length > 0 && (
        <div className="canaries">
          <h3>🐤 Sentinel surveillance — undeclared ingestion detected</h3>
          {canaries.violations.map((v, i) => (
            <p key={i}>
              A canary issued to <strong>{v.issuedToName}</strong> for “{v.sourceTitle}”
              surfaced in <strong>{v.foundInName}</strong>’s output — but{" "}
              {v.foundInName}’s manifest never declared it. Proof of a data path
              outside the gateway.
            </p>
          ))}
        </div>
      )}

      {doubt && doubt.positions.length > 0 && (
        <div className="doubt">
          <div className="dhead">
            <h3>📉 Doubt market — short the lie</h3>
            <span className="sub">
              {doubt.openPositions} open · {doubt.openStakeAda} ADA at risk ·{" "}
              {doubt.settledPositions} settled · {doubt.totalPaidAda} ADA paid to skeptics
            </span>
          </div>
          <ul>
            {doubt.positions.map((p) => (
              <li key={p.id} className={p.settled ? "won" : "open"}>
                <strong>{p.skeptic}</strong> staked {p.stakeAda} ADA against “{p.sourceLabel}”
                {p.detectorScoreAtOpen > 0 && (
                  <em> · detector {p.detectorScoreAtOpen}/100 at open</em>
                )}
                {p.settled ? (
                  <span className="payout">
                    recall confirmed — paid {p.settled.payoutAda} ADA
                  </span>
                ) : (
                  <span className="pending">open — burns if no recall arrives</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {post && post.findings.length > 0 && (
        <div className="autopsy">
          <div className="ahead">
            <h3>🔬 Epistemic autopsy — counterfactual replay</h3>
            <span className="damage">{usd(post.totalDamageUsd)}</span>
            <span className="sub">causal damage attributable to the recalled source</span>
          </div>
          {post.findings.map((f) => (
            <div key={f.agent} className="finding">
              <div className="worlds">
                <span className="world actualw">
                  <em>actual</em>
                  {f.actual}
                </span>
                <span className="arrow">vs</span>
                <span className="world counterw">
                  <em>without the lie</em>
                  {f.counterfactual}
                </span>
              </div>
              <p>{f.reasoning}</p>
            </div>
          ))}
        </div>
      )}

      <div className="main">
        <div className="graph-panel">
          <ForceGraph2D
            graphData={graph}
            width={780}
            height={520}
            backgroundColor="#0b1220"
            nodeCanvasObject={(node, ctx, scale) => {
              const n = node as unknown as GraphPayload["nodes"][number] & {
                x: number;
                y: number;
              };
              const color = STATE_COLORS[n.state] ?? "#64748b";
              ctx.fillStyle = color;
              if (n.type === "agent") {
                ctx.beginPath();
                ctx.arc(n.x, n.y, 7, 0, 2 * Math.PI);
                ctx.fill();
              } else {
                ctx.fillRect(n.x - 5, n.y - 5, 10, 10);
              }
              const label = n.label.length > 28 ? `${n.label.slice(0, 27)}…` : n.label;
              ctx.font = `${11 / scale ** 0.4}px system-ui`;
              ctx.textAlign = "center";
              ctx.fillStyle = "#cbd5e1";
              ctx.fillText(label, n.x, n.y + 16);
            }}
            linkColor={(l) =>
              (l as { kind?: string }).kind === "output" ? "#818cf8" : "#334155"
            }
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
          />
          <div className="legend">
            <span>● agent</span>
            <span>■ source</span>
            <span style={{ color: STATE_COLORS.clean }}>clean</span>
            <span style={{ color: STATE_COLORS.suspected }}>suspected</span>
            <span style={{ color: STATE_COLORS.exposed }}>tainted / exposed</span>
            <span style={{ color: STATE_COLORS.cleared }}>cleared</span>
          </div>
        </div>

        <div className="feed">
          <h2>Activity</h2>
          <ul>
            {[...events].reverse().map((ev) => (
              <li key={ev.id} className={`ev ev-${ev.kind}`}>
                <span className="icon">{EVENT_ICONS[ev.kind]}</span>
                <span className="msg">{ev.message}</span>
                {ev.txRef && <code className="tx">{ev.txRef.slice(0, 18)}…</code>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
