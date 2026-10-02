import { ExternalLink, KeyRound, LogIn } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { verifyKey } from '../lib/api';
import { loadCatalog } from '../lib/models';
import { startLogin } from '../lib/pkce';
import { useSettings } from '../lib/store';
import { Button, inputCls } from './ui';

export function KeyGate({ children }: { children: ReactNode }) {
  const apiKey = useSettings((s) => s.apiKey);
  if (apiKey) return <>{children}</>;
  return <Onboarding />;
}

function Onboarding() {
  const set = useSettings((s) => s.set);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    const k = key.trim();
    if (!k) return;
    setBusy(true);
    setErr('');
    try {
      await verifyKey(k);
      set({ apiKey: k });
      loadCatalog(true);
    } catch (e) {
      setErr(`That key did not work: ${(e as Error).message}`);
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="mx-auto mb-6 size-16 rounded-2xl shadow-lg" />
        <h1 className="text-center text-2xl font-bold tracking-tight">OpenRouter Client</h1>
        <p className="mt-2 text-center text-sm text-muted">Chat, voice, live translation and language practice on hundreds of models.</p>
        <div className="mt-8 space-y-3">
          <Button variant="primary" size="lg" className="w-full" icon={<LogIn className="size-4" />} onClick={() => startLogin()}>
            Sign in with OpenRouter
          </Button>
          <div className="flex items-center gap-3 py-1 text-xs text-muted">
            <div className="h-px flex-1 bg-line" />
            or paste a key
            <div className="h-px flex-1 bg-line" />
          </div>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder="sk-or-v1-…"
              className={inputCls + ' pl-9'}
            />
          </div>
          {err && <div className="text-sm text-danger">{err}</div>}
          <Button variant="subtle" className="w-full" loading={busy} disabled={!key.trim()} onClick={save}>
            Save key
          </Button>
          <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-xs text-accent">
            Get a key at openrouter.ai <ExternalLink className="size-3" />
          </a>
        </div>
        <p className="mt-8 text-center text-xs leading-relaxed text-muted">
          Your key stays on this device and is sent only to openrouter.ai. There is no server. Anyone with access to this browser can use it.
        </p>
      </div>
    </div>
  );
}
