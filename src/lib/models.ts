import { create } from 'zustand';
import { fetchBenchmarks, fetchImageModels, fetchModels, fetchRankings } from './api';
import { kvGet, kvSet } from './db';
import { getSettings, type ModelRole, type ReasoningLevel, type VoiceSel } from './store';

export interface ModelInfo {
  id: string;
  slug: string;
  name: string;
  provider: string;
  providerName: string;
  description: string;
  created: number;
  context: number;
  maxOutput?: number;
  input: string[];
  output: string[];
  pricing: {
    prompt: number;
    completion: number;
    audio?: number;
    image?: number;
    imageOutput?: number;
    webSearch?: number;
    request?: number;
  };
  params: string[];
  voices: string[];
  reasoning?: { mandatory?: boolean; efforts?: string[]; defaultEffort?: string };
  free: boolean;
  dynamic: boolean;
  expiration?: string | null;
}

export interface Stats {
  weekly: Record<string, number>;
  audio: Record<string, number>;
  imageOut: Record<string, number>;
  aa: Record<string, number>;
  arena: Record<string, Record<string, number>>;
}

interface CatalogState {
  models: ModelInfo[];
  byId: Map<string, ModelInfo>;
  imageParams: Record<string, Record<string, any>>;
  stats: Stats;
  loading: boolean;
  error: string | null;
  fetchedAt: number;
}

const emptyStats: Stats = { weekly: {}, audio: {}, imageOut: {}, aa: {}, arena: {} };

export const useCatalog = create<CatalogState>(() => ({
  models: [],
  byId: new Map(),
  imageParams: {},
  stats: emptyStats,
  loading: false,
  error: null,
  fetchedAt: 0,
}));

const n = (v: unknown) => (v == null || v === '' ? undefined : Number(v));

function normalize(m: any): ModelInfo {
  const p = m.pricing ?? {};
  const pricing = {
    prompt: n(p.prompt) ?? 0,
    completion: n(p.completion) ?? 0,
    audio: n(p.audio),
    image: n(p.image),
    imageOutput: n(p.image_output),
    webSearch: n(p.web_search),
    request: n(p.request),
  };
  const [providerName, ...rest] = String(m.name ?? m.id).split(':');
  const paid = Object.values(pricing).some((v) => (v ?? 0) > 0);
  return {
    id: m.id,
    slug: m.canonical_slug ?? m.id,
    name: rest.length ? rest.join(':').trim() : providerName,
    provider: m.id.split('/')[0],
    providerName: rest.length ? providerName.trim() : m.id.split('/')[0],
    description: m.description ?? '',
    created: m.created ?? 0,
    context: m.context_length ?? 0,
    maxOutput: m.top_provider?.max_completion_tokens ?? undefined,
    input: m.architecture?.input_modalities ?? ['text'],
    output: m.architecture?.output_modalities ?? ['text'],
    pricing,
    params: m.supported_parameters ?? [],
    voices: (m.supported_voices ?? []).map((v: any) => (typeof v === 'string' ? v : (v.id ?? v.name))),
    reasoning: m.reasoning
      ? { mandatory: m.reasoning.mandatory, efforts: m.reasoning.supported_efforts, defaultEffort: m.reasoning.default_effort }
      : undefined,
    free: m.id.endsWith(':free') || (!paid && pricing.prompt >= 0),
    dynamic: pricing.prompt < 0,
    expiration: m.expiration_date,
  };
}

function latest(rows: { date: string; model_permaslug: string; total_tokens: string }[]) {
  const out: Record<string, number> = {};
  if (!rows.length) return out;
  const d = rows.reduce((a, r) => (r.date > a ? r.date : a), rows[0].date);
  for (const r of rows) if (r.date === d && r.model_permaslug !== 'other') out[r.model_permaslug] = Number(r.total_tokens);
  return out;
}

