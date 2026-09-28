import 'server-only';
import { systemInstruction } from './instruction';

/**
 * The Gemini call, from orbit_ai_call_gemini().
 *
 * **Requires configuration**: `GEMINI_API_KEY` (as .env.example names it; `ORBIT_GEMINI_API_KEY` also works). Without it the assistant is
 * off and the menu entry does not appear, so no student is sent to a page that
 * cannot answer.
 *
 * Two behaviours are carried over exactly:
 *
 *   1. **Several models are tried in order.** The free tier counts its daily
 *      requests PER MODEL, so naming three of them triples the day's allowance at
 *      no cost, and it also carries the assistant through a model that is briefly
 *      overloaded.
 *   2. **Only 429, 404 and 503 hand over to the next model.** Anything else — a
 *      bad key, a malformed request — is final: retrying it on another model
 *      would waste a second request and give the same answer.
 *
 * The key never leaves the server, and the system instruction is never returned
 * to the browser.
 */

export interface GeminiResult {
  ok: boolean;
  text: string;
  reason: string;
  model: string;
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiTurn {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiConfig {
  apiKey: string;
  models: string[];
  endpoint: string;
  timeoutMs: number;
}

export function geminiConfig(): GeminiConfig {
  const models = (process.env.ORBIT_GEMINI_MODEL ?? process.env.GEMINI_MODEL ??
    'gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.5-flash')
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model !== '');

  return {
    apiKey: (process.env.ORBIT_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY ?? '').trim(),
    models,
    endpoint: (process.env.ORBIT_GEMINI_ENDPOINT ??
      'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, ''),
    timeoutMs: Math.max(15, Number(process.env.ORBIT_GEMINI_TIMEOUT ?? 45)) * 1000,
  };
}

export function geminiAvailable(): boolean {
  const key = geminiConfig().apiKey;
  return key !== '' && key !== 'YOUR_GEMINI_API_KEY';
}

/** Asks the models in order, handing over only on a retryable failure. */
export async function askGemini(contents: GeminiTurn[]): Promise<GeminiResult> {
  const config = geminiConfig();
  if (!geminiAvailable()) {
    return { ok: false, text: '', reason: 'no api key', model: '' };
  }

  let last: GeminiResult = { ok: false, text: '', reason: 'no model configured', model: '' };

  for (const model of config.models) {
    last = await callModel(config, model, contents);
    if (last.ok) return last;

    // Out of quota, retired, or momentarily overloaded: try the next model.
    const handOver = ['http 429', 'http 404', 'http 503'].some((code) =>
      last.reason.startsWith(code)
    );
    if (!handOver) return last;
  }

  return last;
}

async function callModel(
  config: GeminiConfig,
  model: string,
  contents: GeminiTurn[]
): Promise<GeminiResult> {
  const url = `${config.endpoint}/models/${encodeURIComponent(model)}:generateContent`;

  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction() }] },
    contents,
    generationConfig: {
      // Steady explanations rather than invention.
      temperature: 0.4,
      maxOutputTokens: 2048,
      topP: 0.95,
    },
    // The model's own filters stay on; these are the categories a school
    // assistant must never produce.
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The header form, not a query parameter: a key in a URL ends up in
        // proxy logs and browser history.
        'x-goog-api-key': config.apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return { ok: false, text: '', reason: `http ${response.status}`, model };
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };

    if (data.promptFeedback?.blockReason) {
      return { ok: false, text: '', reason: `blocked: ${data.promptFeedback.blockReason}`, model };
    }

    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? '')
      .join('')
      .trim();

    if (text === '') {
      return { ok: false, text: '', reason: 'empty response', model };
    }
    return { ok: true, text, reason: '', model };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return { ok: false, text: '', reason: aborted ? 'timeout' : 'network error', model };
  } finally {
    clearTimeout(timeout);
  }
}
