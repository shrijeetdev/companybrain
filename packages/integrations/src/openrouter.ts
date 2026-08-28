// OpenRouter client — thin wrapper over the OpenAI-compatible /chat/completions endpoint.
// Never throws: every failure (non-2xx, network, parse, timeout) returns { ok:false, error }.
// Tests inject fetchImpl to avoid real network.
//
// SECURITY: the API key is passed in per call and only ever leaves this process in the
// Authorization header. It is never logged, never returned, never part of an error string.

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  ok: boolean;
  text?: string;
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number };
  costUsd?: number | null;
  error?: string;
  durationMs: number;
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 120_000;

export async function complete(opts: {
  model: string;
  messages: ChatMsg[];
  apiKey: string;
  timeoutMs?: number;
  /** Test seam: inject a fetch implementation. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}): Promise<CompletionResult> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter requests these for ranking; harmless if the host ignores them.
        'HTTP-Referer': 'https://companybrain.app',
        'X-Title': 'companybrain',
      },
      body: JSON.stringify({ model: opts.model, messages: opts.messages }),
      signal: controller.signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.parse(raw)?.error?.message ?? ''; } catch { /* non-json body */ }
      return { ok: false, error: `OpenRouter ${res.status}: ${detail || raw.slice(0, 200)}`, durationMs: Date.now() - start };
    }

    const json = JSON.parse(raw) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    if (!text) return { ok: false, error: 'OpenRouter returned empty content', durationMs: Date.now() - start };
    return {
      ok: true,
      text,
      model: json.model,
      usage: json.usage,
      costUsd: null, // OpenRouter does not return $; approximated elsewhere if at all.
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    const aborted = err?.name === 'AbortError';
    return {
      ok: false,
      error: aborted ? `OpenRouter timed out after ${timeoutMs}ms` : (err?.message ?? String(err)),
      durationMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timer);
  }
}
