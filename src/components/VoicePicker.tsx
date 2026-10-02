import clsx from 'clsx';
import { Check, ChevronDown, Loader2, Play, Square, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useCatalog } from '../lib/models';
import { BROWSER_VOICE, type VoiceSel } from '../lib/store';
import { browserVoices, speak, stopSpeaking, useSpeech } from '../lib/tts';
import { ModelButton } from './ModelPicker';
import { Field, Sheet, inputCls } from './ui';

export function voiceLabel(v: string): { name: string; group: string } {
  let m = /^([a-z]{2}-[A-Z]{2})-([^:]+)/.exec(v);
  if (m) return { name: m[2], group: m[1] };
  m = /^aura-2-([a-z]+)-([a-z]{2})$/.exec(v) ?? /^flux-([a-z]+)-([a-z]{2})$/.exec(v);
  if (m) return { name: m[1][0].toUpperCase() + m[1].slice(1), group: m[2] };
  m = /^([abefhijpz])([fm])_(.+)$/.exec(v);
  if (m) {
    const langs: Record<string, string> = { a: 'US English', b: 'UK English', e: 'Spanish', f: 'French', h: 'Hindi', i: 'Italian', j: 'Japanese', p: 'Portuguese', z: 'Chinese' };
    return { name: `${m[3][0].toUpperCase()}${m[3].slice(1)} ${m[2] === 'f' ? '♀' : '♂'}`, group: langs[m[1]] ?? m[1] };
  }
  m = /^(en|gb|fr)_([a-z]+)_(.+)$/.exec(v);
  if (m) return { name: `${m[2]} · ${m[3]}`, group: m[1] === 'gb' ? 'UK English' : m[1] === 'en' ? 'US English' : 'French' };
  m = /^([A-Z][a-z]+)_(.+)$/.exec(v);
  if (m) return { name: m[2].replace(/_/g, ' '), group: m[1] };
  return { name: v, group: '' };
}

const sample = (lang?: string) =>
  ({
    es: 'Hola, ¿cómo estás? Encantado de conocerte.',
    ka: 'გამარჯობა, როგორ ხარ?',
    fr: 'Bonjour, comment ça va ?',
    de: 'Hallo, wie geht es dir?',
  })[lang?.slice(0, 2) ?? ''] ?? 'Hi there! This is how I sound. Nice to meet you.';

const styleable = (model: string) => model.startsWith('google/') || model.startsWith('openai/');

