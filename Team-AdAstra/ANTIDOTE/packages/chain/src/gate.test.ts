import { describe, expect, it } from "vitest";
import { evaluateGate, type OnChainStatus } from "./index.ts";

/**
 * evaluateGate is the off-chain mirror of `transactable/2` in
 * validators/quarantine.ak — the two must agree, so these cases track the Aiken
 * suite's adversarial ones. If this drifts from the validator, the dashboard
 * would claim a spend outcome the real gate would not produce.
 */
describe("evaluateGate (mirror of the Aiken quarantine_gate)", () => {
  it("permits a clean agent", () => {
    expect(evaluateGate({ kind: "clean" })).toBe(true);
  });

  it("permits a cleared agent", () => {
    const status: OnChainStatus = { kind: "cleared", recall: "recall_1", auditor: "agent-auditor" };
    expect(evaluateGate(status)).toBe(true);
  });

  it("blocks an exposed agent", () => {
    expect(evaluateGate({ kind: "exposed", recall: "recall_1" })).toBe(false);
  });

  it("blocks when the status reference input is missing — the gate cannot be bypassed by omitting the evidence", () => {
    expect(evaluateGate(undefined)).toBe(false);
  });
});
