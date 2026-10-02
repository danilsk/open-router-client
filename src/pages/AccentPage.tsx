import clsx from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { AudioWaveform, ChevronLeft, ChevronRight, Cpu, History, Loader2, Play, RefreshCw, Settings2, Snail, Sparkles, Target, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MicButton } from '../components/MicButton';
import { ModelButton } from '../components/ModelPicker';
import { SpeakButton } from '../components/SpeakButton';
import { VoiceButton } from '../components/VoicePicker';
import { Badge, Button, Card, Empty, Field, IconButton, PageHeader, ScoreRing, Segmented, Sheet, Toggle, inputCls } from '../components/ui';
import { currentAccent, evaluate, makeSet, referenceVoice } from '../lib/accent';
import { AccentCompare } from './AccentCompare';
import type { AccentEval, AccentItem } from '../lib/ai';
import { db, uid } from '../lib/db';
import { ACCENTS } from '../lib/languages';
import { formatCost } from '../lib/models';
import { useSettings } from '../lib/store';
import { diffWords, timeAgo } from '../lib/text';
import { toastError } from '../lib/toast';
import { playBlob, speak } from '../lib/tts';

type Result = AccentEval & { machine: string | null; cost?: number };

export default function AccentPage() {
  const s = useSettings();
  const a = s.accent;
  const acc = currentAccent();
  const [kind, setKind] = useState<'sentences' | 'pairs'>('sentences');
  const [items, setItems] = useState<AccentItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [judging, setJudging] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [mine, setMine] = useState<Blob | null>(null);
  const [custom, setCustom] = useState('');
  const [sheet, setSheet] = useState(false);
  const [history, setHistory] = useState(false);
  const [view, setView] = useState<'practice' | 'compare'>('practice');
  const seen = useRef<string[]>([]);
  const voice = referenceVoice(acc);
  const item = items[idx];
  const attempts = useLiveQuery(() => db.attempts.where('accent').equals(acc.label).reverse().sortBy('createdAt'), [acc.label]) ?? [];

  useEffect(() => {
    setItems([]);
    setResult(null);
    setMine(null);
    seen.current = [];
  }, [acc.label]);

  const generate = async () => {
    setBusy(true);
    try {
      const list = await makeSet(acc, kind, seen.current);
      seen.current.push(...list.map((i) => i.text));
      setItems(list);
      setIdx(0);
      setResult(null);
      setMine(null);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const go = (d: number) => {
    setIdx((i) => Math.max(0, Math.min(items.length - 1, i + d)));
    setResult(null);
    setMine(null);
  };

  const judge = async (blob: Blob) => {
    if (!item) return;
    setMine(blob);
    setJudging(true);
    setResult(null);
    try {
      const r = await evaluate(acc, item, blob);
      setResult(r);
      await db.attempts.add({ id: uid(), accent: acc.label, text: item.text, createdAt: Date.now(), score: Math.round((r.overall + r.accent_match) / 2), result: r, audio: blob });
    } catch (e) {
      toastError(e);
    } finally {
      setJudging(false);
    }
  };

  const avg = attempts.length ? Math.round(attempts.slice(0, 20).reduce((x, y) => x + y.score, 0) / Math.min(20, attempts.length)) : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Accent trainer"
        subtitle={view === 'compare' ? 'Hear one sentence in several accents' : `${acc.flag} ${acc.label}${avg != null ? ` · recent average ${avg}` : ''}`}
        actions={
          <>
            <IconButton label="History" onClick={() => setHistory(true)}>
              <History className="size-5" />
            </IconButton>
            <IconButton label="Accent settings" onClick={() => setSheet(true)}>
              <Settings2 className="size-5" />
            </IconButton>
          </>
        }
      />
      <div className="flex justify-center border-b border-line px-3 py-2">
        <Segmented
          value={view}
          onChange={setView}
          className="w-full max-w-xs"
          options={[
            { value: 'practice', label: 'Practice' },
            { value: 'compare', label: 'Compare accents' },
          ]}
        />
      </div>
      {view === 'compare' ? (
        <div className="min-h-0 flex-1">
          <AccentCompare />
        </div>
      ) : (
        <>
          <div className="scroll-thin flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
            {ACCENTS.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => s.setAccent({ accentId: x.id })}
                className={clsx(
                  'shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px]',
                  a.accentId === x.id ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line text-muted hover:text-fg',
                )}
              >
                {x.flag} {x.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => s.setAccent({ accentId: 'custom' })}
              className={clsx('shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px]', a.accentId === 'custom' ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line text-muted')}
            >
              🎯 Other…
            </button>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-xl space-y-4 p-4">
              {a.accentId === 'custom' && (
                <Field label="Which accent?" hint="Any accent of any language, e.g. “New York English”, “Andalusian Spanish”, “Quebec French”.">
                  <input className={inputCls} value={a.customAccent} onChange={(e) => s.setAccent({ customAccent: e.target.value })} placeholder="Type an accent" />
                </Field>
              )}
              <div className="flex items-center gap-2">
                <Segmented
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: 'sentences', label: 'Sentences' },
                    { value: 'pairs', label: 'Word pairs' },
                  ]}
                />
                <div className="flex-1" />
                <Button variant="primary" size="sm" loading={busy} icon={items.length ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />} onClick={generate}>
                  {items.length ? 'New set' : 'Make a set'}
                </Button>
              </div>
              <div className="flex gap-2">
                <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="…or practise your own sentence" className={clsx(inputCls, 'h-10')} />
                <Button
                  variant="subtle"
                  disabled={!custom.trim()}
                  onClick={() => {
                    setItems([{ text: custom.trim(), ipa: '', focus: '', tip: '' }, ...items]);
                    setIdx(0);
                    setResult(null);
                    setMine(null);
                    setCustom('');
                  }}
                >
                  Use
                </Button>
              </div>

              {!item ? (
                <Empty icon={<AudioWaveform className="size-6" />} title={`Sound more ${acc.label}`}>
                  Make a practice set. For each line: listen to the reference voice, record yourself, and get feedback on each sound.
                </Empty>
              ) : (
                <>
                  <Card>
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted">
                      <span className="tabular-nums">
                        {idx + 1} / {items.length}
                      </span>
                      {item.focus && (
                        <Badge tone="accent">
                          <Target className="size-3" />
                          {item.focus}
                        </Badge>
                      )}
                      <span className="flex-1" />
                      <IconButton label="Previous" size="sm" disabled={idx === 0} onClick={() => go(-1)}>
                        <ChevronLeft className="size-4" />
                      </IconButton>
                      <IconButton label="Next" size="sm" disabled={idx >= items.length - 1} onClick={() => go(1)}>
                        <ChevronRight className="size-4" />
                      </IconButton>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-2xl font-medium leading-snug">{item.text}</div>
                        {item.ipa && <div className="mt-1 font-mono text-sm text-muted">/{item.ipa.replace(/^\/|\/$/g, '')}/</div>}
                      </div>
                      <div className="flex flex-col">
                        <SpeakButton text={item.text} voice={voice} id="acc-ref" size="md" label="Play reference" />
                        <button type="button" onClick={() => speak(item.text, voice, 'acc-ref', { slow: true })} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2" aria-label="Play slowly">
                          <Snail className="size-4" />
                        </button>
                      </div>
                    </div>
                    {item.tip && <div className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">💡 {item.tip}</div>}
                  </Card>

                  <div className="flex flex-col items-center gap-2 py-1">
                    {judging ? <Loader2 className="size-12 animate-spin text-accent" /> : <MicButton size="xl" label="Record yourself" onAudio={judge} />}
                    <div className="text-xs text-muted">{judging ? 'Analysing your accent…' : 'Listen first, then record yourself'}</div>
                  </div>

                  {result && <ResultView r={result} item={item} mine={mine} onNext={idx < items.length - 1 ? () => go(1) : generate} />}
                </>
              )}
            </div>
          </div>
        </>
      )}

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Accent settings">
        <div className="space-y-5">
          <Field label="Listening model" hint="Hears your recording and gives feedback. Must accept audio.">
            <ModelButton role="listen" value={a.listenModel} onChange={(listenModel) => s.setAccent({ listenModel })} />
          </Field>
          <Toggle
            checked={!a.voice}
            onChange={(auto) => s.setAccent({ voice: auto ? null : referenceVoice(acc) })}
            label="Pick the reference voice automatically"
            hint="Uses a Microsoft voice from that region when one exists (US, UK, Australia, India, Spain, Mexico…), otherwise Gemini with an accent style."
          />
          {a.voice && (
            <Field label="Reference voice">
              <VoiceButton value={a.voice} onChange={(voice) => s.setAccent({ voice })} sampleText="I can't find the water bottle. I think I left it in the car." />
            </Field>
          )}
          <Toggle
            checked={a.compareWithReference}
            onChange={(compareWithReference) => s.setAccent({ compareWithReference })}
            label="Compare with the reference recording"
            hint="Sends the reference audio together with yours for a side-by-side judgement."
          />
          <Toggle
            checked={a.machineCheck}
            onChange={(machineCheck) => s.setAccent({ machineCheck })}
            label="Speech recognizer check"
            hint="Also shows what an automatic transcriber heard — an objective test of clarity."
          />
        </div>
      </Sheet>

      <Sheet open={history} onClose={() => setHistory(false)} title={`${acc.label} history`}>
        {!attempts.length && <div className="py-8 text-center text-sm text-muted">No attempts yet.</div>}
        <div className="space-y-1.5">
          {attempts.map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              <ScoreRing value={t.score} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{t.text}</div>
                <div className="text-[11px] text-muted">{timeAgo(t.createdAt)}</div>
              </div>
              {t.audio && (
                <IconButton label="Play" size="sm" onClick={() => playBlob(t.audio!, `att:${t.id}`)}>
                  <Play className="size-3.5" />
                </IconButton>
              )}
              <IconButton label="Delete" size="sm" onClick={() => db.attempts.delete(t.id)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function ResultView({ r, item, mine, onNext }: { r: Result; item: AccentItem; mine: Blob | null; onNext: () => void }) {
  const machine = r.machine ? diffWords(item.text, r.machine) : null;
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <ScoreRing value={r.overall} size={60} />
          <span className="text-[11px] text-muted">Clarity</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <ScoreRing value={r.accent_match} size={60} />
          <span className="text-[11px] text-muted">Accent</span>
        </div>
        <div className="min-w-0 flex-1 text-sm">{r.summary}</div>
      </div>
      {!!r.features?.length && (
        <div className="space-y-1.5">
          {r.features.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <Badge tone={f.status === 'good' ? 'teal' : f.status === 'close' ? 'warn' : 'danger'}>{f.status}</Badge>
              <div>
                <span className="font-medium">{f.feature}</span>
                {f.note && <span className="text-muted"> — {f.note}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!!r.words?.length && (
        <div className="flex flex-wrap gap-1.5">
          {r.words.map((w, i) => (
            <span
              key={i}
              title={[w.issue, w.tip].filter(Boolean).join(' — ')}
              className={clsx(
                'rounded-lg px-2 py-1 text-sm',
                w.score >= 80 ? 'bg-teal/12 text-teal' : w.score >= 55 ? 'bg-warn/12 text-warn' : 'bg-danger/12 text-danger',
              )}
            >
              {w.word}
            </span>
          ))}
        </div>
      )}
      {r.words?.some((w) => w.issue) && (
        <div className="space-y-1 text-sm">
          {r.words
            .filter((w) => w.issue)
            .map((w, i) => (
              <div key={i}>
                <span className="font-medium">{w.word}:</span> <span className="text-muted">{w.issue}.</span> {w.tip}
              </div>
            ))}
        </div>
      )}
      {r.next_focus && <div className="rounded-xl bg-accent/10 px-3 py-2 text-sm">🎯 Next: {r.next_focus}</div>}
      {machine && (
        <div className="rounded-xl border border-line px-3 py-2 text-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs text-muted">
            <Cpu className="size-3.5" /> A speech recognizer heard ({machine.score}% match):
          </div>
          {r.machine}
        </div>
      )}
      <div className="flex items-center gap-2">
        {mine && (
          <Button variant="outline" icon={<Play className="size-4" />} onClick={() => playBlob(mine, 'acc-mine')}>
            Me
          </Button>
        )}
        <div className="flex-1 text-right text-[11px] text-muted">{formatCost(r.cost)}</div>
        <Button variant="primary" onClick={onNext}>
          Next
        </Button>
      </div>
    </Card>
  );
}
