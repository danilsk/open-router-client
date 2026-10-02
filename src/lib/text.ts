export function stripForSpeech(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, '$2')
    .replace(/^>\s?/gm, '')
    .replace(/\|/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function chunkText(text: string, max = 600): string[] {
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]*[\s\n]*/g) ?? [text];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    cur += s;
    while (cur.length > max * 1.5) {
      out.push(cur.slice(0, max).trim());
      cur = cur.slice(max);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export const normWord = (w: string) =>
  w
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '');

export interface DiffToken {
  word: string;
  ok: boolean;
  heard?: string;
}

export function diffWords(ref: string, hyp: string): { tokens: DiffToken[]; score: number } {
  const a = ref.split(/\s+/).filter(Boolean);
  const b = hyp.split(/\s+/).filter(Boolean);
  const A = a.map(normWord);
  const B = b.map(normWord);
  const dp = Array.from({ length: A.length + 1 }, () => new Array<number>(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--)
    for (let j = B.length - 1; j >= 0; j--)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length) {
    if (j < B.length && A[i] === B[j]) {
      tokens.push({ word: a[i], ok: true });
      i++;
      j++;
    } else if (j < B.length && dp[i][j + 1] > dp[i + 1][j]) {
      j++;
    } else {
      tokens.push({ word: a[i], ok: false, heard: j < B.length && dp[i + 1][j + 1] === dp[i][j] ? b[j] : undefined });
      i++;
    }
  }
  const score = A.length ? Math.round((dp[0][0] / Math.max(A.length, B.length)) * 100) : 0;
  return { tokens, score };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function timeAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
