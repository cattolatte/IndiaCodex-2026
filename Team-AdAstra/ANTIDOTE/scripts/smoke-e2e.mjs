#!/usr/bin/env node
/**
 * End-to-end smoke test.
 *
 * Boots the registry and agent services in fully offline mode — deterministic
 * LLM fallbacks, mock Masumi, simulated chain, no API keys and therefore no
 * quota — runs the autopilot, and fails loudly unless every beat completes with
 * zero failures. It also asserts the doubt-market payout actually settled over
 * Masumi, so a regression in that wiring is caught here rather than on stage.
 *
 * This is the whole system's integration check: if it passes, every subsystem
 * works together. Run with `pnpm test:e2e`. Uses ports 4102/4302 so it never
 * collides with a running dev stack on 4100/4300.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REGISTRY_PORT = 4102;
const AGENTS_PORT = 4302;
const REGISTRY = `http://localhost:${REGISTRY_PORT}`;
const MIN_BEATS = 17;

// Force offline: no keys means deterministic LLM fallbacks, the mock Masumi
// client, and the simulated chain — nothing reaches the network.
const OFFLINE_ENV = {
  ...process.env,
  LLM_API_KEY: "",
  LLM_FALLBACK_API_KEY: "",
  LLM_FALLBACK2_API_KEY: "",
  MASUMI_PAYMENT_API_KEY: "",
  BLOCKFROST_PROJECT_ID_PREPROD: "",
  CARDANO_WALLET_MNEMONIC: "",
};

const children = [];
function boot(name, script, extraEnv) {
  const child = spawn("pnpm", [script], {
    cwd: ROOT,
    env: { ...OFFLINE_ENV, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const tag = (d) => `  [${name}] ${String(d).trimEnd()}`;
  child.stdout.on("data", (d) => console.log(tag(d)));
  child.stderr.on("data", (d) => console.error(tag(d)));
  children.push(child);
}

function cleanup() {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getState() {
  const res = await fetch(`${REGISTRY}/api/state`);
  return res.json();
}

async function waitFor(predicate, { timeoutMs, label }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const st = await getState();
      if (predicate(st)) return st;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  throw new Error(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

async function main() {
  boot("registry", "start:registry", { REGISTRY_PORT: String(REGISTRY_PORT) });
  boot("agents", "start:agents", {
    AGENTS_PORT: String(AGENTS_PORT),
    REGISTRY_URL: REGISTRY,
    AGENTS_PUBLIC_URL: `http://localhost:${AGENTS_PORT}`,
  });

  console.log("waiting for the fleet to enroll…");
  const enrolled = await waitFor((st) => st.status?.agents === 5, {
    timeoutMs: 60000,
    label: "5 agents enrolled",
  });
  console.log(
    `fleet enrolled — chainMode=${enrolled.status.chainMode}, masumi=${enrolled.status.masumiMode}, llm=${enrolled.status.llmMode}`,
  );

  const start = await (
    await fetch(`${REGISTRY}/api/autopilot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
  ).json();
  if (!start.started) throw new Error(`autopilot did not start: ${JSON.stringify(start)}`);
  console.log(`autopilot started (${start.beats} beats) — running…`);

  const done = await waitFor(
    (st) =>
      st.autopilot &&
      !st.autopilot.running &&
      st.autopilot.total > 0 &&
      st.autopilot.beat === st.autopilot.total,
    { timeoutMs: 180000, label: "autopilot completion" },
  );

  const { beat, total, failures, say } = done.autopilot;
  console.log(`\nautopilot finished — ${beat}/${total} beats, ${failures} failure(s)`);
  console.log(`final: ${say}`);

  const payments = await (await fetch(`${REGISTRY}/api/payments`)).json();
  const doubtSettled = payments.some((p) => /doubt/i.test(p.note ?? ""));

  const problems = [];
  if (total < MIN_BEATS) problems.push(`only ${total} beats (expected >= ${MIN_BEATS})`);
  if (beat !== total) problems.push(`only ${beat}/${total} beats completed`);
  if (failures > 0) problems.push(`${failures} beat failure(s)`);
  if (!doubtSettled) problems.push("no doubt-market settlement recorded (Masumi wiring regressed)");

  if (problems.length > 0) throw new Error(`SMOKE FAILED — ${problems.join("; ")}`);

  console.log(
    `\n✅ SMOKE PASSED — ${beat}/${total} beats, 0 failures, doubt payout settled over Masumi.`,
  );
}

main()
  .then(() => {
    cleanup();
    process.exit(0);
  })
  .catch((err) => {
    console.error(`\n❌ ${err.message}`);
    cleanup();
    process.exit(1);
  });

// Never leave orphaned servers behind, however the process ends.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(sig === "SIGINT" ? 130 : 143);
  });
}
