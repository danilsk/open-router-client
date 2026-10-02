import clsx from 'clsx';
import { AudioWaveform, GraduationCap, Languages, LayoutGrid, MessageSquare, Settings as SettingsIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useToasts } from '../lib/toast';

const NAV = [
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/translator', label: 'Translate', icon: Languages },
  { to: '/learn', label: 'Learn', icon: GraduationCap },
  { to: '/accent', label: 'Accent', icon: AudioWaveform },
  { to: '/models', label: 'Models', icon: LayoutGrid, desktopOnly: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full">
      <nav className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-r border-line bg-surface pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:flex">
        <img src={import.meta.env.BASE_URL + 'favicon.svg'} alt="" className="mb-3 size-9 rounded-xl" />
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex w-16 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-medium transition',
                isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="relative min-h-0 flex-1">{children}</main>
        <nav className="pb-safe flex shrink-0 border-t border-line bg-surface md:hidden">
          {NAV.filter((n) => !n.desktopOnly).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx('flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium', isActive ? 'text-accent' : 'text-muted')
              }
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Toasts />
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 pt-[max(12px,env(safe-area-inset-top))]">
      {toasts.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={clsx(
            'pointer-events-auto max-w-md rounded-2xl border px-4 py-2.5 text-left text-sm shadow-xl backdrop-blur-md',
            t.kind === 'error' ? 'border-danger/30 bg-surface/95 text-danger' : 'border-line bg-surface/95 text-fg',
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  );
}
