import clsx from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, Check, ChevronDown, Ear, Eye, GraduationCap, Loader2, MessageCircle, Mic, Play, Plus, RefreshCw, Send, Settings2, Snail, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MicButton } from '../components/MicButton';
import { ModelButton } from '../components/ModelPicker';
import { SpeakButton } from '../components/SpeakButton';
import { VoiceButton } from '../components/VoicePicker';
import { Badge, Button, Card, Empty, Field, IconButton, PageHeader, ScoreRing, Segmented, Select, Sheet, Spinner, Toggle, inputCls } from '../components/ui';
import type { PronunciationResult } from '../lib/ai';
import { db, uid, type Card as CardT, type TeacherProfile, type TutorTurn } from '../lib/db';
import { findLanguage, flagOf, isNonLatin, LANGUAGES, LEVELS } from '../lib/languages';
import { formatCost } from '../lib/models';
import { useSettings } from '../lib/store';
import { addCard, grade, judgePronunciation, newSentence, profileModel, profileVoice, tutorTurn } from '../lib/teacher';
import { diffWords } from '../lib/text';
import { toast, toastError } from '../lib/toast';
import { dictate } from '../lib/stt';
import { playBlob, speak } from '../lib/tts';

type Tab = 'talk' | 'listen' | 'speak' | 'cards';

