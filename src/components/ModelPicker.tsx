import clsx from 'clsx';
import { AudioLines, Brain, Check, ChevronDown, Eye, FileText, Film, Globe, ImageIcon, Mic, Search, Star, Volume2, Wrench } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  arenaScore,
  formatContext,
  formatTokens,
  intelligence,
  popularity,
  priceLabel,
  roleFilter,
  roleLabel,
  useCatalog,
  weeklyTokens,
  type ModelInfo,
} from '../lib/models';
import { useSettings, type ModelRole } from '../lib/store';
import { Badge, Chip, Segmented, Sheet, Spinner, inputCls } from './ui';

type Tab = 'popular' | 'favorites' | 'recent' | 'all';
type Sort = 'popular' | 'newest' | 'cheapest' | 'smartest' | 'context';
type Filter = 'image' | 'audio' | 'file' | 'video' | 'reasoning' | 'tools' | 'free';

const FILTERS: { id: Filter; label: string; icon: ReactNode }[] = [
  { id: 'image', label: 'Vision', icon: <Eye className="size-3.5" /> },
  { id: 'audio', label: 'Audio', icon: <Mic className="size-3.5" /> },
  { id: 'file', label: 'PDF', icon: <FileText className="size-3.5" /> },
  { id: 'video', label: 'Video', icon: <Film className="size-3.5" /> },
  { id: 'reasoning', label: 'Reasoning', icon: <Brain className="size-3.5" /> },
  { id: 'tools', label: 'Tools', icon: <Wrench className="size-3.5" /> },
  { id: 'free', label: 'Free', icon: null },
];

const pass = (m: ModelInfo, f: Filter) => {
  if (f === 'free') return m.free;
  if (f === 'reasoning') return m.params.includes('reasoning');
  if (f === 'tools') return m.params.includes('tools');
  return m.input.includes(f);
};

export function CapIcons({ m }: { m: ModelInfo }) {
  const items: [boolean, ReactNode, string][] = [
    [m.input.includes('image'), <Eye key="i" className="size-3.5" />, 'Reads images'],
    [m.input.includes('audio'), <Mic key="a" className="size-3.5" />, 'Hears audio'],
    [m.input.includes('file'), <FileText key="f" className="size-3.5" />, 'Reads PDFs'],
    [m.input.includes('video'), <Film key="v" className="size-3.5" />, 'Watches video'],
    [m.output.includes('image'), <ImageIcon key="io" className="size-3.5" />, 'Makes images'],
    [m.output.includes('speech') || m.output.includes('audio'), <Volume2 key="s" className="size-3.5" />, 'Speaks'],
    [m.output.includes('transcription'), <AudioLines key="t" className="size-3.5" />, 'Transcribes'],
    [m.params.includes('reasoning'), <Brain key="r" className="size-3.5" />, 'Reasoning'],
    [m.params.includes('tools'), <Wrench key="w" className="size-3.5" />, 'Tool use'],
    [(m.pricing.webSearch ?? 0) > 0, <Globe key="g" className="size-3.5" />, 'Native web search'],
  ];
  return (
    <span className="flex items-center gap-1 text-muted">
      {items
        .filter(([on]) => on)
        .map(([, icon, title], i) => (
          <span key={i} title={title}>
            {icon}
          </span>
        ))}
    </span>
  );
}

