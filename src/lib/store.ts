import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface VoiceSel {
  model: string;
  voice?: string;
  style?: string;
  speed?: number;
  lang?: string;
}

export const BROWSER_VOICE = 'browser';

export type ReasoningLevel = 'default' | 'off' | 'low' | 'medium' | 'high';
export type SearchEngine = 'auto' | 'native' | 'exa' | 'parallel' | 'perplexity';
export type ModelRole = 'chat' | 'listen' | 'stt' | 'tts' | 'image';

export interface TranslatorSettings {
  theirLanguage: string;
  mode: 'hold' | 'always';
  listenModel: string;
  voice: VoiceSel;
  quickTranscript: boolean;
  prefetch: boolean;
  autoSpeakMine: boolean;
  sensitivity: number;
}

export interface AccentSettings {
  accentId: string;
  customAccent: string;
  listenModel: string;
  voice: VoiceSel | null;
  compareWithReference: boolean;
  machineCheck: boolean;
}

export interface Settings {
  apiKey: string;
  chatModel: string;
  listenModel: string;
  sttModel: string;
  imageModel: string;
  voice: VoiceSel;
  dictateWith: 'stt' | 'listen';
  searchEngine: SearchEngine;
  searchMaxResults: number;
  myLanguage: string;
  theme: 'system' | 'dark' | 'light';
  favorites: string[];
  recent: Partial<Record<ModelRole, string[]>>;
  translator: TranslatorSettings;
  accent: AccentSettings;
  activeProfileId: string | null;
}

interface Actions {
  set: (patch: Partial<Settings>) => void;
  setTranslator: (patch: Partial<TranslatorSettings>) => void;
  setAccent: (patch: Partial<AccentSettings>) => void;
  toggleFavorite: (id: string) => void;
  pushRecent: (role: ModelRole, id: string) => void;
}

export const DEFAULTS = {
  chatModel: 'google/gemini-3.8-flash',
  listenModel: 'google/gemini-3.8-flash',
  sttModel: 'openai/gpt-4o-mini-transcribe',
  imageModel: 'google/gemini-3.1-flash-image',
  voice: { model: 'google/gemini-3.8-flash-tts', voice: 'Kore' } as VoiceSel,
  fastVoice: { model: 'google/gemini-3.8-flash-lite-tts', voice: 'Kore' } as VoiceSel,
};

export const useSettings = create<Settings & Actions>()(
  persist(
    (set) => ({
      apiKey: '',
      chatModel: DEFAULTS.chatModel,
      listenModel: DEFAULTS.listenModel,
      sttModel: DEFAULTS.sttModel,
      imageModel: DEFAULTS.imageModel,
      voice: DEFAULTS.voice,
      dictateWith: 'stt',
      searchEngine: 'auto',
      searchMaxResults: 5,
      myLanguage: 'English',
      theme: 'system',
      favorites: [
        'google/gemini-3.8-flash',
        'anthropic/claude-opus-5.5',
        'anthropic/claude-sonnet-5.5',
        'openai/gpt-6.1-sol',
        'deepseek/deepseek-v4.1-flash',
      ],
      recent: {},
      translator: {
        theirLanguage: 'auto',
        mode: 'hold',
        listenModel: 'google/gemini-3.8-flash',
        voice: { model: 'google/gemini-3.8-flash-tts', voice: 'Kore' },
        quickTranscript: true,
        prefetch: true,
        autoSpeakMine: true,
        sensitivity: 0.5,
      },
      accent: {
        accentId: 'en-US',
        customAccent: '',
        listenModel: 'google/gemini-3.8-flash',
        voice: null,
        compareWithReference: true,
        machineCheck: true,
      },
      activeProfileId: null,
      set: (patch) => set(patch),
      setTranslator: (patch) => set((s) => ({ translator: { ...s.translator, ...patch } })),
      setAccent: (patch) => set((s) => ({ accent: { ...s.accent, ...patch } })),
      toggleFavorite: (id) =>
        set((s) => ({
          favorites: s.favorites.includes(id) ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites],
        })),
      pushRecent: (role, id) =>
        set((s) => ({
          recent: { ...s.recent, [role]: [id, ...(s.recent[role] ?? []).filter((r) => r !== id)].slice(0, 12) },
        })),
    }),
    { name: 'orc-settings', version: 1 },
  ),
);

export const getSettings = () => useSettings.getState();
