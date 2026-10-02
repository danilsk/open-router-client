import { audioPart, jsonCall, schemas, type PronunciationResult, type TutorReply } from './ai';
import type { ChatMessage, ContentPart } from './api';
import { db, uid, type Card, type TeacherProfile } from './db';
import { accepts, useCatalog } from './models';
import { getSettings, type VoiceSel } from './store';
import { transcribe } from './stt';

export const profileModel = (p: TeacherProfile) => p.model ?? getSettings().listenModel;
export const profileVoice = (p: TeacherProfile): VoiceSel => p.voice ?? getSettings().voice;

const who = (p: TeacherProfile) => `${p.language}${p.variant ? ` (${p.variant})` : ''}`;
const translitRule = (p: TeacherProfile) =>
  p.translit ? `Give a simple Latin-letter romanization in "transliteration" for any ${p.language} text in a non-Latin script.` : 'Set transliteration fields to "".';

function tutorSystem(p: TeacherProfile) {
  return `You are a warm, patient ${who(p)} tutor. The learner's native language is ${p.native} and their level is ${p.level} (CEFR).${p.topic ? ` Preferred topics: ${p.topic}.` : ''}
Hold a natural spoken conversation in ${p.language}. Keep each reply short (1–3 sentences), at the learner's level, and end with a question or prompt that keeps them talking.
For the learner's latest message:
- heard: if it was audio, write exactly what they said (original script); otherwise "".
- pronunciation: if it was audio, one or two short, specific tips about their pronunciation in ${p.native}; otherwise "".
- corrections: grammar, vocabulary or word-choice mistakes in their latest message, each with the original, the corrected version and a short explanation in ${p.native}. Empty if it was correct. Do not nitpick at A1–A2.
- reply: your next line in ${p.language}.
- translation: the reply in ${p.native}.
- new_words: up to 3 useful words or phrases from your reply, with meaning in ${p.native}.
${translitRule(p)}`;
}

export async function tutorTurn(p: TeacherProfile, input: { text?: string; audio?: Blob } | null) {
  const turns = await db.turns.where('[profileId+createdAt]').between([p.id, 0], [p.id, Infinity]).reverse().limit(24).toArray();
  const history: ChatMessage[] = turns
    .reverse()
    .map((t) => (t.role === 'user' ? { role: 'user' as const, content: t.text } : { role: 'assistant' as const, content: t.data?.reply ?? t.text }));
  const model = profileModel(p);
  let content: ContentPart[];
  let userText = input?.text ?? '';
  if (!input) content = [{ type: 'text', text: '(The learner just opened the app. Greet them and start a conversation with a simple question.)' }];
  else if (input.audio && accepts(useCatalog.getState().byId.get(model), 'audio')) content = [{ type: 'text', text: 'Learner (audio):' }, await audioPart(input.audio)];
  else if (input.audio) {
    userText = await transcribe(input.audio, { language: p.language });
    content = [{ type: 'text', text: userText }];
  } else content = [{ type: 'text', text: userText }];

  const userId = input ? uid() : null;
  if (userId) await db.turns.add({ id: userId, profileId: p.id, createdAt: Date.now(), role: 'user', text: userText || '🎤 …', audio: input?.audio });
  const r = await jsonCall<TutorReply>(model, 'tutor_reply', schemas.tutor, tutorSystem(p), [...history, { role: 'user', content }], { temperature: 0.7 });
  if (userId && r.data.heard) await db.turns.update(userId, { text: r.data.heard });
  const id = uid();
  await db.turns.add({ id, profileId: p.id, createdAt: Date.now(), role: 'tutor', text: r.data.reply, data: { ...r.data, cost: r.usage?.cost } });
  return { id, data: r.data };
}

export async function newSentence(p: TeacherProfile, kind: 'listen' | 'speak', avoid: string[]) {
  const purpose =
    kind === 'listen'
      ? 'a listening exercise: one natural sentence a native speaker might say in daily life'
      : `pronunciation practice: one short phrase that contains sounds that are hard for ${p.native} speakers`;
  const system = `You create ${who(p)} practice material for a ${p.level} learner whose native language is ${p.native}.${p.topic ? ` Topics they like: ${p.topic}.` : ''}
Create ${purpose}. Match the level. Give sentence (in ${p.language}), transliteration, and translation (in ${p.native}). ${translitRule(p)}`;
  const msg = avoid.length ? `Avoid repeating these: ${avoid.slice(-12).join(' | ')}` : 'Create one.';
  const r = await jsonCall<{ sentence: string; transliteration: string; translation: string }>(profileModel(p), 'sentence', schemas.sentence, system, [{ role: 'user', content: msg }], {
    temperature: 1,
  });
  return r.data;
}

export async function judgePronunciation(p: TeacherProfile, target: string, audio: Blob) {
  const system = `You are a ${who(p)} pronunciation coach. The learner (native ${p.native}, level ${p.level}) tried to say a phrase. Listen carefully to the audio.
- heard: what they actually said, in ${p.language} script.
- score: 0–100 overall intelligibility and accuracy compared with a native speaker.
- words: each word of the target phrase with a 0–100 score and a short tip in ${p.native} (empty tip if fine).
- summary: one or two encouraging, specific sentences in ${p.native} about what to improve.`;
  const r = await jsonCall<PronunciationResult>(profileModel(p), 'pronunciation', schemas.pronunciation, system, [
    { role: 'user', content: [{ type: 'text', text: `Target phrase: "${target}"` }, await audioPart(audio)] },
  ]);
  return r.data;
}

const DAY = 86400_000;

export function grade(card: Card, q: 0 | 3 | 4 | 5): Card {
  const c = { ...card };
  if (q < 3) {
    c.reps = 0;
    c.lapses++;
    c.interval = 0;
    c.due = Date.now() + 10 * 60_000;
  } else {
    c.reps++;
    c.interval = c.reps === 1 ? 1 : c.reps === 2 ? 3 : Math.round(Math.max(1, c.interval) * c.ease * (q === 5 ? 1.3 : q === 3 ? 0.8 : 1));
    c.ease = Math.max(1.3, c.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    c.due = Date.now() + c.interval * DAY;
  }
  return c;
}

export async function addCard(profileId: string, front: string, back: string, translit?: string) {
  const exists = await db.cards.where('profileId').equals(profileId).and((c) => c.front.trim() === front.trim()).count();
  if (exists) return false;
  await db.cards.add({ id: uid(), profileId, front, back, translit: translit || undefined, due: Date.now(), interval: 0, ease: 2.5, reps: 0, lapses: 0, createdAt: Date.now() });
  return true;
}
