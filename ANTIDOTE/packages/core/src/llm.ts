/**
 * LLM client with automatic provider failover.
 *
 * Any OpenAI-compatible endpoint works, so providers are configuration rather
 * than code. Calls walk a chain:
 *
 *   primary (Groq)  →  fallback (Gemini)  →  deterministic
 *
 * The point of the chain is a demo that cannot be killed by someone else's
 * rate limit. If the primary is exhausted or down we move to the next provider;
 * if every provider fails we return the caller's deterministic result, which is
 * degraded but never broken.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Use the small/fast model (probe batteries, scoring). */
  cheap?: boolean;
  maxTokens?: number;
  /** Deterministic result when every provider fails. */
  fallback: () => string;
}

interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  cheapModel: string;
}

const GEMINI_OPENAI = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Read one provider from a variable prefix, e.g. `LLM_FALLBACK` reads
 * LLM_FALLBACK_API_KEY / _BASE_URL / _MODEL / _MODEL_CHEAP / _PROVIDER_NAME.
 * A provider without a key is simply absent from the chain.
 */
function providerFrom(prefix: string, defaults: Omit<Provider, "apiKey">): Provider | undefined {
  const apiKey = process.env[`${prefix}_API_KEY`];
  if (!apiKey) return undefined;
  return {
    name: process.env[`${prefix}_PROVIDER_NAME`] ?? defaults.name,
    baseUrl: process.env[`${prefix}_BASE_URL`] ?? defaults.baseUrl,
    apiKey,
    model: process.env[`${prefix}_MODEL`] ?? defaults.model,
    cheapModel: process.env[`${prefix}_MODEL_CHEAP`] ?? defaults.cheapModel,
  };
}

/**
 * The chain, in the order it is tried. Extra providers are extra headroom:
 * free-tier quotas are per key, so a second key on the same vendor still buys
 * an independent budget.
 *
 * Gemini defaults use a non-thinking model deliberately — reasoning models
 * spend the token budget on thought and can return an empty completion.
 */
function buildChain(): Provider[] {
  return [
    providerFrom("LLM", {
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
      cheapModel: "llama-3.1-8b-instant",
    }),
    providerFrom("LLM_FALLBACK", {
      name: "gemini",
      baseUrl: GEMINI_OPENAI,
      model: "gemini-flash-lite-latest",
      cheapModel: "gemini-flash-lite-latest",
    }),
    providerFrom("LLM_FALLBACK2", {
      name: "gemini-2",
      baseUrl: GEMINI_OPENAI,
      model: "gemini-flash-lite-latest",
      cheapModel: "gemini-flash-lite-latest",
    }),
  ].filter((p): p is Provider => p !== undefined);
}

const CHAIN = buildChain();

/** Which provider actually served the most recent call. */
let activeProvider: string | undefined = CHAIN[0]?.name;

export function llmMode(): "live" | "offline" {
  return CHAIN.length > 0 ? "live" : "offline";
}

export function llmModel(): string {
  if (CHAIN.length === 0) return "deterministic fallback";
  const current = CHAIN.find((p) => p.name === activeProvider);
  return current ? current.model : "deterministic fallback";
}

/** Provider chain, for display and diagnostics. */
export function llmProviders(): { name: string; model: string; active: boolean }[] {
  return CHAIN.map((p) => ({ name: p.name, model: p.model, active: p.name === activeProvider }));
}

async function callProvider(
  provider: Provider,
  messages: ChatMessage[],
  opts: ChatOptions,
): Promise<string> {
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.cheap ? provider.cheapModel : provider.model,
      messages,
      max_tokens: opts.maxTokens ?? 400,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`${provider.name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`${provider.name} returned an empty completion`);
  return content;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  for (const provider of CHAIN) {
    try {
      const content = await callProvider(provider, messages, opts);
      if (activeProvider !== provider.name) {
        console.log(`[llm] now serving from ${provider.name}`);
        activeProvider = provider.name;
      }
      return content;
    } catch (err) {
      console.warn(`[llm] ${provider.name} failed: ${String(err)}`);
      // Try the next provider in the chain.
    }
  }

  if (CHAIN.length > 0) {
    console.warn("[llm] every provider failed — using deterministic fallback");
  }
  // Nothing served this call; saying otherwise would misreport the system's
  // own state on the dashboard.
  activeProvider = undefined;
  return opts.fallback();
}
