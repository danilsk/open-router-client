import { useLiveQuery } from 'dexie-react-hooks';
import { AudioWaveform, GraduationCap, Languages, MessageSquarePlus, PanelLeft, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ModelButton } from '../components/ModelPicker';
import { IconButton, PageHeader } from '../components/ui';
import { checkAttachments, deleteFrom, newChat, runAssistant, sendUser, stopChat, useLive, useRunning } from '../lib/chat';
import { db, type Attachment, type Chat, type Message } from '../lib/db';
import { useCatalog } from '../lib/models';
import { useSettings } from '../lib/store';
import { toast } from '../lib/toast';
import { ChatSettingsSheet } from './chat/ChatSettingsSheet';
import { ChatSidebar } from './chat/ChatSidebar';
import { Composer, type ImageMode } from './chat/Composer';
import { MessageView } from './chat/MessageView';

const STARTERS = [
  'Explain how vaccines train the immune system',
  'Plan a 3-day trip to Tbilisi',
  "What's new in tech this week?",
  'Draw a cozy reading nook in watercolor',
];

export default function ChatPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const settings = useSettings();
  const stored = useLiveQuery(() => (id ? db.chats.get(id) : undefined), [id]);
  const [draft, setDraft] = useState<Chat>(() => newChat());
  const chat = id ? stored : draft;
  const messages = useLiveQuery(() => (id ? db.messages.where('[chatId+createdAt]').between([id, 0], [id, Infinity]).toArray() : []), [id]) ?? [];
  const running = useRunning((s) => (chat ? !!s[chat.id] : false));
  const live = useLive();
  const model = useCatalog((s) => (chat ? s.byId.get(chat.model) : undefined));
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [image, setImage] = useState<ImageMode>({ on: false, model: settings.imageModel, aspect: 'auto', useLast: true });
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (chat?.imageModel) setImage((i) => ({ ...i, model: chat.imageModel! }));
  }, [chat?.imageModel]);

  useEffect(() => {
    if (id && stored === undefined) {
      const t = setTimeout(() => db.chats.get(id).then((c) => !c && nav('/chat', { replace: true })), 400);
      return () => clearTimeout(t);
    }
  }, [id, stored, nav]);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current && messages.length) el.scrollTop = el.scrollHeight;
  }, [messages.length, live]);

  useEffect(() => {
    stick.current = true;
  }, [id]);

  const update = useCallback(
    (p: Partial<Chat>) => {
      if (id) db.chats.update(id, p);
      else setDraft((d) => ({ ...d, ...p }));
    },
    [id],
  );

  const imageBefore = (ts: number) => [...messages].reverse().find((m) => m.createdAt < ts && m.images?.length)?.images?.[0];
  const lastImage = imageBefore(Infinity);

  const run = async (c: Chat, prompt: string, atts: Attachment[], asImage: boolean, before = Infinity) => {
    if (asImage) {
      const refs = atts.filter((a) => a.kind === 'image').map((a) => a.dataUrl);
      const prev = imageBefore(before);
      if (!refs.length && image.useLast && prev) refs.push(prev);
      await runAssistant(c, { image: { model: image.model, aspect: image.aspect, refs, prompt } });
    } else await runAssistant(c);
  };

  const send = async (text: string, atts: Attachment[]) => {
    if (!chat) return;
    if (image.on && !text) return toast('Describe the image you want.', 'error');
    if (!image.on) {
      const err = checkAttachments(atts, model);
      if (err) return toast(err, 'error');
    }
    const c = { ...chat };
    if (!id) {
      await db.chats.add(c);
      nav(`/chat/${c.id}`, { replace: true });
      setDraft(newChat());
    }
    stick.current = true;
    await sendUser(c, text, atts);
    await run(c, text, atts, image.on);
  };

  const regenerate = async (m: Message) => {
    if (!chat) return;
    stopChat(chat.id);
    const prevUser = [...messages].reverse().find((x) => x.role === 'user' && x.createdAt < m.createdAt);
    await db.messages.delete(m.id);
    await run(chat, prevUser?.text ?? '', prevUser?.attachments ?? [], !!m.imagePrompt, prevUser?.createdAt ?? m.createdAt);
  };

  const edit = async (m: Message, text: string) => {
    if (!chat) return;
    stopChat(chat.id);
    await db.messages.update(m.id, { text });
    await deleteFrom(chat.id, m.createdAt + 1);
    await run(chat, text, m.attachments ?? [], false);
  };

  if (!chat) return null;
  const voice = chat.voice ?? settings.voice;

  return (
    <div className="flex h-full">
      <aside className="hidden w-72 shrink-0 border-r border-line bg-surface lg:block">
        <ChatSidebar activeId={id} />
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[82%] max-w-80 border-r border-line bg-surface shadow-2xl">
            <ChatSidebar activeId={id} onPick={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader
          left={
            <IconButton label="Chats" className="lg:hidden" onClick={() => setDrawer(true)}>
              <PanelLeft className="size-5" />
            </IconButton>
          }
          title={<ModelButton role="chat" compact value={chat.model} onChange={(m) => update({ model: m })} className="max-w-full border-0 bg-transparent px-1 text-[15px] font-semibold hover:bg-surface-2" />}
          subtitle={<span className="px-1">{chat.title}</span>}
          actions={
            <>
              <IconButton label="Chat settings" onClick={() => setSheet(true)}>
                <SlidersHorizontal className="size-5" />
              </IconButton>
              <IconButton label="New chat" onClick={() => nav('/chat')}>
                <MessageSquarePlus className="size-5" />
              </IconButton>
            </>
          }
        />
        <div
          ref={scroller}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
        >
          {messages.length ? (
            <div className="mx-auto max-w-3xl space-y-7 px-4 py-6">
              {messages.map((m, i) => (
                <MessageView
                  key={m.id}
                  m={m}
                  voice={voice}
                  isLast={i === messages.length - 1 && m.role === 'assistant'}
                  onRegenerate={() => regenerate(m)}
                  onEdit={(t) => edit(m, t)}
                  onDelete={() => db.messages.delete(m.id)}
                  onOpenImage={setViewer}
                />
              ))}
            </div>
          ) : (
            <Welcome onPick={(t) => send(t, [])} />
          )}
        </div>
        <Composer
          onSend={send}
          onStop={() => stopChat(chat.id)}
          running={running}
          webSearch={chat.webSearch}
          onWebSearch={(webSearch) => update({ webSearch })}
          image={image}
          onImage={(v) => {
            setImage(v);
            if (v.model !== image.model) update({ imageModel: v.model });
          }}
          hasLastImage={!!lastImage}
        />
      </div>
      <ChatSettingsSheet open={sheet} onClose={() => setSheet(false)} chat={chat} onChange={update} />
      {viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

function Welcome({ onPick }: { onPick: (t: string) => void }) {
  const tiles = [
    { to: '/translator', icon: Languages, title: 'Live translator', text: 'Listen, translate and get reply ideas' },
    { to: '/learn', icon: GraduationCap, title: 'Language teacher', text: 'Talk, listen and drill any language' },
    { to: '/accent', icon: AudioWaveform, title: 'Accent trainer', text: 'Compare your voice to a native accent' },
  ];
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">What can I help with?</h1>
      <p className="mt-1 text-sm text-muted">Attach photos, PDFs or audio, search the web, or switch on image mode.</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {STARTERS.map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)} className="rounded-2xl border border-line bg-surface px-4 py-3 text-left text-sm hover:bg-surface-2">
            {s}
          </button>
        ))}
      </div>
      <div className="mt-8 grid gap-2 sm:grid-cols-3">
        {tiles.map(({ to, icon: Icon, title, text }) => (
          <Link key={to} to={to} className="rounded-2xl bg-gradient-to-br from-accent/12 to-teal/10 p-4 transition hover:from-accent/20">
            <Icon className="size-5 text-accent" />
            <div className="mt-2 text-sm font-semibold">{title}</div>
            <div className="mt-0.5 text-xs text-muted">{text}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
