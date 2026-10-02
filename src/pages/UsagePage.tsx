import { useLiveQuery } from 'dexie-react-hooks';
import { AudioLines, Download, ImageIcon, MessageSquare, Trash2, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, PageHeader, Segmented } from '../components/ui';
import { fetchKey } from '../lib/api';
import { db, type LedgerEntry } from '../lib/db';
import { formatCost, shortName } from '../lib/models';
import { download } from '../lib/text';

type Range = 'day' | 'week' | 'month' | 'all';
const DAY = 86400_000;
const since: Record<Range, () => number> = {
  day: () => new Date().setHours(0, 0, 0, 0),
  week: () => Date.now() - 7 * DAY,
  month: () => Date.now() - 30 * DAY,
  all: () => 0,
};
const KIND_ICON = { chat: MessageSquare, tts: Volume2, stt: AudioLines, image: ImageIcon };
const sum = (l: LedgerEntry[]) => l.reduce((a, e) => a + (e.cost ?? 0), 0);

function groupBy(l: LedgerEntry[], key: (e: LedgerEntry) => string) {
  const m = new Map<string, { cost: number; n: number }>();
  for (const e of l) {
    const k = key(e);
    const cur = m.get(k) ?? { cost: 0, n: 0 };
    cur.cost += e.cost ?? 0;
    cur.n++;
    m.set(k, cur);
  }
  return [...m.entries()].sort((a, b) => b[1].cost - a[1].cost);
}

function Bars({ rows, label }: { rows: [string, { cost: number; n: number }][]; label: (k: string) => string }) {
  const max = Math.max(...rows.map(([, v]) => v.cost), 1e-9);
  return (
    <div className="space-y-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate">{label(k)}</span>
            <span className="shrink-0 tabular-nums text-muted">
              {v.n} · <span className="text-fg">{formatCost(v.cost)}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-3">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (v.cost / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function UsagePage() {
  const all = useLiveQuery(() => db.ledger.orderBy('ts').reverse().toArray(), []) ?? [];
  const [range, setRange] = useState<Range>('week');
  const [keyUsage, setKeyUsage] = useState<number | null>(null);
  useEffect(() => {
    fetchKey()
      .then((k) => setKeyUsage(k.data.usage))
      .catch(() => {});
  }, []);

  const inRange = useMemo(() => {
    const t = since[range]();
    return all.filter((e) => e.ts >= t);
  }, [all, range]);
  const totals = useMemo(() => (['day', 'week', 'month', 'all'] as Range[]).map((r) => sum(all.filter((e) => e.ts >= since[r]()))), [all]);
  const unpriced = inRange.filter((e) => e.cost == null).length;

  const exportCsv = () => {
    const rows = [['time', 'feature', 'kind', 'model', 'cost_usd', 'tokens_in', 'tokens_out', 'chars', 'generation_id']];
    for (const e of all) rows.push([new Date(e.ts).toISOString(), e.feature, e.kind, e.model, e.cost?.toString() ?? '', String(e.tokensIn ?? ''), String(e.tokensOut ?? ''), String(e.chars ?? ''), e.genId ?? '']);
    download(new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }), 'openrouter-usage.csv');
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Usage"
        subtitle="What each request cost, as reported by OpenRouter"
        actions={
          <>
            <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv} disabled={!all.length}>
              CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 className="size-3.5" />}
              disabled={!all.length}
              onClick={() => confirm('Clear the usage history on this device?') && db.ledger.clear()}
            >
              Clear
            </Button>
          </>
        }
      />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 p-4 pb-10">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {['Today', '7 days', '30 days', 'All time'].map((label, i) => (
              <Card key={label} className="p-3">
                <div className="text-xs text-muted">{label}</div>
                <div className="mt-1 text-lg font-semibold tabular-nums">{formatCost(totals[i]) || '$0'}</div>
              </Card>
            ))}
          </div>
          {keyUsage != null && (
            <p className="px-1 text-xs text-muted">
              OpenRouter reports <span className="text-fg">${keyUsage.toFixed(3)}</span> spent with this key in total, including use from other apps and before this log started.
            </p>
          )}

          {!all.length ? (
            <Empty icon={<MessageSquare className="size-6" />} title="No requests yet">
              Every request this app makes is logged here with its cost.
            </Empty>
          ) : (
            <>
              <Segmented
                value={range}
                onChange={setRange}
                className="w-full"
                options={[
                  { value: 'day', label: 'Today' },
                  { value: 'week', label: '7 days' },
                  { value: 'month', label: '30 days' },
                  { value: 'all', label: 'All' },
                ]}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <div className="mb-3 text-sm font-semibold">By feature</div>
                  <Bars rows={groupBy(inRange, (e) => e.feature)} label={(k) => k} />
                </Card>
                <Card>
                  <div className="mb-3 text-sm font-semibold">By model</div>
                  <Bars rows={groupBy(inRange, (e) => e.model.replace(/-\d{8}$/, '')).slice(0, 8)} label={(k) => shortName(k)} />
                </Card>
              </div>
              {unpriced > 0 && (
                <p className="px-1 text-xs text-muted">
                  {unpriced} request{unpriced === 1 ? '' : 's'} without a price. OpenRouter doesn't report the cost of text-to-speech, so voice requests aren't included in the totals.
                </p>
              )}
              <Card className="p-0">
                <div className="border-b border-line px-4 py-3 text-sm font-semibold">Requests</div>
                <div className="divide-y divide-line">
                  {inRange.slice(0, 300).map((e) => {
                    const Icon = KIND_ICON[e.kind];
                    return (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Icon className="size-4 shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{shortName(e.model.replace(/-\d{8}$/, ''))}</div>
                          <div className="text-[11px] text-muted">
                            {e.feature} · {new Date(e.ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                            {e.tokensIn != null && ` · ${e.tokensIn}→${e.tokensOut ?? 0} tok`}
                            {e.chars != null && ` · ${e.chars} chars`}
                          </div>
                        </div>
                        <span className="shrink-0 text-sm tabular-nums">{e.cost != null ? formatCost(e.cost) : <span className="text-xs text-muted">not reported</span>}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
