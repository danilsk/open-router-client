import clsx from 'clsx';
import { useLiveQuery } from 'dexie-react-hooks';
import { MessageSquarePlus, Pin, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton, inputCls } from '../../components/ui';
import { stopChat } from '../../lib/chat';
import { db, deleteChat } from '../../lib/db';
import { timeAgo } from '../../lib/text';

export function ChatSidebar({ activeId, onPick }: { activeId?: string; onPick?: () => void }) {
  const chats = useLiveQuery(() => db.chats.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const nav = useNavigate();
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    const f = n ? chats.filter((c) => c.title.toLowerCase().includes(n)) : chats;
    return [...f.filter((c) => c.pinned), ...f.filter((c) => !c.pinned)];
  }, [chats, q]);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            nav('/chat');
            onPick?.();
          }}
          className="flex h-10 w-full items-center gap-2 rounded-xl bg-accent px-3 text-sm font-medium text-accent-fg"
        >
          <MessageSquarePlus className="size-4" />
          New chat
        </button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className={clsx(inputCls, 'h-9 py-1.5 pl-8 text-[13px]')} />
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {list.map((c) => (
          <div
            key={c.id}
            onClick={() => {
              nav(`/chat/${c.id}`);
              onPick?.();
            }}
            className={clsx(
              'group flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm',
              c.id === activeId ? 'bg-surface-3' : 'hover:bg-surface-2',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate">{c.title}</div>
              <div className="text-[11px] text-muted">{timeAgo(c.updatedAt)}</div>
            </div>
            <IconButton
              label={c.pinned ? 'Unpin' : 'Pin'}
              size="sm"
              className={clsx('opacity-0 group-hover:opacity-100 max-md:opacity-60', c.pinned && 'text-accent opacity-100')}
              onClick={(e) => {
                e.stopPropagation();
                db.chats.update(c.id, { pinned: !c.pinned });
              }}
            >
              <Pin className="size-3.5" />
            </IconButton>
            <IconButton
              label="Delete chat"
              size="sm"
              className="opacity-0 group-hover:opacity-100 max-md:opacity-60"
              onClick={async (e) => {
                e.stopPropagation();
                if (!confirm(`Delete “${c.title}”?`)) return;
                stopChat(c.id);
                await deleteChat(c.id);
                if (c.id === activeId) nav('/chat');
              }}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        ))}
        {!list.length && <div className="px-3 py-8 text-center text-xs text-muted">No chats yet</div>}
      </div>
    </div>
  );
}
