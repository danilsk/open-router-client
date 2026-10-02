import clsx from 'clsx';
import { ArrowUp, AudioLines, Camera, FileText, Globe, ImageIcon, Images, Loader2, Paperclip, Plus, Sparkles, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CameraCapture } from '../../components/CameraCapture';
import { MicButton } from '../../components/MicButton';
import { ModelButton } from '../../components/ModelPicker';
import { AutoTextarea, Chip, IconButton } from '../../components/ui';
import { useRecorder } from '../../hooks/useRecorder';
import { blobToDataUrl } from '../../lib/audio';
import { uid, type Attachment } from '../../lib/db';
import { dictate } from '../../lib/stt';
import { toastError } from '../../lib/toast';

const ASPECTS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];

async function downscale(file: Blob, max = 2048): Promise<string> {
  const url = await blobToDataUrl(file);
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return url;
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size < 3_000_000) return url;
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}

export async function fileToAttachment(f: File | Blob, name = (f as File).name ?? 'file'): Promise<Attachment> {
  const mime = f.type || 'application/octet-stream';
  const kind: Attachment['kind'] = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'file';
  const dataUrl = kind === 'image' ? await downscale(f) : await blobToDataUrl(f);
  return { id: uid(), kind, name, mime: kind === 'image' && dataUrl.startsWith('data:image/jpeg') ? 'image/jpeg' : mime, dataUrl, size: f.size };
}

export interface ImageMode {
  on: boolean;
  model: string;
  aspect: string;
  useLast: boolean;
}

