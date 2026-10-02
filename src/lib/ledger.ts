import { db, uid, type LedgerEntry } from './db';
import { getSettings } from './store';

const FEATURES: [RegExp, string][] = [
  [/^#\/chat/, 'Chat'],
  [/^#\/translator/, 'Translator'],
  [/^#\/learn/, 'Teacher'],
  [/^#\/accent/, 'Accent'],
  [/^#\/(settings|models)/, 'Settings'],
];

export const currentFeature = () => FEATURES.find(([re]) => re.test(location.hash))?.[1] ?? 'Other';

export function record(e: Omit<LedgerEntry, 'id' | 'ts' | 'feature'> & { feature?: string }) {
  const entry: LedgerEntry = { id: uid(), ts: Date.now(), feature: e.feature ?? currentFeature(), ...e };
  db.ledger.add(entry).catch(() => {});
  if (entry.cost == null && entry.genId && entry.kind !== 'tts') resolveLater(entry.id, entry.genId);
}

function resolveLater(id: string, genId: string, delays = [4000, 15000, 60000]) {
  const [d, ...rest] = delays;
  if (d == null) return;
  setTimeout(async () => {
    try {
      const r = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(genId)}`, {
        headers: { Authorization: `Bearer ${getSettings().apiKey}` },
      });
      const j = r.ok ? await r.json() : null;
      const cost = j?.data?.total_cost;
      if (typeof cost === 'number') await db.ledger.update(id, { cost });
      else resolveLater(id, genId, rest);
    } catch {
      resolveLater(id, genId, rest);
    }
  }, d);
}
