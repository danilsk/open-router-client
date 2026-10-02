import { audioPart, jsonCall, schemas, type Interpretation } from './ai';
import type { ChatMessage, ContentPart } from './api';
import { decodeMono } from './audio';
import { db, uid, type Utterance } from './db';
import { isNonLatin } from './languages';
import { getSettings } from './store';
import { transcribe } from './stt';
import { toastError } from './toast';
import { prefetch, speak } from './tts';

export const clips = new Map<string, Blob>();

async function context(sessionId: string): Promise<string> {
  const rows = await db.utterances.where('[sessionId+createdAt]').between([sessionId, 0], [sessionId, Infinity]).reverse().limit(8).toArray();
  const lines = rows
    .reverse()
    .filter((u) => u.status === 'done')
    .map((u) => (u.who === 'them' ? `Them (${u.language}): ${u.transcript} — "${u.translation}"` : `Me: "${u.translation}" (${u.transcript})`));
  return lines.length ? `Conversation so far (oldest first):\n${lines.join('\n')}\n\n` : '';
}

export async function lastTheirLanguage(sessionId: string): Promise<string | undefined> {
  const rows = await db.utterances.where('[sessionId+createdAt]').between([sessionId, 0], [sessionId, Infinity]).reverse().toArray();
  return rows.find((u) => u.who === 'them' && u.language)?.language;
}

function interpretPrompt(my: string, their: string) {
  const hint = their === 'auto' ? '' : ` The other person most likely speaks ${their}.`;
  return `You are a live interpreter helping a user who speaks ${my}. You receive short audio clips of people talking to or near the user.${hint}
For each clip:
- language: the spoken language, as an English name (e.g. "Georgian").
- If the clip contains no clear human speech (silence, noise, beeps, tones, music, or words too unclear to understand), return "" for language, transcript and translation and an empty suggestions list. Never guess or invent words.
- transcript: the exact words, in the original script.
- transliteration: a simple Latin-letter romanization when the language uses a non-Latin script; otherwise "".
- translation: a natural translation into ${my}.
- needs_reply: true when the speaker addresses the listener in a way that invites a response (greeting, question, request, offer, thanks, farewell, small talk).
- suggestions: when needs_reply is true, 3 short, natural, polite replies the user could say back, in the speaker's language (varied: e.g. a direct answer, a friendly one, and a clarifying question). Each has text (original script), transliteration (or "") and meaning (in ${my}). Otherwise an empty list.
Use the conversation so far to resolve context, names and pronouns.`;
}

async function isSilent(blob: Blob) {
  try {
    const x = await decodeMono(blob, 8000);
    let sum = 0;
    for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
    return Math.sqrt(sum / Math.max(1, x.length)) < 0.004;
  } catch {
    return false;
  }
}

export async function processThem(sessionId: string, blob: Blob) {
  if (await isSilent(blob)) return;
  const s = getSettings();
  const t = s.translator;
  const id = uid();
  clips.set(id, blob);
  const base: Utterance = { id, sessionId, createdAt: Date.now(), who: 'them', status: 'pending' };
  await db.utterances.add(base);
  if (t.quickTranscript) {
    transcribe(blob, { model: s.sttModel, language: t.theirLanguage === 'auto' ? undefined : t.theirLanguage })
      .then((quick) => db.utterances.where('id').equals(id).and((u) => u.status === 'pending').modify({ quick }))
      .catch(() => {});
  }
  try {
    const ctx = await context(sessionId);
    const content: ContentPart[] = [{ type: 'text', text: `${ctx}Interpret this new clip.` }, await audioPart(blob)];
    const r = await jsonCall<Interpretation>(t.listenModel, 'interpretation', schemas.interpret, interpretPrompt(s.myLanguage, t.theirLanguage), [
      { role: 'user', content },
    ]);
    const d = r.data;
    if (!d.transcript?.trim()) {
      await db.utterances.delete(id);
      clips.delete(id);
      return;
    }
    const suggestions = d.needs_reply ? (d.suggestions ?? []).filter((x) => x?.text) : [];
    await db.utterances.update(id, {
      status: 'done',
      language: d.language,
      transcript: d.transcript,
      transliteration: d.transliteration || undefined,
      translation: d.translation,
      needsReply: d.needs_reply,
      suggestions,
      ms: Math.round(r.ms),
      cost: r.usage?.cost,
    });
    if (t.prefetch) suggestions.forEach((x) => prefetch(x.text, t.voice));
  } catch (e) {
    await db.utterances.update(id, { status: 'error', error: (e as Error).message });
  }
}

export async function retry(u: Utterance) {
  const blob = clips.get(u.id);
  if (!blob) return toastError(new Error('The original audio is no longer available.'));
  await db.utterances.delete(u.id);
  clips.delete(u.id);
  await processThem(u.sessionId, blob);
}

export async function processMine(sessionId: string, input: Blob | string) {
  const s = getSettings();
  const t = s.translator;
  const target = t.theirLanguage !== 'auto' ? t.theirLanguage : await lastTheirLanguage(sessionId);
  if (!target) return toastError(new Error("Pick the other person's language first (or let them speak once)."));
  const id = uid();
  await db.utterances.add({ id, sessionId, createdAt: Date.now(), who: 'me', status: 'pending', language: target });
  try {
    const ctx = await context(sessionId);
    const translit = isNonLatin(target) ? `Also give a Latin-letter romanization of the ${target} text.` : 'transliteration must be "".';
    const system = `You are an interpreter. The user speaks ${s.myLanguage} and is talking to someone who speaks ${target}. Translate what the user says into natural, polite, spoken ${target} that fits the conversation. transcript = what the user said (original words), translation = the ${target} version. ${translit}`;
    const content: ContentPart[] =
      typeof input === 'string'
        ? [{ type: 'text', text: `${ctx}The user says: ${input}` }]
        : [{ type: 'text', text: `${ctx}Translate what the user says in this clip.` }, await audioPart(input)];
    const messages: ChatMessage[] = [{ role: 'user', content }];
    const model = typeof input === 'string' ? s.chatModel : t.listenModel;
    const r = await jsonCall<{ transcript: string; translation: string; transliteration: string }>(model, 'translation', schemas.translateMine, system, messages);
    await db.utterances.update(id, {
      status: 'done',
      transcript: r.data.transcript || (typeof input === 'string' ? input : ''),
      translation: r.data.translation,
      transliteration: r.data.transliteration || undefined,
      ms: Math.round(r.ms),
      cost: r.usage?.cost,
    });
    if (t.autoSpeakMine && r.data.translation) speak(r.data.translation, t.voice, `utt:${id}`);
  } catch (e) {
    await db.utterances.update(id, { status: 'error', error: (e as Error).message });
  }
}

export async function chooseSuggestion(u: Utterance, index: number) {
  const sug = u.suggestions?.[index];
  if (!sug) return;
  const t = getSettings().translator;
  speak(sug.text, t.voice, `sug:${u.id}:${index}`);
  if (u.chosen === index) return;
  await db.utterances.update(u.id, { chosen: index });
  await db.utterances.add({
    id: uid(),
    sessionId: u.sessionId,
    createdAt: Date.now(),
    who: 'me',
    status: 'done',
    language: u.language,
    transcript: sug.meaning ?? '',
    translation: sug.text,
    transliteration: sug.transliteration || undefined,
  });
}
