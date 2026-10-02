import { Download, ExternalLink, LogOut, RefreshCw, Smartphone, Trash2, Upload, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ModelButton } from '../components/ModelPicker';
import { VoiceButton } from '../components/VoicePicker';
import { Button, Card, Field, PageHeader, Segmented, Select, Spinner } from '../components/ui';
import { fetchCredits, fetchKey } from '../lib/api';
import { db, exportAll, importAll } from '../lib/db';
import { installPrompt } from '../lib/install';
import { LANGUAGES } from '../lib/languages';
import { loadCatalog, useCatalog } from '../lib/models';
import { useSettings, type SearchEngine } from '../lib/store';
import { download, timeAgo } from '../lib/text';
import { toast, toastError } from '../lib/toast';

export default function SettingsPage() {
  const s = useSettings();
  const { fetchedAt, loading, models } = useCatalog();
  const [balance, setBalance] = useState<{ credits?: number; used?: number; keyUsage?: number; limit?: number | null } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const standalone = matchMedia('(display-mode: standalone)').matches;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    Promise.allSettled([fetchCredits(), fetchKey()]).then(([c, k]) => {
      setBalance({
        credits: c.status === 'fulfilled' ? c.value.data.total_credits : undefined,
        used: c.status === 'fulfilled' ? c.value.data.total_usage : undefined,
        keyUsage: k.status === 'fulfilled' ? k.value.data.usage : undefined,
        limit: k.status === 'fulfilled' ? k.value.data.limit : undefined,
      });
    });
  }, []);

  const remaining = balance?.credits != null && balance.used != null ? balance.credits - balance.used : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" />
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-4 p-4 pb-10">
          <Card className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-accent/12 text-accent">
                <Wallet className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">OpenRouter account</div>
                <div className="text-xs text-muted">
                  {!balance ? (
                    <Spinner className="inline size-3" />
                  ) : remaining != null ? (
                    <>
                      <span className="text-fg">${remaining.toFixed(2)}</span> credits left · ${(balance.keyUsage ?? 0).toFixed(2)} used by this key
                    </>
                  ) : (
                    `Key usage $${(balance.keyUsage ?? 0).toFixed(2)}`
                  )}
                </div>
              </div>
              <a href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent">
                Top up <ExternalLink className="size-3" />
              </a>
            </div>
            <Link to="/usage" className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm hover:bg-surface-3">
              <span>Cost of each request</span>
              <span className="text-accent">View history →</span>
            </Link>
            <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 font-mono text-xs">
              <span className="flex-1 truncate">{s.apiKey.slice(0, 12)}••••••••{s.apiKey.slice(-4)}</span>
              <Button
                size="sm"
                variant="ghost"
                icon={<LogOut className="size-3.5" />}
                onClick={() => confirm('Remove the key from this device?') && s.set({ apiKey: '' })}
              >
                Sign out
              </Button>
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="text-sm font-semibold">Default models</div>
            <Field label="Chat">
              <ModelButton role="chat" value={s.chatModel} onChange={(chatModel) => s.set({ chatModel })} />
            </Field>
            <Field label="Listening (audio understanding)" hint="Used by the translator, tutor and accent trainer unless they override it.">
              <ModelButton role="listen" value={s.listenModel} onChange={(listenModel) => s.set({ listenModel })} />
            </Field>
            <Field label="Transcription" hint="Fast speech-to-text for dictation and quick transcripts.">
              <ModelButton role="stt" value={s.sttModel} onChange={(sttModel) => s.set({ sttModel })} />
            </Field>
            <Field label="Voice (text-to-speech)">
              <VoiceButton value={s.voice} onChange={(voice) => s.set({ voice })} />
            </Field>
            <Field label="Image generation">
              <ModelButton role="image" value={s.imageModel} onChange={(imageModel) => s.set({ imageModel })} />
            </Field>
            <Field label="Dictation uses">
              <Segmented
                value={s.dictateWith}
                onChange={(dictateWith) => s.set({ dictateWith })}
                className="w-full"
                options={[
                  { value: 'stt', label: 'Transcription model' },
                  { value: 'listen', label: 'Listening model' },
                ]}
              />
            </Field>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>
                {models.length} models · updated {fetchedAt ? timeAgo(fetchedAt) : 'never'}
              </span>
              <Button size="sm" variant="ghost" loading={loading} icon={<RefreshCw className="size-3.5" />} onClick={() => loadCatalog(true)}>
                Refresh
              </Button>
            </div>
            <Link to="/models" className="block text-center text-sm text-accent">
              Browse all models →
            </Link>
          </Card>

          <Card className="space-y-4">
            <div className="text-sm font-semibold">Language & search</div>
            <Field label="My language" hint="Translations and explanations use this language.">
              <Select value={s.myLanguage} onChange={(myLanguage) => s.set({ myLanguage })} options={LANGUAGES.map((l) => ({ value: l.name, label: `${l.flag} ${l.name}` }))} />
            </Field>
            <Field label="Web search engine" hint="Auto uses the model's own search when it has one (Gemini, GPT, Claude, Grok), otherwise Exa. Exa is usually the cheapest.">
              <Select
                value={s.searchEngine}
                onChange={(v) => s.set({ searchEngine: v as SearchEngine })}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'native', label: "Model's own search" },
                  { value: 'exa', label: 'Exa' },
                  { value: 'parallel', label: 'Parallel' },
                  { value: 'perplexity', label: 'Perplexity' },
                ]}
              />
            </Field>
            <Field label={`Results per search · ${s.searchMaxResults}`}>
              <input
                type="range"
                min={1}
                max={10}
                value={s.searchMaxResults}
                onChange={(e) => s.set({ searchMaxResults: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <div className="text-sm font-semibold">Appearance</div>
            <Segmented
              value={s.theme}
              onChange={(theme) => s.set({ theme })}
              className="w-full"
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
            {!standalone && (
              <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-sm">
                <Smartphone className="mt-0.5 size-4 shrink-0 text-muted" />
                <div className="flex-1">
                  {ios ? 'To install: tap Share, then “Add to Home Screen”.' : 'Install this app for a full-screen experience and offline start.'}
                </div>
                {!ios && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      const d = installPrompt();
                      if (d) await d.prompt();
                      else toast('Use your browser menu → “Install app”.');
                    }}
                  >
                    Install
                  </Button>
                )}
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <div className="text-sm font-semibold">Your data</div>
            <p className="text-xs text-muted">Everything is stored only in this browser. Export to back up or move to another device.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" icon={<Download className="size-4" />} onClick={async () => download(await exportAll(), `openrouter-client-${new Date().toISOString().slice(0, 10)}.json`)}>
                Export
              </Button>
              <Button variant="outline" icon={<Upload className="size-4" />} onClick={() => importRef.current?.click()}>
                Import
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  await db.tts.clear();
                  toast('Voice cache cleared', 'success');
                }}
              >
                Clear voice cache
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 className="size-4" />}
                onClick={async () => {
                  if (!confirm('Delete ALL chats, courses, cards and history on this device?')) return;
                  await db.delete();
                  location.reload();
                }}
              >
                Delete everything
              </Button>
            </div>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  await importAll(f);
                  toast('Imported', 'success');
                } catch (err) {
                  toastError(err);
                }
              }}
            />
          </Card>
          <p className="px-2 text-center text-xs leading-relaxed text-muted">
            No server, no tracking. Your key and data stay in this browser and requests go straight to openrouter.ai.
          </p>
        </div>
      </div>
    </div>
  );
}
