import clsx from 'clsx';
import { AlertTriangle, AudioLines, Brain, Check, ChevronRight, Copy, Download, FileText, Globe, Loader2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import { Markdown } from '../../components/Markdown';
import { SpeakButton } from '../../components/SpeakButton';
import { AutoTextarea, Button, IconButton, inputCls } from '../../components/ui';
import { useLive } from '../../lib/chat';
import { dataUrlToBlob } from '../../lib/audio';
import { db, type Attachment, type Message } from '../../lib/db';
import { transcribe } from '../../lib/stt';
import { toastError } from '../../lib/toast';
import { formatCost, shortName } from '../../lib/models';
import type { VoiceSel } from '../../lib/store';
import { download } from '../../lib/text';

function Reasoning({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <Brain className="size-3.5" />
        {live ? 'Thinking…' : 'Reasoning'}
        <ChevronRight className={clsx('size-3 transition', open && 'rotate-90')} />
      </button>
      {open && <div className="mt-2 whitespace-pre-wrap border-l-2 border-line pl-3 text-[13px] leading-relaxed text-muted">{text}</div>}
    </div>
  );
}

function AudioAttachment({ m, a }: { m: Message; a: Attachment }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const transcript = await transcribe(dataUrlToBlob(a.dataUrl));
      await db.messages.update(m.id, { attachments: m.attachments?.map((x) => (x.id === a.id ? { ...x, transcript } : x)) });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-72 rounded-2xl bg-surface-2 p-2">
      <audio controls src={a.dataUrl} className="h-9 w-64 max-w-full" />
      {a.transcript ? (
        <div className="mt-1 select-text whitespace-pre-wrap px-1 text-xs text-muted">{a.transcript}</div>
      ) : (
        <button type="button" onClick={run} disabled={busy} className="mt-1 inline-flex items-center gap-1 px-1 text-xs text-accent">
          {busy ? <Loader2 className="size-3 animate-spin" /> : <AudioLines className="size-3" />} Transcribe
        </button>
      )}
    </div>
  );
}

function host(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
}

export const MessageView = memo(function MessageView({
  m,
  voice,
  isLast,
  onRegenerate,
  onEdit,
  onDelete,
  onOpenImage,
}: {
  m: Message;
  voice: VoiceSel;
  isLast: boolean;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  onDelete: () => void;
  onOpenImage: (src: string) => void;
}) {
  const live = useLive((s) => s[m.id]);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  const text = live?.text ?? m.text;
  const reasoning = live?.reasoning ?? m.reasoning;
  const streaming = m.status === 'streaming';

  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (m.role === 'user') {
    return (
      <div className="group flex flex-col items-end gap-1.5">
        {!!m.attachments?.length && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-2">
            {m.attachments.map((a) =>
              a.kind === 'image' ? (
                <img key={a.id} src={a.dataUrl} alt={a.name} onClick={() => onOpenImage(a.dataUrl)} className="max-h-48 cursor-zoom-in rounded-2xl border border-line object-cover" />
              ) : a.kind === 'audio' ? (
                <AudioAttachment key={a.id} m={m} a={a} />
              ) : a.kind === 'video' ? (
                <video key={a.id} src={a.dataUrl} controls className="max-h-48 rounded-2xl" />
              ) : (
                <div key={a.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <FileText className="size-4 text-muted" />
                  <span className="max-w-48 truncate">{a.name}</span>
                </div>
              ),
            )}
          </div>
        )}
        {editing ? (
          <div className="w-full max-w-[85%] space-y-2">
            <AutoTextarea value={draft} onChange={(e) => setDraft(e.target.value)} className={inputCls} autoFocus />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!draft.trim() && !m.attachments?.length}
                onClick={() => {
                  setEditing(false);
                  onEdit(draft);
                }}
              >
                Save & resend
              </Button>
            </div>
          </div>
        ) : (
          m.text && <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-accent/12 px-4 py-2.5 text-[15px] leading-relaxed [overflow-wrap:anywhere]">{m.text}</div>
        )}
        <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
          <IconButton label="Copy" size="sm" onClick={copy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </IconButton>
          <IconButton
            label="Edit"
            size="sm"
            onClick={() => {
              setDraft(m.text);
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5" />
          </IconButton>
          <IconButton label="Delete" size="sm" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="mb-1.5 flex items-center gap-2 text-xs text-muted">
        <span className="font-medium text-fg/80">{shortName(m.model ?? '')}</span>
        {m.cost != null && <span className="tabular-nums">{formatCost(m.cost)}</span>}
        {m.tokens?.out != null && <span className="tabular-nums">{m.tokens.out} tok</span>}
      </div>
      {reasoning && <Reasoning text={reasoning} live={streaming && !text} />}
      {streaming && !text && !reasoning && <div className="caret text-muted" />}
      {text && (
        <div className={clsx('text-[15px]', streaming && 'caret')}>
          <Markdown text={text} />
        </div>
      )}
      {!!m.images?.length && (
        <div className={clsx('mt-2 grid max-w-xl grid-cols-1 gap-2', m.images.length > 1 && 'sm:grid-cols-2')}>
          {m.images.map((src, i) => (
            <div key={i} className="group/img relative overflow-hidden rounded-2xl border border-line">
              <img src={src} alt="" onClick={() => onOpenImage(src)} className="w-full cursor-zoom-in object-cover" />
              <button
                type="button"
                onClick={() => download(dataUrlToBlob(src), `image-${m.id.slice(0, 6)}-${i + 1}.png`)}
                className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white opacity-0 transition group-hover/img:opacity-100 max-md:opacity-100"
                aria-label="Download"
              >
                <Download className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {!!m.citations?.length && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {m.citations.map((c, i) => (
            <a
              key={c.url}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              title={c.title}
              className="inline-flex max-w-60 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-muted hover:text-fg"
            >
              <Globe className="size-3 shrink-0" />
              <span className="tabular-nums">{i + 1}</span>
              <span className="truncate">{c.title || host(c.url)}</span>
            </a>
          ))}
        </div>
      )}
      {m.status === 'error' && (
        <div className="mt-2 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/8 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1 break-words">{m.error}</span>
        </div>
      )}
      {!streaming && (
        <div className="mt-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 max-md:opacity-100">
          {text && (
            <>
              <IconButton label="Copy" size="sm" onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </IconButton>
              <SpeakButton text={text} voice={voice} id={m.id} />
            </>
          )}
          {isLast && (
            <IconButton label="Regenerate" size="sm" onClick={onRegenerate}>
              <RotateCcw className="size-3.5" />
            </IconButton>
          )}
          <IconButton label="Delete" size="sm" onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      )}
    </div>
  );
});
