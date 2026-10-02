import { audioPart, jsonCall, schemas, type AccentComparison, type AccentEval, type AccentItem, type ClosestAccent } from './ai';
import type { ContentPart } from './api';
import { findAccent, type Accent } from './languages';
import { regionVoice } from './models';
import { DEFAULTS, getSettings, type VoiceSel } from './store';
import { transcribe } from './stt';
import { synth } from './tts';

export function currentAccent(): Accent {
  const a = getSettings().accent;
  if (a.accentId === 'custom' && a.customAccent.trim()) {
    const label = a.customAccent.trim();
    const language = /spanish|español/i.test(label) ? 'Spanish' : /french/i.test(label) ? 'French' : /german/i.test(label) ? 'German' : /portug/i.test(label) ? 'Portuguese' : 'English';
    return { id: 'custom', label, language, flag: '🎯', features: 'the most characteristic sounds, rhythm and intonation of this accent' };
  }
  return findAccent(a.accentId) ?? findAccent('en-US')!;
}

export function referenceVoice(acc: Accent, ignoreOverride = false): VoiceSel {
  const o = getSettings().accent.voice;
  if (o && !ignoreOverride) return o;
  if (acc.locale) {
    const v = regionVoice(acc.locale);
    if (v) return v;
  }
  return { ...DEFAULTS.voice, style: `Native ${acc.label} accent${acc.language === 'English' ? '' : ` of ${acc.language}`}, natural pace` };
}

export async function makeSet(acc: Accent, kind: 'sentences' | 'pairs', avoid: string[]): Promise<AccentItem[]> {
  const my = getSettings().myLanguage;
  const what =
    kind === 'pairs'
      ? 'minimal pairs or short word groups (e.g. "ship / sheep", "cot / caught") that train the sounds which most distinguish this accent'
      : 'short, natural everyday sentences (6–12 words), each packed with one characteristic feature of this accent';
  const system = `You are an expert accent coach for the ${acc.label} accent of ${acc.language}. Its key features include: ${acc.features}.
Create 6 practice items: ${what}. For each item give: text, ipa (broad IPA transcription as pronounced in this accent), focus (the feature being trained, 2–5 words), tip (one concrete articulation tip in ${my}: tongue, lips, vowel length, stress or intonation).`;
  const r = await jsonCall<{ items: AccentItem[] }>(getSettings().accent.listenModel, 'accent_set', schemas.accentSet, system, [
    { role: 'user', content: avoid.length ? `Do not repeat: ${avoid.slice(-18).join(' | ')}` : 'Create the set.' },
  ], { temperature: 1 });
  return (r.data.items ?? []).filter((i) => i?.text);
}

export async function evaluate(acc: Accent, item: Pick<AccentItem, 'text' | 'focus'>, mine: Blob) {
  const s = getSettings();
  const a = s.accent;
  const ref = a.compareWithReference ? await synth(item.text, referenceVoice(acc)).catch(() => null) : null;
  const system = `You are an expert phonetician and accent coach for the ${acc.label} accent of ${acc.language}. Key features: ${acc.features}.
Judge only pronunciation and accent, not grammar. Be honest but encouraging. Write notes and tips in ${s.myLanguage}.
- heard: what the learner actually said.
- overall: 0–100 for clarity and accuracy of the sounds.
- accent_match: 0–100 for how much it sounds like a native ${acc.label} speaker.
- words: every word of the target with a 0–100 score; for weak words name the issue (e.g. "R not rhotic", "vowel too short") and give a tip.
- features: 2–5 accent features relevant to this phrase (e.g. "rhotic R", "flap T", "TRAP–BATH vowel"), each rated good / close / off with a short note.
- summary: 1–2 sentences.
- next_focus: the single most useful thing to practise next.`;
  const content: ContentPart[] = ref
    ? [
        { type: 'text', text: `Target: "${item.text}"${item.focus ? ` (focus: ${item.focus})` : ''}. The first audio is a reference speaker with the target accent. The second audio is the learner imitating it. Compare them.` },
        await audioPart(ref),
        await audioPart(mine),
      ]
    : [{ type: 'text', text: `Target: "${item.text}"${item.focus ? ` (focus: ${item.focus})` : ''}. This is the learner's attempt.` }, await audioPart(mine)];
  const [judged, machine] = await Promise.all([
    jsonCall<AccentEval>(a.listenModel, 'accent_eval', schemas.accentEval, system, [{ role: 'user', content }]),
    a.machineCheck ? transcribe(mine, { model: s.sttModel, language: acc.language }).catch(() => null) : Promise.resolve(null),
  ]);
  return { ...judged.data, machine, cost: judged.usage?.cost };
}

const describe = (list: Accent[]) => list.map((a) => `- ${a.label}: ${a.features}`).join('\n');

export async function suggestContrast(language: string, list: Accent[]): Promise<string> {
  const r = await jsonCall<{ sentence: string; why: string }>(
    getSettings().accent.listenModel,
    'accent_sentence',
    schemas.accentSentence,
    `You are a phonetician. Write one natural, everyday ${language} sentence (8–14 words) whose pronunciation differs as much as possible between these accents:\n${describe(list)}`,
    [{ role: 'user', content: 'Write the sentence.' }],
    { temperature: 1 },
  );
  return r.data.sentence;
}

export async function compareAccents(language: string, list: Accent[], text: string) {
  const my = getSettings().myLanguage;
  const r = await jsonCall<AccentComparison>(
    getSettings().accent.listenModel,
    'accent_compare',
    schemas.accentCompare,
    `You are a phonetician comparing accents of ${language}. Accents:\n${describe(list)}
For the sentence the user gives:
- accents: one entry per accent, in the same order, using exactly the accent names above. ipa = broad IPA of the whole sentence as said in that accent; notes = one short line on its overall sound.
- differences: 3–6 concrete pronunciation differences that show up in this sentence (sounds, vowels, R, T, stress, intonation). For each: feature name, the words where you hear it, and for every accent a short description of how it is said there.
- summary: two sentences on how to tell these accents apart.
Write notes and descriptions in ${my}.`,
    [{ role: 'user', content: text }],
  );
  return { ...r.data, cost: r.usage?.cost };
}

export async function closestAccent(list: Accent[], text: string, audio: Blob) {
  const my = getSettings().myLanguage;
  const r = await jsonCall<ClosestAccent>(
    getSettings().accent.listenModel,
    'closest_accent',
    schemas.closest,
    `You are a phonetician. The speaker read the sentence "${text}". Decide which of these accents their pronunciation is closest to:\n${describe(list)}
closest = the accent name exactly as written above; scores = 0–100 similarity for every accent; evidence = 1–2 sentences in ${my} naming the sounds that decided it.`,
    [{ role: 'user', content: [{ type: 'text', text: 'Here is the recording.' }, await audioPart(audio)] }],
  );
  return r.data;
}