function setModels(raw: any[], imageRaw: any[], fetchedAt: number) {
  const models = raw.filter((m) => !String(m.id).endsWith(':batch')).map(normalize);
  const imageParams: Record<string, Record<string, any>> = {};
  for (const m of imageRaw) imageParams[m.id] = m.supported_parameters ?? {};
  useCatalog.setState({ models, byId: new Map(models.map((m) => [m.id, m])), imageParams, fetchedAt });
}

const HOUR = 3600_000;
let inflight: Promise<void> | null = null;

export function loadCatalog(force = false) {
  inflight ??= (async () => {
    useCatalog.setState({ loading: true, error: null });
    try {
      const cached = await kvGet<{ raw: any[]; imageRaw: any[] }>('catalog');
      if (cached && !useCatalog.getState().models.length) setModels(cached.value.raw, cached.value.imageRaw, cached.updatedAt);
      const st = await kvGet<Stats>('stats');
      if (st) useCatalog.setState({ stats: st.value });

      if (force || !cached || Date.now() - cached.updatedAt > 6 * HOUR) {
        const [m, im] = await Promise.all([fetchModels(), fetchImageModels().catch(() => ({ data: [] }))]);
        setModels(m.data, im.data, Date.now());
        await kvSet('catalog', { raw: m.data, imageRaw: im.data });
      }
      if (getSettings().apiKey && (force || !st || Date.now() - st.updatedAt > 12 * HOUR)) {
        const stats = await loadStats();
        useCatalog.setState({ stats });
        await kvSet('stats', stats);
      }
    } catch (e) {
      useCatalog.setState({ error: (e as Error).message });
    } finally {
      useCatalog.setState({ loading: false });
      inflight = null;
    }
  })();
  return inflight;
}

async function loadStats(): Promise<Stats> {
  const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
  const empty = { data: [] as any[] };
  const [w, a, i, aa, da] = await Promise.all([
    safe(fetchRankings('period=week'), empty),
    safe(fetchRankings('period=week&modality=audio'), empty),
    safe(fetchRankings('period=week&modality=image_output'), empty),
    safe(fetchBenchmarks('artificial-analysis'), empty),
    safe(fetchBenchmarks('design-arena'), empty),
  ]);
  const aaMap: Record<string, number> = {};
  for (const r of aa.data) if (r.intelligence_index != null) aaMap[r.model_permaslug] = Math.max(aaMap[r.model_permaslug] ?? 0, r.intelligence_index);
  const arena: Record<string, Record<string, number>> = {};
  for (const r of da.data) {
    if (r.elo == null) continue;
    const cur = (arena[r.model_permaslug] ??= {});
    cur[r.category] = Math.max(cur[r.category] ?? 0, r.elo);
  }
  return { weekly: latest(w.data), audio: latest(a.data), imageOut: latest(i.data), aa: aaMap, arena };
}

export const roleFilter: Record<ModelRole, (m: ModelInfo) => boolean> = {
  chat: (m) => m.output.includes('text'),
  listen: (m) => m.input.includes('audio') && m.output.includes('text'),
  stt: (m) => m.output.includes('transcription'),
  tts: (m) => m.output.includes('speech'),
  image: (m) => m.output.includes('image'),
};

export const roleLabel: Record<ModelRole, string> = {
  chat: 'Chat model',
  listen: 'Listening model (audio in)',
  stt: 'Transcription model',
  tts: 'Voice model',
  image: 'Image model',
};

export function popularity(m: ModelInfo, role: ModelRole, s: Stats): number {
  const pick = (map: Record<string, number>) => map[m.slug] ?? map[m.id] ?? 0;
  if (role === 'listen') return pick(s.audio) || pick(s.weekly) / 10;
  if (role === 'image') return pick(s.imageOut) || (arenaScore(m, s, 'image') ?? 0) * 1e3;
  if (role === 'tts') return (arenaScore(m, s, 'text-to-speech') ?? 0) * 1e6 + (arenaScore(m, s, 'audiorealism') ?? 0) * 1e3;
  return pick(s.weekly);
}

