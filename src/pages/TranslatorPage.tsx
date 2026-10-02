import clsx from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, ArrowLeftRight, Ear, Loader2, Mic, MicOff, Play, RotateCcw, Send, Settings2, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MicButton } from '../components/MicButton';
import { ModelButton } from '../components/ModelPicker';
import { SpeakButton } from '../components/SpeakButton';
import { VoiceButton } from '../components/VoicePicker';
import { Badge, Empty, Field, IconButton, PageHeader, Segmented, Select, Sheet, Toggle, inputCls } from '../components/ui';
import { useWakeLock } from '../hooks/useWakeLock';
import { db, uid, type Utterance } from '../lib/db';
import { flagOf, LANGUAGES } from '../lib/languages';
import { formatCost } from '../lib/models';
import { useSettings } from '../lib/store';
import { toastError } from '../lib/toast';
import { chooseSuggestion, clips, processMine, processThem, retry } from '../lib/translator';
import { playBlob, useSpeech } from '../lib/tts';
import { createVad, type VadHandle } from '../lib/vad';

const SESSION_KEY = 'orc-translator-session';
const getSession = () => localStorage.getItem(SESSION_KEY) ?? (localStorage.setItem(SESSION_KEY, uid()), localStorage.getItem(SESSION_KEY)!);

const langOptions = (withAuto: boolean) => [
  ...(withAuto ? [{ value: 'auto', label: '🌐 Auto-detect' }] : []),
  ...LANGUAGES.map((l) => ({ value: l.name, label: `${l.flag} ${l.name}` })),
];

