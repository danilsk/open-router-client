export function parseLoose<T = any>(text: string): T | null {
  if (!text) return null;
  let s = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const tryParse = (x: string) => {
    try {
      return JSON.parse(x);
    } catch {
      return undefined;
    }
  };
  let v = tryParse(s);
  if (v === undefined) {
    const start = s.search(/[[{]/);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      s = s.slice(start, end + 1);
      v = tryParse(s) ?? tryParse(s.replace(/,\s*([}\]])/g, '$1'));
    }
  }
  if (Array.isArray(v) && v.length === 1 && typeof v[0] === 'object') v = v[0];
  return (v ?? null) as T | null;
}
