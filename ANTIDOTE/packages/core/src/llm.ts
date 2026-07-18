/**
 * Minimal LLM client over any OpenAI-compatible chat endpoint (Groq, Gemini,
 * etc. — configured via LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / LLM_MODEL_CHEAP).
 *
 * When no API key is configured, callers must supply a deterministic `fallback`
 * so the whole system stays runnable offline; the fallback is also the safety
 * net for rate limits mid-demo.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  /** Use the small/fast model (probe batteries, scoring). */
  cheap?: boolean;
  maxTokens?: number;
  /** Deterministic result when no key is set or the request fails. */
  fallback: () => string;
}

const BASE_URL = process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1";
const API_KEY = process.env.LLM_API_KEY ?? "";
const MODEL = process.env.LLM_MODEL ?? "llama-3.3-70b-versatile";
const MODEL_CHEAP = process.env.LLM_MODEL_CHEAP ?? "llama-3.1-8b-instant";

export function llmMode(): "live" | "offline" {
  return API_KEY ? "live" : "offline";
}

export async function chat(messages: ChatMessage[], opts: ChatOptions): Promise<string> {
  if (!API_KEY) return opts.fallback();
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: opts.cheap ? MODEL_CHEAP : MODEL,
        messages,
        max_tokens: opts.maxTokens ?? 400,
        temperature: 0.2,
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty completion");
    return content;
  } catch (err) {
    console.warn(`[llm] falling back to deterministic mode: ${String(err)}`);
    return opts.fallback();
  }
}