export default function TranslatorPage() {
  const s = useSettings();
  const t = s.translator;
  const [session, setSession] = useState(getSession);
  const rows = useLiveQuery(() => db.utterances.where('[sessionId+createdAt]').between([session, 0], [session, Infinity]).toArray(), [session]) ?? [];
  const [sheet, setSheet] = useState(false);
  const [typed, setTyped] = useState('');
  const [always, setAlways] = useState<'off' | 'loading' | 'on'>('off');
  const [speaking, setSpeaking] = useState(false);
  const [meRecording, setMeRecording] = useState(false);
  const vad = useRef<VadHandle | null>(null);
  const feed = useRef<HTMLDivElement>(null);
  const playingKey = useSpeech((x) => x.playingKey);

  useWakeLock(always === 'on');

  useEffect(() => {
    feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' });
  }, [rows.length, rows[rows.length - 1]?.status]);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const gen = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const queue = (fn: () => Promise<unknown>) => (chain.current = chain.current.then(fn).catch(() => {}));

  useEffect(() => {
    const v = vad.current;
    if (!v || always !== 'on') return;
    const paused = !!playingKey || meRecording;
    queue(() => (paused ? v.pause() : v.start()));
  }, [playingKey, meRecording, always]);

  const dropVad = () => {
    const v = vad.current;
    vad.current = null;
    if (v) queue(() => v.destroy());
  };

  useEffect(
    () => () => {
      gen.current++;
      dropVad();
    },
    [],
  );

  const startAlways = async () => {
    const my = ++gen.current;
    setAlways('loading');
    try {
      const v = await createVad({
        sensitivity: useSettings.getState().translator.sensitivity,
        onSpeechStart: () => setSpeaking(true),
        onMisfire: () => setSpeaking(false),
        onSpeechEnd: (wav) => {
          setSpeaking(false);
          processThem(sessionRef.current, wav);
        },
      });
      if (my !== gen.current) {
        queue(() => v.destroy());
        return;
      }
      vad.current = v;
      const started = chain.current.then(() => v.start());
      chain.current = started.catch(() => {});
      await started;
      if (my === gen.current) setAlways('on');
    } catch (e) {
      if (my !== gen.current) return;
      setAlways('off');
      toastError(new Error(`Could not start listening: ${(e as Error).message}`));
    }
  };
  const stopAlways = () => {
    gen.current++;
    dropVad();
    setAlways('off');
    setSpeaking(false);
  };

  useEffect(() => {
    if (t.mode === 'hold') stopAlways();
  }, [t.mode]);

  const firstSens = useRef(true);
  useEffect(() => {
    if (firstSens.current) {
      firstSens.current = false;
      return;
    }
    if (always === 'off') return;
    stopAlways();
    startAlways();
  }, [t.sensitivity]);

  const sendTyped = () => {
    const v = typed.trim();
    if (!v) return;
    setTyped('');
    processMine(session, v);
  };

  const clear = async () => {
    if (!confirm('Clear this conversation?')) return;
    await db.utterances.where('sessionId').equals(session).delete();
    clips.clear();
    const id = uid();
    localStorage.setItem(SESSION_KEY, id);
    setSession(id);
  };

  const swap = () => {
    if (t.theirLanguage === 'auto') return;
    const mine = s.myLanguage;
    s.set({ myLanguage: t.theirLanguage });
    s.setTranslator({ theirLanguage: mine });
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Live translator"
        subtitle={t.mode === 'always' ? 'Always listening mode' : 'Hold the button while they speak'}
        actions={
          <>
            <IconButton label="Clear conversation" onClick={clear} disabled={!rows.length}>
              <Trash2 className="size-5" />
            </IconButton>
            <IconButton label="Translator settings" onClick={() => setSheet(true)}>
              <Settings2 className="size-5" />
            </IconButton>
          </>
        }
      />
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Select className="h-9 flex-1 py-1 text-[13px]" value={t.theirLanguage} onChange={(v) => s.setTranslator({ theirLanguage: v })} options={langOptions(true)} />
        <IconButton label="Swap languages" size="sm" onClick={swap} disabled={t.theirLanguage === 'auto'}>
          <ArrowLeftRight className="size-4" />
        </IconButton>
        <Select className="h-9 flex-1 py-1 text-[13px]" value={s.myLanguage} onChange={(v) => s.set({ myLanguage: v })} options={langOptions(false)} />
      </div>

      <div ref={feed} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 p-3">
          {!rows.length && (
            <Empty icon={<Ear className="size-6" />} title="Ready to listen">
              Hold the big button while someone speaks, or switch to “Always” and leave it running. You'll see the translation and tap-to-speak reply ideas.
            </Empty>
          )}
          {rows.map((u) => (u.who === 'them' ? <TheirCard key={u.id} u={u} /> : <MyCard key={u.id} u={u} />))}
        </div>
      </div>

      <div className="border-t border-line bg-surface px-3 pb-3 pt-3">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex justify-center">
            <Segmented
              value={t.mode}
              onChange={(mode) => s.setTranslator({ mode })}
              options={[
                { value: 'hold', label: 'Hold to listen' },
                { value: 'always', label: 'Always' },
              ]}
            />
          </div>
          <div className="flex items-center justify-center gap-6">
            <div className="flex w-20 flex-col items-center gap-1">
              <MicButton
                hold
                size="lg"
                label="Hold and speak in your language"
                onAudio={(b) => processMine(session, b)}
                onRecordingChange={setMeRecording}
                tone="teal"
              >
                <span className="flex flex-col items-center text-[10px] font-semibold">
                  <Mic className="size-5" />
                  ME
                </span>
              </MicButton>
            </div>
            {t.mode === 'hold' ? (
              <div className="flex flex-col items-center">
                <MicButton hold size="xl" label="Hold while they speak" onAudio={(b) => processThem(session, b)}>
                  <span className="flex flex-col items-center gap-1">
                    <Ear className="size-8" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide">Hold</span>
                  </span>
                </MicButton>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (always === 'off' ? startAlways() : stopAlways())}
                className={clsx(
                  'relative flex size-24 flex-col items-center justify-center gap-1 rounded-full text-white shadow-lg transition',
                  always === 'on' ? 'bg-danger shadow-danger/30' : 'bg-accent shadow-accent/25',
                )}
              >
                {always === 'on' && <span className={clsx('absolute inset-0 rounded-full bg-danger', speaking ? 'pulse-ring' : 'opacity-0')} />}
                <span className="relative flex flex-col items-center gap-1">
                  {always === 'loading' ? <Loader2 className="size-8 animate-spin" /> : always === 'on' ? <MicOff className="size-8" /> : <Ear className="size-8" />}
                  <span className="text-[10px] font-semibold uppercase tracking-wide">{always === 'on' ? (speaking ? 'Hearing' : 'Stop') : 'Start'}</span>
                </span>
              </button>
            )}
            <div className="w-20" />
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendTyped()}
              placeholder={`Type in ${s.myLanguage} — it will be translated and spoken`}
              className={clsx(inputCls, 'h-10 py-2')}
            />
            <IconButton label="Translate and speak" variant="subtle" onClick={sendTyped} disabled={!typed.trim()}>
              <Send className="size-4" />
            </IconButton>
          </div>
        </div>
      </div>

      <Sheet open={sheet} onClose={() => setSheet(false)} title="Translator settings">
        <div className="space-y-5">
          <Field label="Listening model" hint="Hears the audio, translates and suggests replies. Must accept audio input.">
            <ModelButton role="listen" value={t.listenModel} onChange={(listenModel) => s.setTranslator({ listenModel })} />
          </Field>
          <Field label="Voice for replies">
            <VoiceButton value={t.voice} onChange={(voice) => s.setTranslator({ voice })} />
          </Field>
          <Toggle
            checked={t.quickTranscript}
            onChange={(quickTranscript) => s.setTranslator({ quickTranscript })}
            label="Quick transcript"
            hint="Show the words within about a second using a fast transcription model, while the full translation loads."
          />
          {t.quickTranscript && (
            <Field label="Quick transcript model">
              <ModelButton role="stt" value={s.sttModel} onChange={(sttModel) => s.set({ sttModel })} />
            </Field>
          )}
          <Toggle
            checked={t.prefetch}
            onChange={(prefetch) => s.setTranslator({ prefetch })}
            label="Prepare reply audio"
            hint="Generate the spoken replies in the background so they play instantly. Costs a little more."
          />
          <Toggle checked={t.autoSpeakMine} onChange={(autoSpeakMine) => s.setTranslator({ autoSpeakMine })} label="Speak my translations aloud" />
          <Field label={`“Always” sensitivity · ${Math.round(t.sensitivity * 100)}%`} hint="Higher picks up quieter speech but also more background noise.">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={t.sensitivity}
              onChange={(e) => s.setTranslator({ sensitivity: Number(e.target.value) })}
              className="w-full accent-[var(--accent)]"
            />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}