export function Composer({
  onSend,
  onStop,
  running,
  webSearch,
  onWebSearch,
  image,
  onImage,
  hasLastImage,
  language,
}: {
  onSend: (text: string, atts: Attachment[]) => void;
  onStop: () => void;
  running: boolean;
  webSearch: boolean;
  onWebSearch: (v: boolean) => void;
  image: ImageMode;
  onImage: (v: ImageMode) => void;
  hasLastImage: boolean;
  language?: string;
}) {
  const [text, setText] = useState('');
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [menu, setMenu] = useState(false);
  const [camera, setCamera] = useState(false);
  const [dictating, setDictating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const voiceNote = useRecorder();

  const add = async (files: (File | Blob)[]) => {
    try {
      const out = await Promise.all(files.map((f) => fileToAttachment(f)));
      const big = out.find((a) => a.size > 25_000_000);
      if (big) toastError(new Error(`${big.name} is large (${Math.round(big.size / 1e6)} MB) and may be rejected.`));
      setAtts((a) => [...a, ...out]);
    } catch (e) {
      toastError(e);
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        add(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  const send = () => {
    if (running || (!text.trim() && !atts.length)) return;
    onSend(text.trim(), atts);
    setText('');
    setAtts([]);
  };

  const onDictation = async (blob: Blob) => {
    setDictating(true);
    try {
      const t = await dictate(blob, language);
      setText((x) => (x ? x.trimEnd() + ' ' : '') + t);
      taRef.current?.focus();
    } catch (e) {
      toastError(e);
    } finally {
      setDictating(false);
    }
  };

  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  return (
    <div
      className="px-3 pb-3 sm:px-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add([...e.dataTransfer.files]);
      }}
    >
      <div className="mx-auto max-w-3xl">
        {image.on && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ModelButton role="image" compact value={image.model} onChange={(model) => onImage({ ...image, model })} className="max-w-56" />
            <select
              value={image.aspect}
              onChange={(e) => onImage({ ...image, aspect: e.target.value })}
              className="h-8 rounded-xl border border-line bg-surface px-2 text-[13px] outline-none"
            >
              {ASPECTS.map((a) => (
                <option key={a} value={a}>
                  {a === 'auto' ? 'Auto size' : a}
                </option>
              ))}
            </select>
            {hasLastImage && (
              <Chip active={image.useLast} onClick={() => onImage({ ...image, useLast: !image.useLast })} title="Send the last generated image as a reference">
                <Images className="size-3.5" />
                Edit last image
              </Chip>
            )}
          </div>
        )}
        <div className="rounded-3xl border border-line bg-surface shadow-sm focus-within:border-accent/40">
          {!!atts.length && (
            <div className="scroll-thin flex gap-2 overflow-x-auto px-3 pt-3">
              {atts.map((a) => (
                <div key={a.id} className="relative shrink-0">
                  {a.kind === 'image' ? (
                    <img src={a.dataUrl} alt="" className="size-16 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-16 w-36 items-center gap-2 rounded-xl bg-surface-2 px-3 text-xs">
                      {a.kind === 'audio' ? <AudioLines className="size-4 shrink-0" /> : <FileText className="size-4 shrink-0" />}
                      <span className="line-clamp-2 break-all">{a.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAtts((x) => x.filter((y) => y.id !== a.id))}
                    className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-fg text-bg"
                    aria-label="Remove"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <AutoTextarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={voiceNote.recording ? 'Recording voice message…' : dictating ? 'Transcribing…' : image.on ? 'Describe the image…' : 'Message'}
            className="block w-full bg-transparent px-4 pb-1 pt-3.5 text-[15px] outline-none placeholder:text-muted"
          />
          <div className="flex items-center gap-1 px-2 pb-2">
            <div className="relative">
              <IconButton label="Add" onClick={() => setMenu(!menu)} active={menu}>
                <Plus className="size-5" />
              </IconButton>
              {menu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                  <div className="absolute bottom-12 left-0 z-40 w-56 rounded-2xl border border-line bg-surface p-1.5 shadow-xl">
                    {[
                      { icon: <Camera className="size-4" />, label: 'Take photo', on: () => setCamera(true) },
                      { icon: <ImageIcon className="size-4" />, label: 'Photo library', on: () => photoRef.current?.click() },
                      { icon: <Paperclip className="size-4" />, label: 'File (PDF, audio, video)', on: () => fileRef.current?.click() },
                      {
                        icon: <AudioLines className="size-4" />,
                        label: 'Record voice message',
                        on: async () => {
                          try {
                            await voiceNote.start();
                          } catch (e) {
                            toastError(e);
                          }
                        },
                      },
                    ].map((it) => (
                      <button
                        key={it.label}
                        type="button"
                        onClick={() => {
                          setMenu(false);
                          it.on();
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-surface-2"
                      >
                        <span className="text-muted">{it.icon}</span>
                        {it.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <IconButton label="Web search" active={webSearch} onClick={() => onWebSearch(!webSearch)}>
              <Globe className="size-5" />
            </IconButton>
            <IconButton label="Create image" active={image.on} onClick={() => onImage({ ...image, on: !image.on })}>
              <Sparkles className="size-5" />
            </IconButton>
            <div className="flex-1" />
            {voiceNote.recording ? (
              <>
                <span className="mr-1 text-xs tabular-nums text-danger">● {Math.floor(voiceNote.elapsed / 1000)}s</span>
                <IconButton label="Cancel recording" onClick={voiceNote.cancel}>
                  <X className="size-5" />
                </IconButton>
                <IconButton
                  label="Attach recording"
                  variant="primary"
                  className="rounded-full"
                  onClick={async () => {
                    const b = await voiceNote.stop();
                    if (b) add([new File([b], `voice-${new Date().toLocaleTimeString()}.${b.type.includes('mp4') ? 'm4a' : 'webm'}`, { type: b.type.split(';')[0] })]);
                  }}
                >
                  <ArrowUp className="size-5" />
                </IconButton>
              </>
            ) : (
              <>
                {dictating ? (
                  <span className="flex size-10 items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-muted" />
                  </span>
                ) : (
                  <MicButton onAudio={onDictation} label="Dictate" />
                )}
                <button
                  type="button"
                  onClick={running ? onStop : send}
                  disabled={!running && !text.trim() && !atts.length}
                  aria-label={running ? 'Stop' : 'Send'}
                  className={clsx(
                    'flex size-10 items-center justify-center rounded-full transition disabled:opacity-30',
                    running ? 'bg-fg text-bg' : 'bg-accent text-accent-fg',
                  )}
                >
                  {running ? <Square className="size-4" fill="currentColor" /> : <ArrowUp className="size-5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ''))} />
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf,audio/*,video/*,image/*,.txt,.md,.csv,.json"
        multiple
        hidden
        onChange={(e) => (add([...(e.target.files ?? [])]), (e.target.value = ''))}
      />
      <CameraCapture
        open={camera}
        onClose={() => setCamera(false)}
        onCapture={(url) => setAtts((a) => [...a, { id: uid(), kind: 'image', name: 'photo.jpg', mime: 'image/jpeg', dataUrl: url, size: url.length * 0.75 }])}
      />
    </div>
  );
}