export function arenaScore(m: ModelInfo, s: Stats, cat: string): number | undefined {
  return (s.arena[m.slug] ?? s.arena[m.id])?.[cat];
}

export function intelligence(m: ModelInfo, s: Stats): number | undefined {
  return s.aa[m.slug] ?? s.aa[m.id];
}

export function weeklyTokens(m: ModelInfo, s: Stats): number {
  return s.weekly[m.slug] ?? s.weekly[m.id] ?? 0;
}

export type AttachKind = 'image' | 'audio' | 'file' | 'video';

export function accepts(m: ModelInfo | undefined, kind: AttachKind): boolean {
  if (!m) return kind === 'image';
  return m.input.includes(kind);
}

export function reasoningParam(m: ModelInfo | undefined, level: ReasoningLevel): Record<string, unknown> | undefined {
  if (!m || level === 'default' || !m.params.includes('reasoning')) return undefined;
  if (level === 'off') {
    if (m.reasoning?.mandatory) {
      const low = m.reasoning.efforts?.includes('minimal') ? 'minimal' : 'low';
      return { effort: low };
    }
    return { enabled: false };
  }
  if (m.reasoning?.efforts && !m.reasoning.efforts.includes(level)) return undefined;
  return { effort: level };
}

export function fastParams(id: string): Record<string, unknown> {
  const m = useCatalog.getState().byId.get(id);
  const r = reasoningParam(m, 'off');
  return r ? { reasoning: r } : {};
}

export function jsonFormat(id: string, name: string, schema: object): Record<string, unknown> {
  const m = useCatalog.getState().byId.get(id);
  if (!m || m.params.includes('structured_outputs')) {
    return { response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } } };
  }
  if (m.params.includes('response_format')) return { response_format: { type: 'json_object' } };
  return {};
}

const per1M = (v: number) => {
  const x = v * 1e6;
  if (x === 0) return '0';
  if (x < 0.01) return x.toFixed(4);
  if (x < 1) return x.toFixed(2);
  return x < 100 ? x.toFixed(2).replace(/\.00$/, '') : Math.round(x).toString();
};

export function priceLabel(m: ModelInfo): string {
  if (m.dynamic) return 'Varies';
  if (m.free) return 'Free';
  const p = m.pricing;
  if (m.output.includes('transcription')) {
    return p.completion === 0 ? `$${(p.prompt * 60).toFixed(4)}/min` : `$${per1M(p.prompt)} / $${per1M(p.completion)} per 1M`;
  }
  if (m.output.includes('speech')) {
    if (p.completion === 0) return `$${per1M(p.prompt)} / 1M chars`;
    if (p.prompt === 0) return `$${(p.completion).toFixed(4)}/sec`;
    return `$${per1M(p.prompt)} in · $${per1M(p.completion)} out per 1M`;
  }
  if (m.output.includes('image') && !m.output.includes('text')) {
    if (p.image) return `$${p.image.toFixed(3)}/image`;
    if (p.imageOutput) return `$${per1M(p.imageOutput)} / 1M img tokens`;
  }
  return `$${per1M(p.prompt)} / $${per1M(p.completion)}`;
}

export function formatTokens(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export function formatContext(v: number): string {
  if (!v) return '';
  if (v >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 ? 1 : 0)}M`;
  return `${Math.round(v / 1000)}K`;
}

export function formatCost(v?: number): string {
  if (v == null) return '';
  if (v === 0) return '$0';
  if (v < 0.0001) return '<$0.0001';
  if (v < 0.01) return `$${v.toFixed(4)}`;
  return `$${v.toFixed(3)}`;
}

export function shortName(id: string): string {
  const m = useCatalog.getState().byId.get(id);
  return m?.name ?? id.split('/').pop() ?? id;
}

export function regionVoice(locale: string): VoiceSel | null {
  const m = useCatalog.getState().byId.get('microsoft/mai-voice-2.1');
  const voice = m?.voices.find((v) => v.startsWith(locale + '-'));
  return voice ? { model: 'microsoft/mai-voice-2.1', voice } : null;
}
