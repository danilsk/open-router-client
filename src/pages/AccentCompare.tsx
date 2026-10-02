import clsx from 'clsx';
import { Loader2, Play, Plus, Snail, Sparkles, Square } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MicButton } from '../components/MicButton';
import { SpeakButton } from '../components/SpeakButton';
import { voiceLabel } from '../components/VoicePicker';
import { Badge, Button, Card, Empty, inputCls } from '../components/ui';
import { closestAccent, compareAccents, referenceVoice, suggestContrast } from '../lib/accent';
import type { AccentComparison, ClosestAccent } from '../lib/ai';
import { ACCENTS, type Accent } from '../lib/languages';
import { formatCost, useCatalog } from '../lib/models';
import { BROWSER_VOICE } from '../lib/store';
import { sleep } from '../lib/text';
import { toastError } from '../lib/toast';
import { speak, stopSpeaking } from '../lib/tts';

const LANGS = [...new Set(ACCENTS.map((a) => a.language))];
const SAMPLE: Record<string, string> = {
  English: "I can't find the water bottle. I think I left it in the car around half past four.",
  Spanish: 'Ayer vi a mi hermano en la calle y llovía muchísimo.',
  French: "Je voudrais un croissant et un café au lait, s'il vous plaît.",
  Portuguese: 'Eu tenho que sair cedo porque o trem parte às seis da tarde.',
  German: 'Ich möchte heute Abend mit meinen Freunden ins Kino gehen.',
  Italian: "Vorrei un bicchiere d'acqua e una pizza margherita, per favore.",
};

