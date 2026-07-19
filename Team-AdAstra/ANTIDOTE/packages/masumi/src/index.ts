/**
 * Masumi integration: agent registration on the Masumi registry and payments
 * through the (self-hosted) Masumi payment service — the rails that make
 * decontamination and audit *paid* agent services.
 *
 * Two implementations behind one interface:
 *  - live: talks to the payment service (PAYMENT_SERVICE_URL, x-api-key auth),
 *    Preprod network. POST /registry/ to register, payment/purchase endpoints
 *    to move funds.
 *  - mock: identical interface, instant confirmations, `mock_tx_*` refs —
 *    keeps the full economy runnable with no service, no keys, no network.
 *
 * Selection is automatic: a configured MASUMI_PAYMENT_API_KEY switches to live.
 */

export interface AgentRegistration {
  agentIdentifier: string;
  txHash: string;
}

export interface PaymentReceipt {
  paymentId: string;
  txHash: string;
  amountLovelace: bigint;
  seller: string;
  note: string;
}

export interface MasumiClient {
  mode: "live" | "mock";
  registerAgent(meta: {
    name: string;
    description: string;
    apiUrl: string;
  }): Promise<AgentRegistration>;
  /** Create a payment request for a job and settle it (hire → pay). */
  payForJob(opts: {
    seller: string;
    jobId: string;
    amountLovelace: bigint;
    note: string;
  }): Promise<PaymentReceipt>;
}

const PAYMENT_SERVICE_URL =
  process.env.MASUMI_PAYMENT_SERVICE_URL ?? "http://localhost:3001/api/v1";
const API_KEY = process.env.MASUMI_PAYMENT_API_KEY ?? "";
const NETWORK = process.env.MASUMI_NETWORK ?? "Preprod";

class LiveMasumi implements MasumiClient {
  mode = "live" as const;

  private async call<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
    const res = await fetch(`${PAYMENT_SERVICE_URL}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-api-key": API_KEY,
        token: API_KEY,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`masumi ${method} ${path} → ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  async registerAgent(meta: {
    name: string;
    description: string;
    apiUrl: string;
  }): Promise<AgentRegistration> {
    const data = await this.call<{
      data?: { agentIdentifier?: string; txHash?: string };
    }>("/registry/", {
      network: NETWORK,
      name: meta.name,
      description: meta.description,
      apiBaseUrl: meta.apiUrl,
      Tags: ["antidote", "epistemic-recall"],
      Capability: { name: meta.name, version: "1.0.0" },
    });
    return {
      agentIdentifier: data.data?.agentIdentifier ?? `pending-${meta.name}`,
      txHash: data.data?.txHash ?? "pending",
    };
  }

  async payForJob(opts: {
    seller: string;
    jobId: string;
    amountLovelace: bigint;
    note: string;
  }): Promise<PaymentReceipt> {
    const data = await this.call<{
      data?: { blockchainIdentifier?: string; txHash?: string };
    }>("/purchase/", {
      network: NETWORK,
      agentIdentifier: opts.seller,
      identifierFromPurchaser: opts.jobId,
      amounts: [{ amount: opts.amountLovelace.toString(), unit: "lovelace" }],
    });
    return {
      paymentId: data.data?.blockchainIdentifier ?? opts.jobId,
      txHash: data.data?.txHash ?? "pending",
      amountLovelace: opts.amountLovelace,
      seller: opts.seller,
      note: opts.note,
    };
  }
}

class MockMasumi implements MasumiClient {
  mode = "mock" as const;

  private ref(prefix: string): string {
    return `${prefix}_${Math.random().toString(16).slice(2, 10)}${Date.now().toString(16)}`;
  }

  async registerAgent(meta: {
    name: string;
    description: string;
    apiUrl: string;
  }): Promise<AgentRegistration> {
    return {
      agentIdentifier: `masumi_${meta.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      txHash: this.ref("mock_reg"),
    };
  }

  async payForJob(opts: {
    seller: string;
    jobId: string;
    amountLovelace: bigint;
    note: string;
  }): Promise<PaymentReceipt> {
    return {
      paymentId: this.ref("mock_pay"),
      txHash: this.ref("mock_tx"),
      amountLovelace: opts.amountLovelace,
      seller: opts.seller,
      note: opts.note,
    };
  }
}

export function createMasumiClient(): MasumiClient {
  return API_KEY ? new LiveMasumi() : new MockMasumi();
}
