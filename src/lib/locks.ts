export function holdLock(name: string): () => void {
  if (!navigator.locks) return () => {};
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  navigator.locks.request(name, () => held).catch(() => {});
  return release;
}

export async function heldLocks(): Promise<Set<string>> {
  if (!navigator.locks) return new Set();
  const q = await navigator.locks.query();
  return new Set((q.held ?? []).map((l) => l.name ?? ''));
}