export function AccentCompare() {
  const [language, setLanguage] = useState('English');
  const [custom, setCustom] = useState<Accent[]>([]);
  const [newAccent, setNewAccent] = useState('');
  const options = useMemo(() => [...ACCENTS, ...custom].filter((a) => a.language === language), [language, custom]);
  const [selected, setSelected] = useState<string[]>(['en-US', 'en-GB']);
  const [text, setText] = useState(SAMPLE.English);
  const [result, setResult] = useState<(AccentComparison & { cost?: number }) | null>(null);
  const [closest, setClosest] = useState<ClosestAccent | null>(null);
  const [busy, setBusy] = useState<'suggest' | 'compare' | 'closest' | null>(null);
  const [playingAll, setPlayingAll] = useState(false);
  const allToken = useRef(0);
  const byId = useCatalog((s) => s.byId);

  const chosen = selected.map((id) => options.find((a) => a.id === id)).filter(Boolean) as Accent[];

  useEffect(() => {
    setResult(null);
    setClosest(null);
  }, [text, selected.join()]);

  const pickLanguage = (l: string) => {
    setLanguage(l);
    setSelected([...ACCENTS, ...custom].filter((a) => a.language === l).slice(0, 2).map((a) => a.id));
    setText(SAMPLE[l] ?? '');
  };

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 4 ? s : [...s, id]));

  const addCustom = () => {
    const label = newAccent.trim();
    if (!label) return;
    const a: Accent = { id: `custom:${language}:${label}`, label, language, flag: '🎯', features: 'the typical sounds, rhythm and intonation of this accent' };
    setCustom((c) => [...c.filter((x) => x.id !== a.id), a]);
    setSelected((s) => (s.length >= 4 ? s : [...s, a.id]));
    setNewAccent('');
  };

  const run = async (what: 'suggest' | 'compare') => {
    setBusy(what);
    try {
      if (what === 'suggest') setText(await suggestContrast(language, chosen));
      else setResult(await compareAccents(language, chosen, text));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const playAll = async () => {
    if (playingAll) {
      allToken.current++;
      stopSpeaking();
      setPlayingAll(false);
      return;
    }
    const my = ++allToken.current;
    setPlayingAll(true);
    for (const a of chosen) {
      if (my !== allToken.current) return;
      await speak(text, referenceVoice(a, true), `cmp:${a.id}`);
      await sleep(350);
    }
    if (my === allToken.current) setPlayingAll(false);
  };

  const judge = async (blob: Blob) => {
    setBusy('closest');
    try {
      setClosest(await closestAccent(chosen, text, blob));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };

  const voiceName = (a: Accent) => {
    const v = referenceVoice(a, true);
    if (v.model === BROWSER_VOICE) return 'Device voice';
    const m = byId.get(v.model)?.name ?? v.model.split('/').pop();
    return `${m}${v.voice ? ` · ${voiceLabel(v.voice).name}` : ''}`;
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 pb-10">
        <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => pickLanguage(l)}
              className={clsx('shrink-0 rounded-full border px-3 py-1.5 text-[13px]', l === language ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line text-muted hover:text-fg')}
            >
              {l}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1.5 text-[13px] font-medium">Accents to compare (2–4)</div>
          <div className="flex flex-wrap gap-1.5">
            {options.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className={clsx(
                  'rounded-xl border px-2.5 py-1.5 text-[13px] transition',
                  selected.includes(a.id) ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line hover:bg-surface-2',
                )}
              >
                {a.flag} {a.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={newAccent}
              onChange={(e) => setNewAccent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && addCustom()}
              placeholder={`Add another ${language} accent (e.g. ${language === 'English' ? 'New Zealand' : 'regional'})`}
              className={clsx(inputCls, 'h-9 py-1.5 text-[13px]')}
            />
            <Button size="sm" variant="subtle" icon={<Plus className="size-3.5" />} disabled={!newAccent.trim()} onClick={addCustom} className="h-9">
              Add
            </Button>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium">Sentence</span>
            <Button size="sm" variant="ghost" loading={busy === 'suggest'} disabled={chosen.length < 2} icon={<Sparkles className="size-3.5" />} onClick={() => run('suggest')}>
              Suggest one that shows the differences
            </Button>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className={clsx(inputCls, 'resize-none text-[15px]')} />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" disabled={chosen.length < 1 || !text.trim()} icon={playingAll ? <Square className="size-3.5" fill="currentColor" /> : <Play className="size-4" />} onClick={playAll}>
            {playingAll ? 'Stop' : 'Play all in turn'}
          </Button>
          <Button variant="primary" className="flex-1" loading={busy === 'compare'} disabled={chosen.length < 2 || !text.trim()} onClick={() => run('compare')}>
            Explain the differences
          </Button>
        </div>

        {chosen.length < 2 ? (
          <Empty title="Pick at least two accents">Choose accents of the same language to hear and compare them side by side.</Empty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {chosen.map((a) => {
              const info = result?.accents.find((x) => x.name.toLowerCase() === a.label.toLowerCase()) ?? result?.accents[chosen.indexOf(a)];
              const v = referenceVoice(a, true);
              return (
                <Card key={a.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{a.flag}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{a.label}</div>
                      <div className="truncate text-[11px] text-muted">{voiceName(a)}</div>
                    </div>
                    <SpeakButton text={text} voice={v} id={`cmp:${a.id}`} size="md" label={`Play ${a.label}`} />
                    <button type="button" aria-label="Play slowly" onClick={() => speak(text, v, `cmp:${a.id}`, { slow: true })} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
                      <Snail className="size-4" />
                    </button>
                  </div>
                  {info?.ipa && <div className="font-mono text-[13px] leading-relaxed text-muted">/{info.ipa.replace(/^\/|\/$/g, '')}/</div>}
                  {info?.notes && <div className="text-sm">{info.notes}</div>}
                  {closest && (
                    <div className="flex items-center gap-2 text-xs">
                      <div className="h-1.5 flex-1 rounded-full bg-surface-3">
                        <div className="h-full rounded-full bg-teal" style={{ width: `${closest.scores.find((s) => s.name.toLowerCase() === a.label.toLowerCase())?.score ?? 0}%` }} />
                      </div>
                      <span className="tabular-nums text-muted">{Math.round(closest.scores.find((s) => s.name.toLowerCase() === a.label.toLowerCase())?.score ?? 0)}% you</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {result && (
          <Card className="space-y-4">
            <div className="text-sm font-semibold">What's different</div>
            {result.differences.map((d, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-medium">{d.feature}</span>
                  {d.words && <span className="text-xs text-muted">in “{d.words}”</span>}
                </div>
                <div className="space-y-1">
                  {d.by_accent.map((b, j) => {
                    const a = chosen.find((x) => x.label.toLowerCase() === b.name.toLowerCase());
                    return (
                      <div key={j} className="flex gap-2 text-sm">
                        <Badge className="shrink-0 self-start whitespace-nowrap">
                          {a?.flag} {b.name}
                        </Badge>
                        <span className="text-fg/90">{b.description}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {result.summary && <div className="rounded-xl bg-accent/10 px-3 py-2 text-sm">{result.summary}</div>}
            {result.cost != null && <div className="text-right text-[11px] text-muted">{formatCost(result.cost)}</div>}
          </Card>
        )}

        {chosen.length >= 2 && (
          <Card className="flex items-center gap-4">
            {busy === 'closest' ? <Loader2 className="size-10 animate-spin text-accent" /> : <MicButton size="lg" label="Record yourself" onAudio={judge} />}
            <div className="min-w-0 flex-1 text-sm">
              {closest ? (
                <>
                  <div className="font-semibold">
                    Closest to {chosen.find((a) => a.label.toLowerCase() === closest.closest.toLowerCase())?.flag} {closest.closest}
                  </div>
                  <div className="mt-0.5 text-muted">{closest.evidence}</div>
                </>
              ) : (
                <>
                  <div className="font-medium">Which one do you sound like?</div>
                  <div className="text-muted">Read the sentence aloud and find out which accent you're closest to.</div>
                </>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
