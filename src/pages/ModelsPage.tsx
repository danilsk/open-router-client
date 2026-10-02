import { Check, Copy, MessageSquarePlus, Star } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CapIcons, ModelList } from '../components/ModelPicker';
import { voiceLabel } from '../components/VoicePicker';
import { Badge, Button, PageHeader, Segmented, Sheet } from '../components/ui';
import { newChat } from '../lib/chat';
import { db } from '../lib/db';
import {
  arenaScore,
  formatContext,
  formatTokens,
  intelligence,
  priceLabel,
  roleFilter,
  useCatalog,
  weeklyTokens,
  type ModelInfo,
} from '../lib/models';
import { useSettings, type ModelRole } from '../lib/store';
import { toast } from '../lib/toast';

const ROLES: { value: ModelRole; label: string }[] = [
  { value: 'chat', label: 'Chat' },
  { value: 'listen', label: 'Listening' },
  { value: 'tts', label: 'Voice' },
  { value: 'stt', label: 'Transcribe' },
  { value: 'image', label: 'Image' },
];

const defaultKey: Record<ModelRole, 'chatModel' | 'listenModel' | 'sttModel' | 'imageModel' | null> = {
  chat: 'chatModel',
  listen: 'listenModel',
  stt: 'sttModel',
  image: 'imageModel',
  tts: null,
};

export default function ModelsPage() {
  const [role, setRole] = useState<ModelRole>('chat');
  const [inspect, setInspect] = useState<ModelInfo | null>(null);
  const count = useCatalog((s) => s.models.filter(roleFilter[role]).length);
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Models" subtitle={`${count} available for ${ROLES.find((r) => r.value === role)?.label.toLowerCase()}`} />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-4">
          <Segmented value={role} onChange={setRole} options={ROLES} className="mb-4 w-full" />
          <ModelList key={role} role={role} onSelect={(id) => setInspect(useCatalog.getState().byId.get(id) ?? null)} onInspect={setInspect} />
        </div>
      </div>
      <ModelDetails m={inspect} role={role} onClose={() => setInspect(null)} />
    </div>
  );
}

function ModelDetails({ m, role, onClose }: { m: ModelInfo | null; role: ModelRole; onClose: () => void }) {
  const s = useSettings();
  const stats = useCatalog((x) => x.stats);
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);
  if (!m) return null;
  const iq = intelligence(m, stats);
  const tokens = weeklyTokens(m, stats);
  const key = defaultKey[role];
  const isDefault = key ? s[key] === m.id : s.voice.model === m.id;
  const fav = s.favorites.includes(m.id);
  const p = m.pricing;
  const rows: [string, string | undefined][] = [
    ['Price', priceLabel(m)],
    ['Input $/1M tokens', p.prompt > 0 ? `$${(p.prompt * 1e6).toFixed(3)}` : undefined],
    ['Output $/1M tokens', p.completion > 0 ? `$${(p.completion * 1e6).toFixed(3)}` : undefined],
    ['Audio input $/1M', p.audio ? `$${(p.audio * 1e6).toFixed(3)}` : undefined],
    ['Web search / request', p.webSearch ? `$${p.webSearch}` : undefined],
    ['Context', m.context ? formatContext(m.context) + ' tokens' : undefined],
    ['Max output', m.maxOutput ? formatContext(m.maxOutput) + ' tokens' : undefined],
    ['Input', m.input.join(', ')],
    ['Output', m.output.join(', ')],
    ['Intelligence index', iq != null ? iq.toFixed(1) : undefined],
    ['Tokens this week', tokens ? formatTokens(tokens) : undefined],
    ['Speech arena Elo', arenaScore(m, stats, 'text-to-speech')?.toFixed(0)],
    ['Realism Elo', arenaScore(m, stats, 'audiorealism')?.toFixed(0)],
    ['Image arena Elo', arenaScore(m, stats, 'image')?.toFixed(0)],
    ['Released', m.created ? new Date(m.created * 1000).toLocaleDateString() : undefined],
    ['Expires', m.expiration ?? undefined],
  ];
  return (
    <Sheet open onClose={onClose} title={m.name} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{m.providerName}</span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(m.id);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs"
          >
            {m.id} {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </button>
          <CapIcons m={m} />
        </div>
        {m.description && <p className="whitespace-pre-line text-sm leading-relaxed">{m.description}</p>}
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {rows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm">
                <span className="text-muted">{k}</span>
                <span className="text-right tabular-nums">{v}</span>
              </div>
            ))}
        </div>
        {m.params.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {m.params.map((x) => (
              <Badge key={x}>{x}</Badge>
            ))}
          </div>
        )}
        {m.voices.length > 0 && (
          <div>
            <div className="mb-1 text-[13px] font-medium">{m.voices.length} voices</div>
            <div className="flex flex-wrap gap-1">
              {m.voices.slice(0, 120).map((v) => {
                const l = voiceLabel(v);
                return (
                  <Badge key={v}>
                    {l.name}
                    {l.group && <span className="opacity-60">· {l.group}</span>}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" icon={<Star className="size-4" fill={fav ? 'currentColor' : 'none'} />} onClick={() => s.toggleFavorite(m.id)}>
            {fav ? 'Favorited' : 'Favorite'}
          </Button>
          <Button
            variant="subtle"
            disabled={isDefault}
            onClick={() => {
              if (key) s.set({ [key]: m.id });
              else s.set({ voice: { model: m.id, voice: m.voices[0] } });
              toast('Default updated', 'success');
            }}
          >
            {isDefault ? 'Current default' : 'Make default'}
          </Button>
          {roleFilter.chat(m) && (
            <Button
              variant="primary"
              icon={<MessageSquarePlus className="size-4" />}
              onClick={async () => {
                const c = newChat({ model: m.id });
                await db.chats.add(c);
                nav(`/chat/${c.id}`);
              }}
            >
              Chat with it
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
