import { useEffect, useReducer, useRef, useState } from "react";

/**
 * Small presentational primitives shared across the cockpit. Kept apart from
 * App.tsx so the main component stays about wiring, not micro-animation.
 */

/**
 * Animate a number toward its target with an ease-out curve. The big figures in
 * this dashboard — causal damage, the loss counter, R0 — carry the argument, so
 * they earn a beat of motion rather than snapping into place.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    // Nothing to animate; avoid scheduling a frame for a no-op.
    if (target === value) return;
    // Honour reduced-motion — snap straight to the value.
    if (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setValue(target);
      return;
    }
    fromRef.current = value;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // Intentionally keyed on target only: re-running on every `value` change
    // would restart the animation each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}

/** A dollar figure that counts up to its value. */
export function CountUpUsd({
  value,
  className,
  prefix = "",
}: {
  value: number;
  className?: string;
  prefix?: string;
}) {
  const animated = useCountUp(Math.abs(value));
  const sign = value < 0 ? "−" : "";
  return (
    <span className={className}>
      {sign}
      {prefix}${Math.round(animated).toLocaleString("en-US")}
    </span>
  );
}

/** A plain number that counts up, with optional suffix (e.g. "%"). */
export function CountUp({
  value,
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const animated = useCountUp(value);
  return (
    <span className={className}>
      {animated.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/**
 * A transient full-screen flash for the two most visceral beats — the on-chain
 * rejection and immunity refusal. It fires once per new occurrence and fades on
 * its own, so the demo has a punctuation mark the eye can't miss.
 */
export type FlashKind = "block" | "immune" | "recall";

const FLASH_TEXT: Record<FlashKind, { label: string; color: string }> = {
  block: { label: "QUARANTINE GATE · SPEND REJECTED", color: "#f87171" },
  immune: { label: "RE-INFECTION REFUSED — FLEET IMMUNE", color: "#34d399" },
  recall: { label: "RECALL ISSUED", color: "#fbbf24" },
};

export function Flash({ trigger }: { trigger: { kind: FlashKind; id: number } | null }) {
  const [shown, setShown] = useState<{ kind: FlashKind; id: number } | null>(null);
  const lastId = useRef(-1);

  useEffect(() => {
    if (!trigger || trigger.id === lastId.current) return;
    lastId.current = trigger.id;
    setShown(trigger);
    const t = setTimeout(() => setShown(null), 1100);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!shown) return null;
  const { label, color } = FLASH_TEXT[shown.kind];
  return (
    <div className="flash" key={shown.id}>
      <span className="flash-text" style={{ color, borderColor: color }}>
        {label}
      </span>
    </div>
  );
}

/**
 * A minimal reducer so a component can bump a monotonically increasing id when
 * it wants to re-trigger a keyed animation.
 */
export function useBump(): [number, () => void] {
  return useReducer((n: number) => n + 1, 0);
}

/**
 * The live operational state of the fleet, derived from agent statuses. It reads
 * like a control-room threat level and shifts through the story — nominal,
 * anomaly, outbreak, containment, immune — giving the whole page a pulse tied to
 * what is actually happening.
 */
export type SystemLevel = "nominal" | "anomaly" | "outbreak" | "contained" | "immune";

const LEVEL_META: Record<
  SystemLevel,
  { label: string; color: string; detail: (n: number) => string }
> = {
  nominal: {
    label: "SYSTEM NOMINAL",
    color: "#34d399",
    detail: () => "all agents clean · no active recall",
  },
  anomaly: {
    label: "ANOMALY FLAGGED",
    color: "#fbbf24",
    detail: (n) => `${n} agent${n === 1 ? "" : "s"} holding a suspected source`,
  },
  outbreak: {
    label: "OUTBREAK — FLEET QUARANTINED",
    color: "#f87171",
    detail: (n) => `${n} agent${n === 1 ? "" : "s"} exposed · transactions blocked`,
  },
  contained: {
    label: "CONTAINED — VERIFYING",
    color: "#60a5fa",
    detail: (n) => `${n} agent${n === 1 ? "" : "s"} decontaminated · attestations posting`,
  },
  immune: {
    label: "IMMUNE — RESTORED",
    color: "#34d399",
    detail: () => "fleet cleared and vaccinated against the recalled lie",
  },
};

export function deriveLevel(
  statuses: string[],
  immunised: boolean,
): { level: SystemLevel; count: number } {
  const exposed = statuses.filter((s) => s === "exposed").length;
  const suspected = statuses.filter((s) => s === "suspected").length;
  const cleared = statuses.filter((s) => s === "cleared").length;
  if (exposed > 0) return { level: "outbreak", count: exposed };
  if (suspected > 0) return { level: "anomaly", count: suspected };
  if (cleared > 0) return { level: immunised ? "immune" : "contained", count: cleared };
  return { level: "nominal", count: 0 };
}

export function StatusBand({ statuses, immunised }: { statuses: string[]; immunised: boolean }) {
  const { level, count } = deriveLevel(statuses, immunised);
  const meta = LEVEL_META[level];
  return (
    // Keyed on level so it re-animates each time the operational state shifts.
    <div className={`status-band level-${level}`} key={level} style={{ ["--lvl" as string]: meta.color }}>
      <span className="status-pip" />
      <span className="status-label">{meta.label}</span>
      <span className="status-detail">{meta.detail(count)}</span>
    </div>
  );
}
