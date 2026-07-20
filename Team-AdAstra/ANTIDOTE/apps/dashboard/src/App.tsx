import { useCallback, useEffect, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import { forceCollide, forceX, forceY } from "d3-force";
import type { FeedEvent, GraphLink, GraphNode, GraphPayload } from "@antidote/core";
import { apiGet, apiPost } from "./api.ts";
import { CountUp, CountUpUsd, Flash, type FlashKind, StatusBand } from "./ui.tsx";

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
  chainTip?: { network: string; height: number; epoch: number };
  llmMode: string;
  llmModel: string;
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
  failures: number;
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

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Escape untrusted text before it is interpolated into the graph tooltip's HTML.
 * Node labels include user-uploaded source titles (see /api/upload), and
 * react-force-graph renders `nodeLabel` as raw HTML — so an unescaped title would
 * be stored XSS against every viewer polling the shared registry state.
 */
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );

/** Compact relative time for the activity feed — "now", "12s", "4m", "2h". */
function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 3) return "now";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

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
  // A once-a-second clock so the activity feed's relative times stay current
  // without re-fetching. Cheap: one setState per second.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // The most visceral beats get a full-screen flash. Keyed on the triggering
  // event id so each new occurrence fires exactly once.
  const [flash, setFlash] = useState<{ kind: FlashKind; id: number } | null>(null);
  const lastFlashEvent = useRef("");
  // Don't flash for events already in the feed when the page first loads —
  // only for beats that happen while someone is watching.
  const flashHydrated = useRef(false);
  // The force graph needs explicit pixel dimensions, so track its container.
  // Hardcoding them clipped the graph on narrow screens — the first thing a
  // judge opening the live link on a phone would have seen.
  const graphBox = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [graphSize, setGraphSize] = useState({ width: 780, height: 520 });

  useEffect(() => {
    const el = graphBox.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width === 0) return;
      setGraphSize((prev) =>
        prev.width === width
          ? prev
          : { width, height: Math.max(320, Math.min(480, Math.round(width * 0.58))) },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    // ResizeObserver proved unreliable for this element across browsers, and a
    // graph sized to a stale viewport is very visible. Reading clientWidth is
    // cheap, so poll as a backstop rather than trusting one mechanism.
    const poll = setInterval(measure, 1000);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      clearInterval(poll);
    };
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [upTitle, setUpTitle] = useState("");
  const [upBody, setUpBody] = useState("");
  const graphSig = useRef("");
  // Node objects persist across polls so the force layout is never restarted.
  const nodeCache = useRef<Map<string, GraphNode>>(new Map());

  // Default repulsion assumes a linked graph. Before any ingestion the five
  // agents have no links at all, so they drift to the corners; damping the
  // charge keeps the idle state composed.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // Repulsion has to grow with the corpus: tuned for the idle five agents it
    // let a full run collapse into an unreadable knot. distanceMax stops the
    // disconnected idle state from flinging nodes to the corners instead.
    const charge = fg.d3Force("charge");
    charge?.strength(-140);
    // Capping the range keeps distant nodes from shoving each other to the
    // edges, which stretched links right across the canvas.
    charge?.distanceMax(260);
    fg.d3Force("link")?.distance(58);
    // A collision radius gives every node personal space, which stops two agent
    // labels ("Medic-1" over "Research-1") from landing on top of each other —
    // agents claim more room than sources because their labels are always drawn.
    fg.d3Force(
      "collide",
      forceCollide((n) => ((n as GraphNode).type === "agent" ? 34 : 16)).strength(0.9),
    );
    // A gentle pull toward the origin keeps disconnected agents (clean Medic and
    // Auditor before they're ever hired) from escaping the frame, without
    // collapsing the linked cluster the way a strong centre force would.
    fg.d3Force("x", forceX(0).strength(0.06));
    fg.d3Force("y", forceY(0).strength(0.06));
  }, []);

  // Re-frame only when the node count changes. Re-fitting on every state change
  // meant the timer was cancelled and rescheduled by each poll during a run, so
  // it never actually fired.
  const nodeCount = graph.nodes.length;
  useEffect(() => {
    if (nodeCount === 0) return;
    // The layout keeps drifting for a second or two after new nodes arrive, so
    // a single fit lands while things are still moving and leaves stragglers
    // outside the frame. Re-fit a few times as it settles.
    const timers = [500, 1400, 2600].map((delay) =>
      setTimeout(() => fgRef.current?.zoomToFit(400, 36), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [nodeCount]);

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
        // Reuse the existing node objects so the simulation keeps their x/y and
        // velocity. Handing the graph brand-new objects restarted the layout on
        // every status change, which threw the nodes off screen mid-demo.
        const live = nodeCache.current;
        const nodes = s.graph.nodes.map((incoming) => {
          const existing = live.get(incoming.id);
          if (existing) {
            Object.assign(existing, incoming);
            return existing;
          }
          const created = { ...incoming } as GraphNode;
          live.set(incoming.id, created);
          return created;
        });
        for (const id of [...live.keys()]) {
          if (!s.graph.nodes.some((n) => n.id === id)) live.delete(id);
        }
        setGraph({ nodes, links: s.graph.links.map((l) => ({ ...l })) });
      }
      // Flash on the headline beats. A recall isn't the *last* event (exposures
      // and the antibody log after it), so scan for the newest matching event
      // we haven't flashed yet. Event ids are monotonic ("ev_123").
      const seq = (id: string) => Number(id.replace(/\D/g, "")) || 0;
      const lastSeq = seq(lastFlashEvent.current);
      const FLASH_FOR: Record<string, FlashKind> = {
        blocked: "block",
        immunity: "immune",
        recall: "recall",
      };
      let best: { ev: FeedEvent; kind: FlashKind } | null = null;
      for (const ev of s.events) {
        const kind = FLASH_FOR[ev.kind];
        if (kind && seq(ev.id) > lastSeq) best = { ev, kind };
      }
      if (best) {
        lastFlashEvent.current = best.ev.id;
        // First poll only records where we are; it doesn't replay history.
        if (flashHydrated.current) setFlash({ kind: best.kind, id: seq(best.ev.id) });
      }
      flashHydrated.current = true;
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

  // Poll faster while the autopilot is driving so the narration stays in step
  // with the graph. Derived to a plain boolean so the dependency list is a
  // stable shape rather than flipping between undefined and a value.
  const autopilotRunning = auto?.running ?? false;

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), autopilotRunning ? 700 : 2000);
    return () => clearInterval(t);
  }, [refresh, autopilotRunning]);

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

  // Real Plutus script hashes are worth copying — a judge can verify them on a
  // Cardano explorer. Uses the async Clipboard API where available and falls
  // back to execCommand; either way it shows the confirmation and never throws.
  const copyHash = (el: HTMLElement, value: string) => {
    const done = () => {
      el.classList.add("copied");
      setTimeout(() => el.classList.remove("copied"), 1100);
    };
    try {
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(value).then(done, done);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      }
    } catch {
      done();
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

  // Space launches the full demo — a small courtesy for whoever is driving the
  // live link. Ignored while typing in the upload box or while a run is going.
  const canLaunch = !autopilotRunning && busy === null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space" && canLaunch) {
        e.preventDefault();
        void act("Autopilot", "/api/autopilot");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLaunch]);

  // A cold Render instance takes ~50s to wake. Rather than show a judge a page
  // of empty panels, hold a branded connecting screen until the first data lands.
  const connecting = offline && status === null;
  if (connecting) {
    return (
      <div className="waking">
        <div className="waking-card">
          <div className="waking-orb" />
          <h1>
            ANTIDOTE <span className="sub">epistemic recalls for agent fleets</span>
          </h1>
          <p className="waking-status">Waking the fleet…</p>
          <p className="waking-note">
            Free hosting spins down when idle. The registry and agent services are
            starting — this usually takes under a minute. The page connects on its own.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <Flash trigger={flash} />
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
          <span
            className={`chip${status?.llmMode === "live" ? " live" : ""}`}
            title={status?.llmModel}
          >
            AI: {status?.llmMode === "live" ? status.llmModel : (status?.llmMode ?? "…")}
          </span>
          <span className="chip">Masumi: {status?.masumiMode ?? "…"}</span>
          <span
            className={`chip${status?.chainTip ? " live" : ""}`}
            title={
              status?.chainTip
                ? `Connected to Cardano ${status.chainTip.network} · epoch ${status.chainTip.epoch} ` +
                  `(live chain tip, read-only via Blockfrost). The quarantine gate is evaluated against ` +
                  `the compiled validators locally — on-chain submission is simulated in this build.`
                : "No chain connection configured"
            }
          >
            Cardano:{" "}
            {status?.chainTip
              ? `${status.chainTip.network} · block ${status.chainTip.height.toLocaleString("en-US")}`
              : (status?.chainMode ?? "…")}
          </span>
          <span className="chip">sources {status?.sources ?? 0}</span>
          <span className="chip">recalls {status?.recalls ?? 0}</span>
        </div>
      </header>

      <StatusBand
        statuses={agents.map((a) => a.status.kind)}
        immunised={(immunity?.antibodies.length ?? 0) > 0}
      />

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
            <span key={v.name} className="validator">
              {v.name}{" "}
              <code
                className="copyable"
                title={`${v.hash} — click to copy`}
                onClick={(e) => copyHash(e.currentTarget, v.hash)}
              >
                {v.hash.slice(0, 12)}…
              </code>
            </span>
          ))}
        </div>
      )}

      {/* Orientation for a cold visitor. Once anything is happening the graph
          tells the story better, so this yields rather than pushing it down. */}
      {!auto?.running && auto?.beat === 0 && (status?.recalls ?? 0) === 0 && (
        <div className="intro">
          <p>
            Agents read documents and act on what they read. When a source turns out to be
            forged, there is no way to claw it back from every agent that ingested it — no
            equivalent of a food or drug recall for information.
            <strong> ANTIDOTE is that missing infrastructure.</strong>
          </p>
          <p className="cta">
            Press <strong>▶ Run full demo</strong> — ~90 seconds, no setup.
          </p>
        </div>
      )}

      {auto && (auto.running || auto.beat > 0) && (
        <div
          className={`narration${auto.running ? " live" : ""}${
            !auto.running && auto.failures > 0 ? " failed" : ""
          }`}
          // Drives the progress rail along the bottom edge of the banner.
          style={{ ["--progress" as string]: `${(auto.beat / auto.total) * 100}%` }}
        >
          <span className="beat">
            {auto.running ? `${auto.beat}/${auto.total}` : auto.failures > 0 ? "!" : "✓"}
          </span>
          {/* Keyed on the beat so each new line animates in as it changes —
              turning the banner into the demo's running voiceover. */}
          <p key={auto.beat}>{auto.say}</p>
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
        <span className="controls-hint">
          runs the whole story · ~90s · press <kbd>Space</kbd>
        </span>
      </div>

      {/* Ten equal buttons gave a first-time viewer no focal action. The manual
          steps stay available, but folded away behind the one that matters. */}
      <details className="steps">
        <summary>Drive it step by step</summary>
        <div className="controls">
          {controls.map((ctl) => (
          <button
            key={ctl.label}
            className={ctl.danger ? "danger" : ""}
            // Manual steps during an autopilot run would interleave with the
            // script and desynchronise the narration from what's on screen.
            disabled={busy !== null || auto?.running}
            onClick={() => void act(ctl.label, ctl.path, ctl.body)}
          >
              {busy === ctl.label ? "…working" : ctl.label}
            </button>
          ))}
        </div>
      </details>

      <div className="agents">
        {agents.map((a) => (
          <div
            key={a.id}
            className={`agent${a.status.kind === "exposed" ? " is-alert" : ""}`}
            style={{ borderColor: STATE_COLORS[a.status.kind] ?? "#64748b", color: STATE_COLORS[a.status.kind] ?? "#64748b" }}
          >
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

      <div className="main">
        <div className="graph-panel" ref={graphBox}>
          <div className="graph-title">
            Contagion graph
            <span>agents · sources · derived outputs</span>
          </div>
          {graph.links.length === 0 && !autopilotRunning && (
            <div className="graph-hint">
              Nothing has flowed yet. Run the demo to watch a forged source enter the feed
              and spread through the agents.
            </div>
          )}
          <ForceGraph2D
            ref={fgRef}
            // Re-frame once the simulation settles, otherwise the cluster drifts
            // to a corner of a panel that has since been resized.
            onEngineStop={() => fgRef.current?.zoomToFit(500, 60)}
            graphData={graph}
            width={graphSize.width}
            height={graphSize.height}
            backgroundColor="#0b1220"
            nodeLabel={(node) => {
              const g = node as unknown as GraphNode;
              const kind = g.type === "agent" ? (g.role ?? "agent") : "source";
              return `<div class="gtip"><strong>${escapeHtml(g.label)}</strong><span>${kind} · ${g.state}</span></div>`;
            }}
            nodeCanvasObject={(node, ctx, scale) => {
              const n = node as unknown as GraphNode & { x: number; y: number };
              // Every size is divided by the zoom scale so nodes stay constant
              // on screen. Previously these were graph-space constants, so when
              // the view auto-zoomed to fit a few nodes they rendered enormous.
              const px = (v: number) => v / scale;
              const color = STATE_COLORS[n.state] ?? "#64748b";
              const isAgent = n.type === "agent";
              const r = isAgent ? px(7) : px(5);

              // A soft halo makes contamination legible at a glance without
              // changing the node's footprint.
              if (n.state === "exposed" || n.state === "tainted" || n.state === "cleared") {
                const glow = ctx.createRadialGradient(n.x, n.y, r, n.x, n.y, r * 3);
                glow.addColorStop(0, `${color}55`);
                glow.addColorStop(1, `${color}00`);
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(n.x, n.y, r * 3, 0, 2 * Math.PI);
                ctx.fill();
              }

              ctx.fillStyle = color;
              ctx.strokeStyle = "#0b1220";
              ctx.lineWidth = px(1.5);
              if (isAgent) {
                ctx.beginPath();
                ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
              } else {
                ctx.fillRect(n.x - r, n.y - r, r * 2, r * 2);
                ctx.strokeRect(n.x - r, n.y - r, r * 2, r * 2);
              }

              // Only agents are permanently labelled. Source titles are long and
              // outnumber the agents, so drawing them all turned the canvas into
              // overlapping text — they live in the hover tooltip instead.
              if (!isAgent) return;

              const label = n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label;
              const fontPx = px(12);
              ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";

              // Backing plate keeps names readable where they cross links.
              const w = ctx.measureText(label).width;
              const pad = px(3);
              const top = n.y + r + px(4);
              ctx.fillStyle = "rgba(11,18,32,0.75)";
              ctx.fillRect(n.x - w / 2 - pad, top - pad / 2, w + pad * 2, fontPx + pad);
              ctx.fillStyle = "#e2e8f0";
              ctx.fillText(label, n.x, top);
            }}
            nodePointerAreaPaint={(node, paintColor, ctx, scale) => {
              const n = node as unknown as { x: number; y: number };
              ctx.fillStyle = paintColor;
              ctx.beginPath();
              ctx.arc(n.x, n.y, 9 / scale, 0, 2 * Math.PI);
              ctx.fill();
            }}
            linkColor={(l) => ((l as { kind?: string }).kind === "output" ? "#6366f1" : "#243047")}
            linkWidth={(l) => ((l as { kind?: string }).kind === "output" ? 1.4 : 0.8)}
            linkCurvature={0.12}
            // Particles travel the way information actually flows, so contagion
            // reads as movement rather than being inferred from colour alone.
            linkDirectionalParticles={2}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleColor={(l) =>
              (l as { kind?: string }).kind === "output" ? "#a5b4fc" : "#475569"
            }
            cooldownTicks={140}
            // Pre-run the simulation off-screen so the graph appears already
            // laid out instead of flinging nodes from the centre on every load.
            warmupTicks={80}
            d3VelocityDecay={0.28}
            minZoom={0.5}
            maxZoom={6}
          />
          <div className="legend">
            <span className="swatch" style={{ color: "#93a4c4" }}>
              <i className="dot" /> agent
            </span>
            <span className="swatch" style={{ color: "#93a4c4" }}>
              <i className="sq" /> source
            </span>
            <span className="swatch" style={{ color: STATE_COLORS.clean }}>
              <i className="dot" /> clean
            </span>
            <span className="swatch" style={{ color: STATE_COLORS.suspected }}>
              <i className="dot" /> suspected
            </span>
            <span className="swatch" style={{ color: STATE_COLORS.exposed }}>
              <i className="dot" /> tainted / exposed
            </span>
            <span className="swatch" style={{ color: STATE_COLORS.cleared }}>
              <i className="dot" /> cleared
            </span>
          </div>
        </div>

        <div className="feed">
          <h2>
            Activity
            <span className="feed-count">{events.length}</span>
          </h2>
          <ul>
            {[...events].reverse().map((ev) => (
              <li key={ev.id} className={`ev ev-${ev.kind}`}>
                <span className="icon">{EVENT_ICONS[ev.kind]}</span>
                <span className="msg">
                  {ev.message}
                  {ev.txRef && <code className="tx">{ev.txRef.slice(0, 16)}…</code>}
                </span>
                <time className="ev-time" dateTime={new Date(ev.at).toISOString()}>
                  {ago(ev.at, now)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {(cmp?.unprotectedFleet.lossUsd ?? 0) > 0 && (
        <div className="section-label">Evidence</div>
      )}

      {cmp && (cmp.unprotectedFleet.lossUsd > 0 || cmp.protectedFleet.blockedTransactions > 0) && (
        <div className="versus">
          <div className="side protected">
            <h3>ANTIDOTE fleet</h3>
            <CountUpUsd value={cmp.protectedFleet.lossUsd} className="figure good" />
            <span className="sub">lost to the forgery</span>
            <ul>
              <li>{cmp.protectedFleet.blockedTransactions} transaction(s) blocked by the quarantine gate</li>
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
            <CountUpUsd
              value={cmp.unprotectedFleet.lossUsd > 0 ? -cmp.unprotectedFleet.lossUsd : 0}
              className="figure bad"
            />
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
              <CountUp value={epi.r0} decimals={2} />
            </span>
            <span>
              <em>attack rate</em>
              <CountUp value={epi.attackRatePct} suffix="%" />
            </span>
            <span>
              <em>infection depth</em>
              <CountUp value={epi.infectionDepth} />
            </span>
            <span>
              <em>tainted sources</em>
              <CountUp value={epi.taintedSources} />
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
            <CountUpUsd value={post.totalDamageUsd} className="damage" />
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
          disabled={busy !== null || auto?.running || upBody.trim().length === 0}
          onClick={() => {
            void act("Upload", "/api/upload", { title: upTitle, content: upBody });
            setUpBody("");
            setUpTitle("");
          }}
        >
          Upload to feed
        </button>
      </details>

      <footer className="site-foot">
        <span className="foot-mark">ANTIDOTE</span>
        <span className="foot-tag">the public-health system for the machine economy</span>
        <span className="foot-stack">
          {["Cardano Preprod", "Masumi", "Aiken · Plutus V3", "MIP-003 agents", "Groq + Gemini"].map(
            (s) => (
              <span key={s} className="foot-badge">
                {s}
              </span>
            ),
          )}
        </span>
        <span className="foot-team">Team AdAstra · IndiaCodex ’26</span>
      </footer>
    </div>
  );
}