export function ModelList({
  role,
  selected,
  onSelect,
  onInspect,
  className,
}: {
  role: ModelRole;
  selected?: string;
  onSelect: (id: string) => void;
  onInspect?: (m: ModelInfo) => void;
  className?: string;
}) {
  const { models, stats, loading } = useCatalog();
  const { favorites, recent, toggleFavorite } = useSettings();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('popular');
  const [sort, setSort] = useState<Sort>('popular');
  const [filters, setFilters] = useState<Filter[]>([]);

  const list = useMemo(() => {
    let l = models.filter(roleFilter[role]);
    if (tab === 'favorites') l = favorites.map((id) => l.find((m) => m.id === id)).filter(Boolean) as ModelInfo[];
    if (tab === 'recent') l = (recent[role] ?? []).map((id) => l.find((m) => m.id === id)).filter(Boolean) as ModelInfo[];
    for (const f of filters) l = l.filter((m) => pass(m, f));
    const needle = q.trim().toLowerCase();
    if (needle) l = l.filter((m) => `${m.id} ${m.name} ${m.providerName}`.toLowerCase().includes(needle));
    const effSort: Sort = tab === 'popular' ? (sort === 'popular' ? 'popular' : sort) : tab === 'all' ? sort : 'popular';
    if (tab === 'favorites' || tab === 'recent') return l;
    const by: Record<Sort, (a: ModelInfo, b: ModelInfo) => number> = {
      popular: (a, b) => popularity(b, role, stats) - popularity(a, role, stats) || b.created - a.created,
      newest: (a, b) => b.created - a.created,
      cheapest: (a, b) => Number(a.dynamic) - Number(b.dynamic) || a.pricing.prompt + a.pricing.completion - (b.pricing.prompt + b.pricing.completion),
      smartest: (a, b) => (intelligence(b, stats) ?? -1) - (intelligence(a, stats) ?? -1),
      context: (a, b) => b.context - a.context,
    };
    l = [...l].sort(by[effSort]);
    if (tab === 'popular' && !needle && !filters.length) l = l.slice(0, role === 'chat' ? 40 : 30);
    return l.slice(0, 250);
  }, [models, role, tab, favorites, recent, filters, q, sort, stats]);

  return (
    <div className={clsx('flex min-h-0 flex-col', className)}>
      <div className="space-y-3 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" className={clsx(inputCls, 'pl-9')} />
        </div>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          className="w-full"
          options={[
            { value: 'popular', label: 'Popular' },
            { value: 'favorites', label: 'Favorites' },
            { value: 'recent', label: 'Recent' },
            { value: 'all', label: 'All' },
          ]}
        />
        {role === 'chat' && (
          <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {FILTERS.map((f) => (
              <Chip
                key={f.id}
                active={filters.includes(f.id)}
                onClick={() => setFilters((x) => (x.includes(f.id) ? x.filter((y) => y !== f.id) : [...x, f.id]))}
              >
                {f.icon}
                {f.label}
              </Chip>
            ))}
          </div>
        )}
        {(tab === 'all' || tab === 'popular') && (
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {list.length} model{list.length === 1 ? '' : 's'}
              {loading && <Spinner className="ml-2 inline size-3" />}
            </span>
            <label className="flex items-center gap-1">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-md bg-surface-2 px-1.5 py-1 text-xs text-fg outline-none">
                <option value="popular">Popular</option>
                <option value="newest">Newest</option>
                <option value="cheapest">Cheapest</option>
                {role === 'chat' && <option value="smartest">Smartest</option>}
                {role === 'chat' && <option value="context">Context</option>}
              </select>
            </label>
          </div>
        )}
      </div>
      <div className="-mx-2 space-y-0.5">
        {list.map((m) => {
          const iq = intelligence(m, stats);
          const tokens = weeklyTokens(m, stats);
          const elo = role === 'tts' ? arenaScore(m, stats, 'text-to-speech') : role === 'image' ? arenaScore(m, stats, 'image') : undefined;
          const fav = favorites.includes(m.id);
          return (
            <div
              key={m.id}
              className={clsx(
                'group flex cursor-pointer items-start gap-2 rounded-xl px-2 py-2.5 transition',
                selected === m.id ? 'bg-accent/10' : 'hover:bg-surface-2',
              )}
              onClick={() => onSelect(m.id)}
            >
              <button
                type="button"
                aria-label={fav ? 'Unfavorite' : 'Favorite'}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(m.id);
                }}
                className={clsx('mt-0.5 rounded-md p-0.5', fav ? 'text-warn' : 'text-muted/50 hover:text-muted')}
              >
                <Star className="size-4" fill={fav ? 'currentColor' : 'none'} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{m.name}</span>
                  {selected === m.id && <Check className="size-4 shrink-0 text-accent" />}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <span className="truncate">{m.providerName}</span>
                  <CapIcons m={m} />
                  {m.context > 0 && role === 'chat' && <span>{formatContext(m.context)} ctx</span>}
                  {m.voices.length > 0 && <span>{m.voices.length} voices</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs tabular-nums text-fg/80">{priceLabel(m)}</span>
                <span className="flex gap-1">
                  {iq != null && (
                    <Badge tone="accent" className="tabular-nums">
                      IQ {iq.toFixed(0)}
                    </Badge>
                  )}
                  {elo != null && <Badge tone="teal">Elo {Math.round(elo)}</Badge>}
                  {tokens > 0 && tab === 'popular' && <Badge className="tabular-nums">{formatTokens(tokens)}/wk</Badge>}
                </span>
                {onInspect && (
                  <button
                    type="button"
                    className="text-[11px] text-accent opacity-0 transition group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      onInspect(m);
                    }}
                  >
                    Details
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!list.length && (
          <div className="py-10 text-center text-sm text-muted">
            {loading ? 'Loading models…' : tab === 'favorites' ? 'No favorites yet — tap ☆ on any model.' : 'No models match.'}
          </div>
        )}
      </div>
    </div>
  );
}

export function ModelPicker({
  role,
  value,
  onChange,
  open,
  onClose,
}: {
  role: ModelRole;
  value?: string;
  onChange: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  const pushRecent = useSettings((s) => s.pushRecent);
  return (
    <Sheet open={open} onClose={onClose} title={roleLabel[role]}>
      <ModelList
        role={role}
        selected={value}
        onSelect={(id) => {
          pushRecent(role, id);
          onChange(id);
          onClose();
        }}
      />
    </Sheet>
  );
}

export function ModelButton({
  role,
  value,
  onChange,
  className,
  compact,
  placeholder = 'Choose a model',
}: {
  role: ModelRole;
  value: string;
  onChange: (id: string) => void;
  className?: string;
  compact?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const m = useCatalog((s) => s.byId.get(value));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={clsx(
          'inline-flex min-w-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-left transition hover:bg-surface-2',
          compact ? 'h-8 text-[13px]' : 'h-10 w-full text-sm',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {m?.name ?? (value ? value.split('/').pop() : <span className="text-muted">{placeholder}</span>)}
          {!compact && m && <span className="ml-2 text-xs text-muted">{m.providerName}</span>}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted" />
      </button>
      <ModelPicker role={role} value={value} onChange={onChange} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
