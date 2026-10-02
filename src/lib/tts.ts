import { create } from 'zustand';
import { speech } from './api';
import { player } from './audio';
import { db, pruneTts } from './db';
import { BROWSER_VOICE, type VoiceSel } from './store';
import { chunkText, stripForSpeech } from './text';
import { toastError } from './toast';

interface SpeechState {
  loadingKey: string | null;
  playingKey: string | null;
}

export const useSpeech = create<SpeechState>(() => ({ loadingKey: null, playingKey: null }));
player.subscribe((key) => useSpeech.setState({ playingKey: key }));

async function hash(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function providerFor(v: VoiceSel) {
  if (!v.style) return undefined;
  if (v.model.startsWith('google/')) return { options: { 'google-ai-studio': { speech_metadata: { style: v.style } } } };
  if (v.model.startsWith('openai/')) return { options: { openai: { instructions: v.style } } };
  return undefined;
}

const inflight = new Map<string, Promise<Blob>>();

export async function synth(text: string, v: VoiceSel, signal?: AbortSignal): Promise<Blob> {
  const key = await hash(JSON.stringify([v.model, v.voice ?? '', v.style ?? '', text]));
  const hit = await db.tts.get(key);
  if (hit) return hit.blob;
  const running = inflight.get(key);
  if (running) return running;
  const p = speech({ model: v.model, input: text, voice: v.voice, provider: providerFor(v) }, signal)
    .then(async (blob) => {
      await db.tts.put({ key, blob, createdAt: Date.now() });
      void pruneTts();
      return blob;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

let token = 0;

export function stopSpeaking() {
  token++;
  player.stop();
  useSpeech.setState({ loadingKey: null });
}

export async function speak(text: string, v: VoiceSel, key = 'tts', opts: { slow?: boolean } = {}): Promise<void> {
  const my = ++token;
  player.stop();
  const clean = stripForSpeech(text);
  if (!clean) return;
  const rate = (v.speed ?? 1) * (opts.slow ? 0.75 : 1);
  if (v.model === BROWSER_VOICE) return browserSpeak(clean, v, key, rate, my);
  const parts = chunkText(clean);
  useSpeech.setState({ loadingKey: key });
  try {
    let next = synth(parts[0], v);
    for (let i = 0; i < parts.length; i++) {
      const blob = await next;
      if (my !== token) return;
      if (i + 1 < parts.length) next = synth(parts[i + 1], v);
      useSpeech.setState({ loadingKey: null });
      await player.play(blob, key, rate);
      if (my !== token) return;
    }
  } catch (e) {
    if (my === token) toastError(e);
  } finally {
    if (my === token) useSpeech.setState({ loadingKey: null });
  }
}

export function prefetch(text: string, v: VoiceSel) {
  if (v.model === BROWSER_VOICE) return;
  const clean = stripForSpeech(text);
  if (clean) synth(chunkText(clean)[0], v).catch(() => {});
}

export function browserVoices(): SpeechSynthesisVoice[] {
  return typeof speechSynthesis === 'undefined' ? [] : speechSynthesis.getVoices();
}

function browserSpeak(text: string, v: VoiceSel, key: string, rate: number, my: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voices = browserVoices();
    const voice = voices.find((x) => x.name === v.voice) ?? (v.lang ? voices.find((x) => x.lang.startsWith(v.lang!)) : undefined);
    if (voice) u.voice = voice;
    if (v.lang) u.lang = v.lang;
    u.rate = rate;
    const done = () => {
      if (my === token) player.setKey(null);
      resolve();
    };
    u.onend = done;
    u.onerror = done;
    player.setKey(key);
    speechSynthesis.speak(u);
  });
}

export async function playBlob(blob: Blob, key: string, rate = 1) {
  token++;
  useSpeech.setState({ loadingKey: null });
  await player.play(blob, key, rate);
}