function TheirCard({ u }: { u: Utterance }) {
  const t = useSettings((s) => s.translator);
  const playingKey = useSpeech((x) => x.playingKey);
  const blob = clips.get(u.id);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span>{u.language ? `${flagOf(u.language)} ${u.language}` : 'Listening…'}</span>
        {u.needsReply && <Badge tone="accent">Expects a reply</Badge>}
        <span className="flex-1" />
        {u.ms != null && <span className="tabular-nums">{(u.ms / 1000).toFixed(1)}s</span>}
        {u.cost != null && <span className="tabular-nums">{formatCost(u.cost)}</span>}
        {blob && (
          <button type="button" aria-label="Replay original" className="rounded-md p-1 hover:bg-surface-2" onClick={() => playBlob(blob, `orig:${u.id}`)}>
            <Play className={clsx('size-3.5', playingKey === `orig:${u.id}` && 'text-accent')} />
          </button>
        )}
      </div>
      {u.status === 'pending' && (
        <div className="flex items-start gap-2">
          <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-accent" />
          <div className="text-lg leading-snug text-fg/70">{u.quick || 'Translating…'}</div>
        </div>
      )}
      {u.status === 'error' && (
        <div className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{u.error}</span>
          {blob && (
            <button type="button" onClick={() => retry(u)} className="flex items-center gap-1 text-accent">
              <RotateCcw className="size-3.5" /> Retry
            </button>
          )}
        </div>
      )}
      {u.status === 'done' && (
        <>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xl font-medium leading-snug">{u.transcript}</div>
              {u.transliteration && <div className="mt-0.5 text-sm italic text-muted">{u.transliteration}</div>}
            </div>
            <SpeakButton text={u.transcript ?? ''} voice={t.voice} id={`utt:${u.id}`} />
          </div>
          <div className="mt-2 text-[15px] text-teal">{u.translation}</div>
          {!!u.suggestions?.length && (
            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Tap to reply</div>
              {u.suggestions.map((sg, i) => {
                const key = `sug:${u.id}:${i}`;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => chooseSuggestion(u, i)}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
                      u.chosen === i ? 'border-accent/50 bg-accent/10' : 'border-line bg-surface-2 hover:border-accent/30',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-medium">{sg.text}</div>
                      {sg.transliteration && <div className="text-xs italic text-muted">{sg.transliteration}</div>}
                      <div className="text-xs text-muted">{sg.meaning}</div>
                    </div>
                    <Volume2 className={clsx('size-4 shrink-0', playingKey === key ? 'text-accent' : 'text-muted')} />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MyCard({ u }: { u: Utterance }) {
  const voice = useSettings((s) => s.translator.voice);
  return (
    <div className="ml-8 rounded-2xl bg-teal/10 p-4">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted">
        <span>You → {u.language}</span>
        <span className="flex-1" />
        {u.cost != null && <span className="tabular-nums">{formatCost(u.cost)}</span>}
      </div>
      {u.status === 'pending' && (
        <div className="flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" /> Translating…
        </div>
      )}
      {u.status === 'error' && <div className="text-sm text-danger">{u.error}</div>}
      {u.status === 'done' && (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-xl font-medium leading-snug">{u.translation}</div>
            {u.transliteration && <div className="text-sm italic text-muted">{u.transliteration}</div>}
            <div className="mt-1 text-sm text-muted">{u.transcript}</div>
          </div>
          <SpeakButton text={u.translation ?? ''} voice={voice} id={`utt:${u.id}`} size="md" />
        </div>
      )}
    </div>
  );
}