export default function TeacherPage() {
  const profiles = useLiveQuery(() => db.profiles.orderBy('createdAt').toArray(), []);
  const { activeProfileId, set } = useSettings();
  const [tab, setTab] = useState<Tab>('talk');
  const [switcher, setSwitcher] = useState(false);
  const [editing, setEditing] = useState<TeacherProfile | 'new' | null>(null);
  const [opts, setOpts] = useState(false);

  if (!profiles) return null;
  const p = profiles.find((x) => x.id === activeProfileId) ?? profiles[0];

  if (!p || editing) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title={editing && editing !== 'new' ? 'Edit course' : 'New language course'} />
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <ProfileForm
            initial={editing && editing !== 'new' ? editing : undefined}
            onCancel={p ? () => setEditing(null) : undefined}
            onSave={async (np) => {
              await db.profiles.put(np);
              set({ activeProfileId: np.id });
              setEditing(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={
          <button type="button" onClick={() => setSwitcher(true)} className="flex items-center gap-1.5">
            <span>{flagOf(p.language)}</span>
            <span>
              {p.language}
              {p.variant && <span className="font-normal text-muted"> · {p.variant}</span>}
            </span>
            <ChevronDown className="size-4 text-muted" />
          </button>
        }
        subtitle={`${LEVELS.find((l) => l.id === p.level)?.label ?? p.level} · from ${p.native}`}
        actions={
          <IconButton label="Course settings" onClick={() => setOpts(true)}>
            <Settings2 className="size-5" />
          </IconButton>
        }
      />
      <div className="flex justify-center border-b border-line px-3 py-2">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          className="w-full max-w-md"
          options={[
            { value: 'talk', label: <span className="inline-flex items-center gap-1.5"><MessageCircle className="size-3.5" />Talk</span> },
            { value: 'listen', label: <span className="inline-flex items-center gap-1.5"><Ear className="size-3.5" />Listen</span> },
            { value: 'speak', label: <span className="inline-flex items-center gap-1.5"><Mic className="size-3.5" />Speak</span> },
            { value: 'cards', label: <span className="inline-flex items-center gap-1.5"><BookOpen className="size-3.5" />Cards</span> },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'talk' && <TalkTab key={p.id} p={p} />}
        {tab === 'listen' && <ListenTab key={p.id} p={p} />}
        {tab === 'speak' && <SpeakTab key={p.id} p={p} />}
        {tab === 'cards' && <CardsTab key={p.id} p={p} />}
      </div>

      <Sheet open={switcher} onClose={() => setSwitcher(false)} title="Your courses">
        <div className="space-y-1.5">
          {profiles.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                set({ activeProfileId: x.id });
                setSwitcher(false);
              }}
              className={clsx('flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left', x.id === p.id ? 'border-accent/50 bg-accent/10' : 'border-line hover:bg-surface-2')}
            >
              <span className="text-2xl">{flagOf(x.language)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {x.language}
                  {x.variant && <span className="text-muted"> · {x.variant}</span>}
                </div>
                <div className="text-xs text-muted">
                  {x.level} · {x.topic || 'general topics'}
                </div>
              </div>
              {x.id === p.id && <Check className="size-4 text-accent" />}
            </button>
          ))}
          <Button
            variant="outline"
            className="mt-2 w-full"
            icon={<Plus className="size-4" />}
            onClick={() => {
              setSwitcher(false);
              setEditing('new');
            }}
          >
            Add a language
          </Button>
        </div>
      </Sheet>

      <Sheet open={opts} onClose={() => setOpts(false)} title={`${p.language} course settings`}>
        <div className="space-y-5">
          <Field label="Tutor model" hint="A model that hears audio lets the tutor judge your pronunciation directly.">
            <ModelButton role="listen" value={profileModel(p)} onChange={(model) => db.profiles.update(p.id, { model })} />
          </Field>
          <Field label="Tutor voice">
            <VoiceButton value={profileVoice(p)} onChange={(voice) => db.profiles.update(p.id, { voice })} sampleText={undefined} />
          </Field>
          <Toggle checked={p.autoSpeak !== false} onChange={(autoSpeak) => db.profiles.update(p.id, { autoSpeak })} label="Speak tutor replies aloud" />
          <Toggle checked={p.translit} onChange={(translit) => db.profiles.update(p.id, { translit })} label="Show romanization" hint="Latin letters under non-Latin scripts." />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setOpts(false);
                setEditing(p);
              }}
            >
              Edit level & topics
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm(`Delete the ${p.language} course, its conversation and cards?`)) return;
                await db.transaction('rw', db.profiles, db.turns, db.cards, async () => {
                  await db.turns.where('[profileId+createdAt]').between([p.id, 0], [p.id, Infinity]).delete();
                  await db.cards.where('profileId').equals(p.id).delete();
                  await db.profiles.delete(p.id);
                });
                setOpts(false);
                set({ activeProfileId: null });
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function ProfileForm({ initial, onSave, onCancel }: { initial?: TeacherProfile; onSave: (p: TeacherProfile) => void; onCancel?: () => void }) {
  const my = useSettings((s) => s.myLanguage);
  const [language, setLanguage] = useState(initial?.language ?? '');
  const [custom, setCustom] = useState(initial && !findLanguage(initial.language) ? initial.language : '');
  const [variant, setVariant] = useState(initial?.variant ?? '');
  const [native, setNative] = useState(initial?.native ?? my);
  const [level, setLevel] = useState(initial?.level ?? 'A1');
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const lang = custom.trim() || language;
  const variants = findLanguage(lang)?.variants;

  return (
    <div className="mx-auto max-w-xl space-y-6 p-4">
      {!initial && (
        <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-accent/12 to-teal/10 p-4">
          <GraduationCap className="size-8 shrink-0 text-accent" />
          <div className="text-sm">Pick any language. Spanish and Georgian are only examples — the tutor works with any language the model knows.</div>
        </div>
      )}
      <Field label="Language to learn">
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.filter((l) => l.name !== native).map((l) => (
            <button
              key={l.name}
              type="button"
              onClick={() => {
                setLanguage(l.name);
                setCustom('');
                setVariant('');
              }}
              className={clsx(
                'rounded-xl border px-2.5 py-1.5 text-[13px] transition',
                lang === l.name ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line hover:bg-surface-2',
              )}
            >
              {l.flag} {l.name}
            </button>
          ))}
        </div>
        <input className={clsx(inputCls, 'mt-2')} placeholder="…or type any other language (e.g. Basque, Yoruba)" value={custom} onChange={(e) => setCustom(e.target.value)} />
      </Field>
      <Field label="Variant / dialect" hint="Optional. For example: Mexico, Castilian, Brazilian, Egyptian.">
        {variants ? (
          <div className="flex flex-wrap gap-1.5">
            {['', ...variants].map((v) => (
              <button
                key={v || 'any'}
                type="button"
                onClick={() => setVariant(v)}
                className={clsx('rounded-xl border px-2.5 py-1.5 text-[13px]', variant === v ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line hover:bg-surface-2')}
              >
                {v || 'Any'}
              </button>
            ))}
          </div>
        ) : (
          <input className={inputCls} value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="Standard" />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="My native language">
          <Select value={native} onChange={setNative} options={LANGUAGES.map((l) => ({ value: l.name, label: `${l.flag} ${l.name}` }))} />
        </Field>
        <Field label="My level">
          <Select value={level} onChange={setLevel} options={LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
        </Field>
      </div>
      <Field label="Topics I care about" hint="Used for conversations and exercises.">
        <input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="travel, food, work, football…" />
      </Field>
      <div className="flex gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          size="lg"
          className="flex-1"
          disabled={!lang}
          onClick={() =>
            onSave({
              id: initial?.id ?? uid(),
              createdAt: initial?.createdAt ?? Date.now(),
              language: lang,
              variant,
              native,
              level,
              topic,
              translit: initial?.translit ?? isNonLatin(lang),
              model: initial?.model,
              voice: initial?.voice,
              autoSpeak: initial?.autoSpeak,
            })
          }
        >
          {initial ? 'Save' : 'Start learning'}
        </Button>
      </div>
    </div>
  );
}

function Reveal({ children, label = 'Show translation' }: { children: React.ReactNode; label?: string }) {
  const [shown, setShown] = useState(false);
  return shown ? (
    <div>{children}</div>
  ) : (
    <button type="button" onClick={() => setShown(true)} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
      <Eye className="size-3.5" /> {label}
    </button>
  );
}

function TalkTab({ p }: { p: TeacherProfile }) {
  const turns = useLiveQuery(() => db.turns.where('[profileId+createdAt]').between([p.id, 0], [p.id, Infinity]).toArray(), [p.id]) ?? [];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  const voice = profileVoice(p);

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' });
  }, [turns.length, busy]);

  const go = async (input: { text?: string; audio?: Blob } | null) => {
    setBusy(true);
    try {
      const r = await tutorTurn(p, input);
      if (p.autoSpeak !== false) speak(r.data.reply, voice, `turn:${r.id}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={feed} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 p-3">
          {!turns.length && !busy && (
            <Empty icon={<MessageCircle className="size-6" />} title={`Talk with your ${p.language} tutor`}>
              Speak or type. The tutor answers at your level, corrects mistakes and gives pronunciation tips.
              <div className="mt-4">
                <Button variant="primary" onClick={() => go(null)}>
                  Start conversation
                </Button>
              </div>
            </Empty>
          )}
          {turns.map((t) => (t.role === 'user' ? <UserTurn key={t.id} t={t} /> : <TutorTurnView key={t.id} t={t} p={p} />))}
          {busy && (
            <div className="flex items-center gap-2 px-1 text-sm text-muted">
              <Spinner /> Tutor is thinking…
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-line bg-surface p-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim() && !busy) {
                go({ text: text.trim() });
                setText('');
              }
            }}
            placeholder={`Write in ${p.language}…`}
            className={clsx(inputCls, 'h-11')}
          />
          {text.trim() ? (
            <IconButton
              label="Send"
              variant="primary"
              className="rounded-full"
              disabled={busy}
              onClick={() => {
                go({ text: text.trim() });
                setText('');
              }}
            >
              <Send className="size-4" />
            </IconButton>
          ) : (
            <MicButton size="lg" label="Speak to the tutor" disabled={busy} onAudio={(audio) => go({ audio })} />
          )}
        </div>
      </div>
    </div>
  );
}

function UserTurn({ t }: { t: TutorTurn }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-accent/12 px-4 py-2.5">
        <div className="flex items-center gap-2">
          {t.audio && (
            <button type="button" aria-label="Play my recording" onClick={() => playBlob(t.audio!, `my:${t.id}`)} className="text-accent">
              <Play className="size-4" />
            </button>
          )}
          <span className="text-[15px]">{t.text}</span>
        </div>
      </div>
    </div>
  );
}

function TutorTurnView({ t, p }: { t: TutorTurn; p: TeacherProfile }) {
  const d = t.data ?? {};
  const voice = profileVoice(p);
  return (
    <div className="space-y-2">
      {(d.corrections?.length > 0 || d.pronunciation) && (
        <div className="ml-auto max-w-[85%] space-y-1.5 rounded-2xl border border-warn/30 bg-warn/8 px-3 py-2 text-sm">
          {d.corrections?.map((c: { original: string; corrected: string; explanation: string }, i: number) => (
            <div key={i}>
              <span className="text-danger line-through">{c.original}</span> → <span className="font-medium text-teal">{c.corrected}</span>
              <div className="text-xs text-muted">{c.explanation}</div>
            </div>
          ))}
          {d.pronunciation && (
            <div className="text-xs">
              <span className="font-medium">🗣 Pronunciation:</span> {d.pronunciation}
            </div>
          )}
        </div>
      )}
      <Card className="max-w-[92%]">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-lg leading-snug">{d.reply ?? t.text}</div>
            {p.translit && d.transliteration && <div className="mt-0.5 text-sm italic text-muted">{d.transliteration}</div>}
            <div className="mt-2 text-sm text-teal">
              <Reveal>{d.translation}</Reveal>
            </div>
          </div>
          <div className="flex flex-col">
            <SpeakButton text={d.reply ?? t.text} voice={voice} id={`turn:${t.id}`} />
            <button type="button" aria-label="Play slowly" title="Play slowly" onClick={() => speak(d.reply ?? t.text, voice, `turn:${t.id}`, { slow: true })} className="flex size-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2">
              <Snail className="size-4" />
            </button>
          </div>
        </div>
        {d.new_words?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {d.new_words.map((w: { word: string; transliteration: string; meaning: string }) => (
              <button
                key={w.word}
                type="button"
                title="Add to flashcards"
                onClick={async () => toast((await addCard(p.id, w.word, w.meaning, w.transliteration)) ? `Added “${w.word}” to cards` : 'Already in your cards', 'success')}
                className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs hover:bg-surface-3"
              >
                <Plus className="size-3" />
                <span className="font-medium">{w.word}</span>
                <span className="text-muted">{w.meaning}</span>
              </button>
            ))}
          </div>
        )}
        {d.cost != null && <div className="mt-2 text-right text-[11px] text-muted">{formatCost(d.cost)}</div>}
      </Card>
    </div>
  );
}

function ListenTab({ p }: { p: TeacherProfile }) {
  const [item, setItem] = useState<{ sentence: string; transliteration: string; translation: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<ReturnType<typeof diffWords> | null>(null);
  const [hearing, setHearing] = useState(false);
  const [stats, setStats] = useState({ n: 0, total: 0 });
  const seen = useRef<string[]>([]);
  const voice = profileVoice(p);

  const next = async () => {
    setBusy(true);
    setResult(null);
    setAnswer('');
    try {
      const it = await newSentence(p, 'listen', seen.current);
      seen.current.push(it.sentence);
      setItem(it);
      speak(it.sentence, voice, 'listen');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const check = (a = answer) => {
    if (!item || !a.trim()) return;
    const r = diffWords(item.sentence, a);
    setResult(r);
    setStats((s) => ({ n: s.n + 1, total: s.total + r.score }));
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-4 p-4">
        {stats.n > 0 && (
          <div className="text-center text-xs text-muted">
            {stats.n} done · average {Math.round(stats.total / stats.n)}%
          </div>
        )}
        {!item ? (
          <Empty icon={<Ear className="size-6" />} title="Listening practice">
            You'll hear a sentence at your level. Write or say what you heard, then check.
            <div className="mt-4">
              <Button variant="primary" loading={busy} onClick={next}>
                Start
              </Button>
            </div>
          </Empty>
        ) : (
          <>
            <Card className="flex items-center justify-center gap-4 py-8">
              <SpeakButton text={item.sentence} voice={voice} id="listen" size="lg" className="bg-accent/12 text-accent" label="Play" />
              <button type="button" onClick={() => speak(item.sentence, voice, 'listen', { slow: true })} className="flex size-12 items-center justify-center rounded-xl bg-surface-2 text-muted hover:text-fg" aria-label="Play slowly">
                <Snail className="size-5" />
              </button>
            </Card>
            {!result ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && check()}
                    placeholder="Type what you heard…"
                    className={clsx(inputCls, 'h-11')}
                  />
                  {hearing ? (
                    <span className="flex size-14 items-center justify-center">
                      <Loader2 className="size-5 animate-spin text-muted" />
                    </span>
                  ) : (
                    <MicButton
                      size="lg"
                      label="Say what you heard"
                      onAudio={async (b) => {
                        setHearing(true);
                        try {
                          const t = await dictate(b, p.language);
                          setAnswer(t);
                          check(t);
                        } catch (e) {
                          toastError(e);
                        } finally {
                          setHearing(false);
                        }
                      }}
                    />
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1" disabled={!answer.trim()} onClick={() => check()}>
                    Check
                  </Button>
                  <Button variant="ghost" onClick={() => setResult(diffWords(item.sentence, ''))}>
                    Show answer
                  </Button>
                </div>
              </div>
            ) : (
              <Card className="space-y-3">
                <div className="flex items-center gap-4">
                  <ScoreRing value={result.score} />
                  <div className="flex flex-wrap gap-x-1.5 gap-y-1 text-lg">
                    {result.tokens.map((tk, i) => (
                      <span key={i} className={tk.ok ? 'text-teal' : 'text-danger underline decoration-dotted'} title={tk.heard ? `You wrote: ${tk.heard}` : undefined}>
                        {tk.word}
                      </span>
                    ))}
                  </div>
                </div>
                {item.transliteration && p.translit && <div className="text-sm italic text-muted">{item.transliteration}</div>}
                <div className="text-sm text-teal">{item.translation}</div>
                {answer.trim() && <div className="text-xs text-muted">You: {answer}</div>}
                <div className="flex gap-2 pt-1">
                  <Button variant="primary" className="flex-1" loading={busy} icon={<RefreshCw className="size-4" />} onClick={next}>
                    Next sentence
                  </Button>
                  <Button
                    variant="outline"
                    icon={<Plus className="size-4" />}
                    onClick={async () => toast((await addCard(p.id, item.sentence, item.translation, item.transliteration)) ? 'Added to cards' : 'Already in cards', 'success')}
                  >
                    Card
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SpeakTab({ p }: { p: TeacherProfile }) {
  const [item, setItem] = useState<{ sentence: string; transliteration: string; translation: string } | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [judging, setJudging] = useState(false);
  const [mine, setMine] = useState<Blob | null>(null);
  const [res, setRes] = useState<PronunciationResult | null>(null);
  const seen = useRef<string[]>([]);
  const voice = profileVoice(p);

  const next = async () => {
    setBusy(true);
    setRes(null);
    setMine(null);
    try {
      const it = await newSentence(p, 'speak', seen.current);
      seen.current.push(it.sentence);
      setItem(it);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  const judge = async (b: Blob) => {
    if (!item) return;
    setMine(b);
    setJudging(true);
    try {
      setRes(await judgePronunciation(p, item.sentence, b));
    } catch (e) {
      toastError(e);
    } finally {
      setJudging(false);
    }
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <div className="flex gap-2">
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={`Your own ${p.language} phrase (optional)`} className={clsx(inputCls, 'h-10')} />
          <Button
            variant="subtle"
            disabled={!custom.trim()}
            onClick={() => {
              setItem({ sentence: custom.trim(), transliteration: '', translation: '' });
              setRes(null);
              setMine(null);
              setCustom('');
            }}
          >
            Use
          </Button>
        </div>
        {!item ? (
          <Empty icon={<Mic className="size-6" />} title="Pronunciation practice">
            Get a phrase with sounds that are tricky for {p.native} speakers. Listen, record yourself, and get a score with tips.
            <div className="mt-4">
              <Button variant="primary" loading={busy} onClick={next}>
                Give me a phrase
              </Button>
            </div>
          </Empty>
        ) : (
          <>
            <Card>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-medium leading-snug">{item.sentence}</div>
                  {p.translit && item.transliteration && <div className="mt-1 text-sm italic text-muted">{item.transliteration}</div>}
                  {item.translation && <div className="mt-2 text-sm text-teal">{item.translation}</div>}
                </div>
                <div className="flex flex-col">
                  <SpeakButton text={item.sentence} voice={voice} id="speak-ref" size="md" />
                  <button type="button" onClick={() => speak(item.sentence, voice, 'speak-ref', { slow: true })} className="flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface-2" aria-label="Play slowly">
                    <Snail className="size-4" />
                  </button>
                </div>
              </div>
            </Card>
            <div className="flex flex-col items-center gap-2 py-2">
              {judging ? <Loader2 className="size-10 animate-spin text-accent" /> : <MicButton size="xl" label="Record yourself" onAudio={judge} />}
              <div className="text-xs text-muted">{judging ? 'Listening to you…' : 'Tap to record, tap again to stop — or hold'}</div>
            </div>
            {res && (
              <Card className="space-y-3">
                <div className="flex items-center gap-4">
                  <ScoreRing value={res.score} size={64} />
                  <div className="min-w-0 flex-1 text-sm">{res.summary}</div>
                </div>
                {res.heard && (
                  <div className="text-xs text-muted">
                    Heard: <span className="text-fg">{res.heard}</span>
                  </div>
                )}
                <div className="space-y-1">
                  {res.words?.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge tone={w.score >= 80 ? 'teal' : w.score >= 55 ? 'warn' : 'danger'} className="w-9 justify-center tabular-nums">
                        {Math.round(w.score)}
                      </Badge>
                      <span className="font-medium">{w.word}</span>
                      {w.tip && <span className="text-xs text-muted">{w.tip}</span>}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 pt-1">
                  {mine && (
                    <Button variant="outline" icon={<Play className="size-4" />} onClick={() => playBlob(mine, 'mine')}>
                      Me
                    </Button>
                  )}
                  <Button variant="primary" className="flex-1" loading={busy} icon={<RefreshCw className="size-4" />} onClick={next}>
                    Next phrase
                  </Button>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CardsTab({ p }: { p: TeacherProfile }) {
  const cards = useLiveQuery(() => db.cards.where('profileId').equals(p.id).toArray(), [p.id]) ?? [];
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, []);
  const due = cards.filter((c) => c.due <= Date.now()).sort((a, b) => a.due - b.due);
  const [mode, setMode] = useState<'review' | 'list'>('review');
  const [flipped, setFlipped] = useState(false);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const voice = profileVoice(p);
  const card = due[0];

  useEffect(() => setFlipped(false), [card?.id]);

  const rate = async (c: CardT, q: 0 | 3 | 4 | 5) => {
    await db.cards.put(grade(c, q));
  };

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'review', label: `Review (${due.length})` },
              { value: 'list', label: `All (${cards.length})` },
            ]}
          />
        </div>
        {mode === 'review' &&
          (card ? (
            <>
              <Card className="flex min-h-56 flex-col items-center justify-center gap-3 text-center">
                <div className="text-3xl font-medium">{card.front}</div>
                {flipped && (
                  <>
                    {card.translit && <div className="text-sm italic text-muted">{card.translit}</div>}
                    <div className="text-lg text-teal">{card.back}</div>
                  </>
                )}
                <SpeakButton text={card.front} voice={voice} id={`card:${card.id}`} size="md" />
              </Card>
              {!flipped ? (
                <Button variant="primary" size="lg" className="w-full" onClick={() => setFlipped(true)}>
                  Show answer
                </Button>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      [0, 'Again', 'danger'],
                      [3, 'Hard', 'subtle'],
                      [4, 'Good', 'subtle'],
                      [5, 'Easy', 'primary'],
                    ] as const
                  ).map(([q, label, v]) => (
                    <Button key={label} variant={v} onClick={() => rate(card, q)}>
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <Empty icon={<BookOpen className="size-6" />} title={cards.length ? 'All caught up!' : 'No cards yet'}>
              {cards.length ? 'Come back later for the next review.' : 'Add words from the tutor chat or listening drills, or add your own below.'}
            </Empty>
          ))}
        {mode === 'list' && (
          <div className="space-y-1.5">
            {cards.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                <SpeakButton text={c.front} voice={voice} id={`card:${c.id}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.front}</div>
                  <div className="truncate text-xs text-muted">{c.back}</div>
                </div>
                <span className="text-[11px] text-muted">{c.due <= Date.now() ? 'due' : `in ${Math.ceil((c.due - Date.now()) / 86400_000)}d`}</span>
                <IconButton label="Delete card" size="sm" onClick={() => db.cards.delete(c.id)}>
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
        <Card className="space-y-2">
          <div className="text-sm font-medium">Add a card</div>
          <input className={inputCls} placeholder={`${p.language} word or phrase`} value={front} onChange={(e) => setFront(e.target.value)} />
          <input className={inputCls} placeholder={`Meaning in ${p.native}`} value={back} onChange={(e) => setBack(e.target.value)} />
          <Button
            variant="subtle"
            className="w-full"
            disabled={!front.trim() || !back.trim()}
            onClick={async () => {
              await addCard(p.id, front.trim(), back.trim());
              setFront('');
              setBack('');
            }}
          >
            Add
          </Button>
        </Card>
      </div>
    </div>
  );
}