export function VoicePicker({
  value,
  onChange,
  open,
  onClose,
  sampleText,
}: {
  value: VoiceSel;
  onChange: (v: VoiceSel) => void;
  open: boolean;
  onClose: () => void;
  sampleText?: string;
}) {
  const m = useCatalog((s) => s.byId.get(value.model));
  const { playingKey, loadingKey } = useSpeech();
  const [q, setQ] = useState('');
  const [bVoices, setBVoices] = useState<SpeechSynthesisVoice[]>(browserVoices());
  useEffect(() => {
    if (typeof speechSynthesis === 'undefined') return;
    const upd = () => setBVoices(browserVoices());
    speechSynthesis.addEventListener('voiceschanged', upd);
    return () => speechSynthesis.removeEventListener('voiceschanged', upd);
  }, []);

  const isBrowser = value.model === BROWSER_VOICE;
  const voices = useMemo(() => {
    const raw = isBrowser ? bVoices.map((v) => ({ id: v.name, name: v.name, group: v.lang })) : (m?.voices ?? []).map((id) => ({ id, ...voiceLabel(id) }));
    const needle = q.trim().toLowerCase();
    const f = needle ? raw.filter((v) => `${v.id} ${v.group}`.toLowerCase().includes(needle)) : raw;
    const groups = new Map<string, typeof f>();
    for (const v of f) groups.set(v.group, [...(groups.get(v.group) ?? []), v]);
    return [...groups.entries()];
  }, [isBrowser, bVoices, m, q]);

  const preview = (voice: string) => {
    const key = `preview:${voice}`;
    if (playingKey === key) return stopSpeaking();
    const lang = isBrowser ? bVoices.find((b) => b.name === voice)?.lang : voiceLabel(voice).group;
    speak(sampleText ?? sample(lang), { ...value, voice }, key);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Voice">
      <div className="space-y-4">
        <Field label="Voice model">
          <div className="flex gap-2">
            <ModelButton
              role="tts"
              value={isBrowser ? '' : value.model}
              placeholder="Using the device voice — pick a model"
              onChange={(id) => {
                const nm = useCatalog.getState().byId.get(id);
                onChange({ ...value, model: id, voice: nm?.voices[0] });
              }}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => onChange({ ...value, model: BROWSER_VOICE, voice: bVoices[0]?.name })}
              className={clsx('rounded-xl border px-3 text-sm', isBrowser ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-muted')}
            >
              Device
            </button>
          </div>
        </Field>
        {styleable(value.model) && (
          <Field label="Speaking style" hint="For example: warm and friendly, slow and clear, British accent, whispering.">
            <input className={inputCls} value={value.style ?? ''} placeholder="Natural" onChange={(e) => onChange({ ...value, style: e.target.value || undefined })} />
          </Field>
        )}
        <Field label={`Playback speed · ${(value.speed ?? 1).toFixed(2)}×`}>
          <input
            type="range"
            min={0.5}
            max={1.5}
            step={0.05}
            value={value.speed ?? 1}
            onChange={(e) => onChange({ ...value, speed: Number(e.target.value) })}
            className="w-full accent-[var(--accent)]"
          />
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-medium">Voices</div>
            <input className={clsx(inputCls, 'h-8 w-40 py-1 text-xs')} placeholder="Filter (e.g. en-GB)" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!voices.length && <div className="py-6 text-center text-sm text-muted">This model has a single default voice.</div>}
          <div className="space-y-3">
            {voices.map(([group, vs]) => (
              <div key={group}>
                {group && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{group}</div>}
                <div className="grid grid-cols-2 gap-1.5">
                  {vs.map((v) => {
                    const key = `preview:${v.id}`;
                    const active = value.voice === v.id;
                    return (
                      <div
                        key={v.id}
                        onClick={() => onChange({ ...value, voice: v.id })}
                        className={clsx(
                          'flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 text-sm transition',
                          active ? 'border-accent/50 bg-accent/10' : 'border-line hover:bg-surface-2',
                        )}
                      >
                        <button
                          type="button"
                          aria-label="Preview"
                          onClick={(e) => {
                            e.stopPropagation();
                            preview(v.id);
                          }}
                          className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted hover:text-fg"
                        >
                          {loadingKey === key ? <Loader2 className="size-3.5 animate-spin" /> : playingKey === key ? <Square className="size-3" /> : <Play className="size-3.5" />}
                        </button>
                        <span className="min-w-0 flex-1 truncate">{v.name}</span>
                        {active && <Check className="size-4 shrink-0 text-accent" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

export function VoiceButton({ value, onChange, className, sampleText }: { value: VoiceSel; onChange: (v: VoiceSel) => void; className?: string; sampleText?: string }) {
  const [open, setOpen] = useState(false);
  const m = useCatalog((s) => s.byId.get(value.model));
  const label = value.model === BROWSER_VOICE ? 'Device voice' : (m?.name ?? value.model.split('/').pop());
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx('inline-flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-left text-sm hover:bg-surface-2', className)}
      >
        <Volume2 className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate">
          {label}
          {value.voice && <span className="ml-2 text-xs text-muted">{voiceLabel(value.voice).name}</span>}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </button>
      <VoicePicker value={value} onChange={onChange} open={open} onClose={() => setOpen(false)} sampleText={sampleText} />
    </>
  );
}
