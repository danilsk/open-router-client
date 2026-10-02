import { ApiError, chat, type ChatMessage, type ContentPart, type Usage } from './api';
import { blobToBase64, toWav16k } from './audio';
import { parseLoose } from './json';
import { fastParams, jsonFormat } from './models';

export async function audioPart(blob: Blob): Promise<ContentPart> {
  return { type: 'input_audio', input_audio: { data: await blobToBase64(await toWav16k(blob)), format: 'wav' } };
}

export interface JsonResult<T> {
  data: T;
  usage?: Usage;
  ms: number;
}

export async function jsonCall<T>(
  model: string,
  name: string,
  schema: object,
  system: string,
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; temperature?: number } = {},
): Promise<JsonResult<T>> {
  const t0 = performance.now();
  const sys: ChatMessage = {
    role: 'system',
    content: `${system}\n\nRespond with only a JSON object that matches this JSON Schema:\n${JSON.stringify(schema)}`,
  };
  const body = (structured: boolean) => ({
    model,
    messages: [sys, ...messages],
    ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    ...fastParams(model),
    ...(structured ? jsonFormat(model, name, schema) : {}),
  });
  let r;
  try {
    r = await chat(body(true), opts.signal);
  } catch (e) {
    if (e instanceof ApiError && e.status === 400 && /response_format|json|schema|structured/i.test(e.message)) {
      r = await chat(body(false), opts.signal);
    } else throw e;
  }
  const data = parseLoose<T>(r.text);
  if (!data || typeof data !== 'object') throw new Error(`The model did not return valid JSON: ${r.text.slice(0, 160)}`);
  return { data, usage: r.usage, ms: performance.now() - t0 };
}

const str = { type: 'string' } as const;
const obj = (properties: Record<string, object>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const arr = (items: object) => ({ type: 'array', items });

export const schemas = {
  interpret: obj({
    language: str,
    transcript: str,
    transliteration: str,
    translation: str,
    needs_reply: { type: 'boolean' },
    suggestions: arr(obj({ text: str, transliteration: str, meaning: str })),
  }),
  translateMine: obj({ transcript: str, translation: str, transliteration: str }),
  tutor: obj({
    heard: str,
    pronunciation: str,
    corrections: arr(obj({ original: str, corrected: str, explanation: str })),
    reply: str,
    transliteration: str,
    translation: str,
    new_words: arr(obj({ word: str, transliteration: str, meaning: str })),
  }),
  sentence: obj({ sentence: str, transliteration: str, translation: str }),
  pronunciation: obj({
    heard: str,
    score: { type: 'number' },
    words: arr(obj({ word: str, score: { type: 'number' }, tip: str })),
    summary: str,
  }),
  accentSet: obj({ items: arr(obj({ text: str, ipa: str, focus: str, tip: str })) }),
  accentEval: obj({
    heard: str,
    overall: { type: 'number' },
    accent_match: { type: 'number' },
    words: arr(obj({ word: str, score: { type: 'number' }, issue: str, tip: str })),
    features: arr(obj({ feature: str, status: { type: 'string', enum: ['good', 'close', 'off'] }, note: str })),
    summary: str,
    next_focus: str,
  }),
};

export interface Interpretation {
  language: string;
  transcript: string;
  transliteration: string;
  translation: string;
  needs_reply: boolean;
  suggestions: { text: string; transliteration: string; meaning: string }[];
}

export interface TutorReply {
  heard: string;
  pronunciation: string;
  corrections: { original: string; corrected: string; explanation: string }[];
  reply: string;
  transliteration: string;
  translation: string;
  new_words: { word: string; transliteration: string; meaning: string }[];
}

export interface PronunciationResult {
  heard: string;
  score: number;
  words: { word: string; score: number; tip: string }[];
  summary: string;
}

export interface AccentItem {
  text: string;
  ipa: string;
  focus: string;
  tip: string;
}

export interface AccentEval {
  heard: string;
  overall: number;
  accent_match: number;
  words: { word: string; score: number; issue: string; tip: string }[];
  features: { feature: string; status: 'good' | 'close' | 'off'; note: string }[];
  summary: string;
  next_focus: string;
}
