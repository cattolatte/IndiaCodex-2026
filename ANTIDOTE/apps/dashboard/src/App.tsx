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
  agents: number;
  sources: number;
  recalls: number;
}

const STATE_COLORS: Record<string, string> = {
  clean: "#22c55e",
  tainted: "#ef4444",
  exposed: "#ef4444",
  cleared: "#3b82f6",
};

const EVENT_ICONS: Record<FeedEvent["kind"], string> = {
  source: "📰",
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
  info: "ℹ️",
};

export function App() {
  const [graph, setGraph] = useState<GraphPayload>({ nodes: [], links: [] });
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [status, setStatus] = useState<StatusView | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const graphSig = useRef("");

  const refresh = useCallback(async () => {
    try {
      const [g, ev, ag, st] = await Promise.all([
        apiGet<GraphPayload>("/api/graph"),
        apiGet<FeedEvent[]>("/api/events"),
        apiGet<AgentView[]>("/api/agents"),
        apiGet<StatusView>("/api/status"),
      ]);
      const sig =
        g.nodes.map((n) => `${n.id}:${n.state}`).join("|") + `#${g.links.length}`;
      if (sig !== graphSig.current) {
        graphSig.current = sig;
        setGraph({ nodes: g.nodes.map((n) => ({ ...n })), links: g.links.map((l) => ({ ...l })) });
      }
      setEvents(ev);
      setAgents(ag);
      setStatus(st);
    } catch {
      // registry not up yet — keep polling
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 2000);
    return () => clearInterval(t);
  }, [refresh]);

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
  ];

  return (
    <div className="shell">
      <header>
        <h1>
          ANTIDOTE <span className="sub">epistemic recalls for agent fleets</span>
        </h1>
        <div className="chips">
          <span className="chip">Masumi: {status?.masumiMode ?? "…"}</span>
          <span className="chip">sources {status?.sources ?? 0}</span>
          <span className="chip">recalls {status?.recalls ?? 0}</span>
        </div>
      </header>

      <div className="controls">
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
