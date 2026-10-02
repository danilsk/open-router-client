import { getSettings } from './store';
import { pcm16ToWav } from './audio';

export const API = 'https://openrouter.ai/api/v1';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'input_audio'; input_audio: { data: string; format: string } }
  | { type: 'file'; file: { filename: string; file_data: string } }
  | { type: 'video_url'; video_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
  reasoning_details?: unknown[];
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  server_tool_use_details?: { web_search_requests?: number };
}

export interface Citation {
  url: string;
  title?: string;
}

export type StreamEvent =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'reasoning_details'; details: unknown[] }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'images'; images: string[] }
  | { type: 'usage'; usage: Usage; model?: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public metadata?: unknown,
  ) {
    super(message);
  }
}

function headers(json = true, key = getSettings().apiKey): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    'HTTP-Referer': location.origin + import.meta.env.BASE_URL,
    'X-Title': 'OpenRouter Client',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function fail(r: Response): Promise<never> {
  let msg = `${r.status} ${r.statusText}`;
  let meta: unknown;
  try {
    const j = await r.json();
    msg = j?.error?.message ?? msg;
    meta = j?.error?.metadata;
    const raw = (meta as { raw?: unknown })?.raw;
    if (typeof raw === 'string' && raw.length < 400) msg += ` — ${raw}`;
  } catch {
    /* non-JSON error body */
  }
  throw new ApiError(r.status, msg, meta);
}

async function post(path: string, body: unknown, signal?: AbortSignal) {
  const r = await fetch(API + path, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal });
  if (!r.ok) await fail(r);
  return r;
}

async function get<T>(path: string, auth = true): Promise<T> {
  const r = await fetch(API + path, { headers: auth ? headers(false) : {} });
  if (!r.ok) await fail(r);
  return r.json();
}

export async function* chatStream(body: Record<string, unknown>, signal?: AbortSignal): AsyncGenerator<StreamEvent> {
  const r = await post('/chat/completions', { ...body, stream: true }, signal);
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      let j: any;
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new ApiError(j.error.code ?? 500, j.error.message ?? 'Stream error', j.error.metadata);
      const ch = j.choices?.[0];
      const d = ch?.delta ?? {};
      if (d.reasoning) yield { type: 'reasoning', text: d.reasoning };
      if (d.reasoning_details?.length) yield { type: 'reasoning_details', details: d.reasoning_details };
      if (d.content) yield { type: 'content', text: d.content };
      if (d.annotations?.length) {
        const citations = d.annotations
          .filter((a: any) => a.type === 'url_citation')
          .map((a: any) => ({ url: a.url_citation.url, title: a.url_citation.title }));
        if (citations.length) yield { type: 'citations', citations };
      }
      if (d.images?.length) yield { type: 'images', images: d.images.map((i: any) => i.image_url?.url).filter(Boolean) };
      if (ch?.finish_reason === 'error') throw new ApiError(500, 'The model stopped with an error');
      if (j.usage) yield { type: 'usage', usage: j.usage, model: j.model };
    }
  }
}

export interface ChatResult {
  text: string;
  usage?: Usage;
  model?: string;
}

export async function chat(body: Record<string, unknown>, signal?: AbortSignal): Promise<ChatResult> {
  const r = await post('/chat/completions', { ...body, stream: false }, signal);
  const j = await r.json();
  if (j.error) throw new ApiError(j.error.code ?? 500, j.error.message);
  const msg = j.choices?.[0]?.message;
  let text = msg?.content ?? '';
  if (Array.isArray(text)) text = text.map((p: any) => p.text ?? '').join('');
  return { text, usage: j.usage, model: j.model };
}

export interface SpeechReq {
  model: string;
  input: string;
  voice?: string;
  speed?: number;
  provider?: Record<string, unknown>;
}

const pcmOnly = (model: string) => model.startsWith('google/') && model.includes('tts');

export async function speech(req: SpeechReq, signal?: AbortSignal): Promise<Blob> {
  const send = (format: 'mp3' | 'pcm') =>
    fetch(API + '/audio/speech', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ ...req, response_format: format }),
      signal,
    });
  let format: 'mp3' | 'pcm' = pcmOnly(req.model) ? 'pcm' : 'mp3';
  let r = await send(format);
  if (r.status === 400 && format === 'mp3') {
    const text = await r.clone().text();
    if (/pcm/i.test(text)) {
      format = 'pcm';
      r = await send(format);
    }
  }
  if (!r.ok) await fail(r);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const ctype = r.headers.get('content-type') ?? '';
  if (format === 'pcm' || ctype.includes('pcm')) {
    const rate = Number(/rate=(\d+)/.exec(ctype)?.[1] ?? 24000);
    const channels = Number(/channels=(\d+)/.exec(ctype)?.[1] ?? 1);
    return pcm16ToWav(bytes, rate, channels);
  }
  return new Blob([bytes], { type: ctype || 'audio/mpeg' });
}

export async function transcribeEndpoint(
  model: string,
  b64: string,
  format: string,
  language?: string,
  signal?: AbortSignal,
): Promise<{ text: string; usage?: Usage }> {
  const r = await post('/audio/transcriptions', { model, input_audio: { data: b64, format }, ...(language ? { language } : {}) }, signal);
  const j = await r.json();
  return { text: j.text ?? '', usage: j.usage };
}

export interface ImageReq {
  model: string;
  prompt: string;
  n?: number;
  aspect_ratio?: string;
  resolution?: string;
  quality?: string;
  input_references?: { type: 'image_url'; image_url: { url: string } }[];
}

export async function generateImages(req: ImageReq, signal?: AbortSignal): Promise<{ images: string[]; usage?: Usage }> {
  const r = await post('/images', req, signal);
  const j = await r.json();
  const images = (j.data ?? []).map((d: any) =>
    d.b64_json ? `data:${d.media_type ?? 'image/png'};base64,${d.b64_json}` : d.url,
  );
  return { images: images.filter(Boolean), usage: j.usage };
}

export const fetchModels = () => get<{ data: any[] }>('/models?output_modalities=all', false);
export const fetchImageModels = () => get<{ data: any[] }>('/images/models', false);
export async function verifyKey(key: string) {
  const r = await fetch(API + '/key', { headers: headers(false, key) });
  if (!r.ok) await fail(r);
}
export const fetchKey = () => get<{ data: { label?: string; usage: number; limit: number | null; limit_remaining: number | null; is_free_tier: boolean } }>('/key');
export const fetchCredits = () => get<{ data: { total_credits: number; total_usage: number } }>('/credits');
export const fetchRankings = (q: string) => get<{ data: { date: string; model_permaslug: string; total_tokens: string }[] }>(`/datasets/rankings-daily?${q}`);
export const fetchBenchmarks = (source: string) => get<{ data: any[] }>(`/benchmarks?source=${source}`);

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const r = await fetch(API + '/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!r.ok) await fail(r);
  const j = await r.json();
  return j.key;
}
