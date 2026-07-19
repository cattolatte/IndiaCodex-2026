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

function buildChain(): Provider[] {
  const chain: Provider[] = [];

  if (process.env.LLM_API_KEY) {
    chain.push({
      name: process.env.LLM_PROVIDER_NAME ?? "groq",
      baseUrl: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL ?? "llama-3.3-70b-versatile",
      cheapModel: process.env.LLM_MODEL_CHEAP ?? "llama-3.1-8b-instant",
    });
  }

  if (process.env.LLM_FALLBACK_API_KEY) {
    chain.push({
      name: process.env.LLM_FALLBACK_PROVIDER_NAME ?? "gemini",
      baseUrl:
        process.env.LLM_FALLBACK_BASE_URL ??
        "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: process.env.LLM_FALLBACK_API_KEY,
      // Prefer a non-thinking model here: reasoning models spend the token
      // budget on thought and can return an empty completion.
      model: process.env.LLM_FALLBACK_MODEL ?? "gemini-flash-lite-latest",
      cheapModel: process.env.LLM_FALLBACK_MODEL_CHEAP ?? "gemini-flash-lite-latest",
    });
  }

  return chain;
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
