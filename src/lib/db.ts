import Dexie, { type EntityTable } from 'dexie';
import type { Citation } from './api';
import type { ReasoningLevel, VoiceSel } from './store';

export interface Attachment {
  id: string;
  kind: 'image' | 'audio' | 'file' | 'video';
  name: string;
  mime: string;
  dataUrl: string;
  size: number;
  transcript?: string;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  system: string;
  voice?: VoiceSel;
  webSearch: boolean;
  reasoning: ReasoningLevel;
  temperature?: number;
  autoSpeak: boolean;
  imageModel?: string;
  pinned?: boolean;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  createdAt: number;
  text: string;
  attachments?: Attachment[];
  images?: string[];
  imagePrompt?: boolean;
  reasoning?: string;
  reasoningDetails?: unknown[];
  citations?: Citation[];
  model?: string;
  cost?: number;
  tokens?: { in?: number; out?: number; reasoning?: number };
  error?: string;
  status?: 'streaming' | 'done' | 'error';
}

export interface TtsEntry {
  key: string;
  blob: Blob;
  createdAt: number;
}

export interface KV {
  key: string;
  value: unknown;
  updatedAt: number;
}

export interface Suggestion {
  text: string;
  transliteration?: string;
  meaning?: string;
}

export interface Utterance {
  id: string;
  sessionId: string;
  createdAt: number;
  who: 'them' | 'me';
  status: 'pending' | 'done' | 'error';
  quick?: string;
  language?: string;
  transcript?: string;
  transliteration?: string;
  translation?: string;
  needsReply?: boolean;
  suggestions?: Suggestion[];
  chosen?: number;
  error?: string;
  ms?: number;
  cost?: number;
}

export interface TeacherProfile {
  id: string;
  language: string;
  variant: string;
  native: string;
  level: string;
  topic: string;
  translit: boolean;
  model?: string;
  voice?: VoiceSel;
  autoSpeak?: boolean;
  createdAt: number;
}

export interface TutorTurn {
  id: string;
  profileId: string;
  createdAt: number;
  role: 'user' | 'tutor';
  text: string;
  data?: Record<string, any>;
  audio?: Blob;
}

export interface Card {
  id: string;
  profileId: string;
  front: string;
  back: string;
  translit?: string;
  note?: string;
  due: number;
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  createdAt: number;
}

export interface AccentAttempt {
  id: string;
  accent: string;
  text: string;
  createdAt: number;
  score: number;
  result: Record<string, any>;
  audio?: Blob;
}

export const db = new Dexie('orc') as Dexie & {
  chats: EntityTable<Chat, 'id'>;
  messages: EntityTable<Message, 'id'>;
  tts: EntityTable<TtsEntry, 'key'>;
  kv: EntityTable<KV, 'key'>;
  utterances: EntityTable<Utterance, 'id'>;
  profiles: EntityTable<TeacherProfile, 'id'>;
  turns: EntityTable<TutorTurn, 'id'>;
  cards: EntityTable<Card, 'id'>;
  attempts: EntityTable<AccentAttempt, 'id'>;
};

db.version(1).stores({
  chats: 'id, updatedAt',
  messages: 'id, chatId, [chatId+createdAt]',
  tts: 'key, createdAt',
  kv: 'key',
  utterances: 'id, sessionId, [sessionId+createdAt]',
  profiles: 'id, createdAt',
  turns: 'id, [profileId+createdAt]',
  cards: 'id, profileId, [profileId+due]',
  attempts: 'id, accent, createdAt',
});

export const uid = () => crypto.randomUUID();

export async function kvGet<T>(key: string): Promise<{ value: T; updatedAt: number } | undefined> {
  const row = await db.kv.get(key);
  return row ? { value: row.value as T, updatedAt: row.updatedAt } : undefined;
}

export const kvSet = (key: string, value: unknown) => db.kv.put({ key, value, updatedAt: Date.now() });

export async function deleteChat(id: string) {
  await db.transaction('rw', db.chats, db.messages, async () => {
    await db.messages.where('chatId').equals(id).delete();
    await db.chats.delete(id);
  });
}

export async function exportAll(): Promise<Blob> {
  const [chats, messages, profiles, turns, cards, utterances] = await Promise.all([
    db.chats.toArray(),
    db.messages.toArray(),
    db.profiles.toArray(),
    db.turns.toArray(),
    db.cards.toArray(),
    db.utterances.toArray(),
  ]);
  const clean = turns.map(({ audio: _a, ...t }) => t);
  return new Blob([JSON.stringify({ version: 1, exportedAt: Date.now(), chats, messages, profiles, turns: clean, cards, utterances })], {
    type: 'application/json',
  });
}

export async function importAll(file: File) {
  const j = JSON.parse(await file.text());
  await db.transaction('rw', [db.chats, db.messages, db.profiles, db.turns, db.cards, db.utterances], async () => {
    if (j.chats) await db.chats.bulkPut(j.chats);
    if (j.messages) await db.messages.bulkPut(j.messages);
    if (j.profiles) await db.profiles.bulkPut(j.profiles);
    if (j.turns) await db.turns.bulkPut(j.turns);
    if (j.cards) await db.cards.bulkPut(j.cards);
    if (j.utterances) await db.utterances.bulkPut(j.utterances);
  });
}

export async function pruneTts(max = 400) {
  const n = await db.tts.count();
  if (n <= max) return;
  const old = await db.tts.orderBy('createdAt').limit(n - max).primaryKeys();
  await db.tts.bulkDelete(old);
}
