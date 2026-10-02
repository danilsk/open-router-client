import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { forwardRef, useEffect, useLayoutEffect, useRef, type ButtonHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

type Variant = 'primary' | 'subtle' | 'ghost' | 'danger' | 'outline';

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:brightness-110 active:brightness-95',
  subtle: 'bg-surface-2 text-fg hover:bg-surface-3',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger/12 text-danger hover:bg-danger/20',
  outline: 'border border-line text-fg hover:bg-surface-2',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }
>(({ variant = 'subtle', size = 'md', loading, icon, className, children, disabled, ...p }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={clsx(
      'inline-flex select-none items-center justify-center gap-2 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' && 'h-8 px-3 text-[13px]',
      size === 'md' && 'h-10 px-4 text-sm',
      size === 'lg' && 'h-12 px-5 text-[15px]',
      variants[variant],
      className,
    )}
    {...p}
  >
    {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
    {children}
  </button>
));

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; active?: boolean; label: string }
>(({ variant = 'ghost', size = 'md', active, label, className, children, ...p }, ref) => (
  <button
    ref={ref}
    aria-label={label}
    title={label}
    className={clsx(
      'inline-flex shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40',
      size === 'sm' && 'size-8',
      size === 'md' && 'size-10',
      size === 'lg' && 'size-12',
      active ? 'bg-accent/15 text-accent' : variants[variant],
      className,
    )}
    {...p}
  >
    {children}
  </button>
));

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('size-4 animate-spin text-muted', className)} />;
}

export function Chip({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition',
        active ? 'border-accent/50 bg-accent/12 text-accent' : 'border-line text-muted hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = 'muted', className }: { children: ReactNode; tone?: 'muted' | 'accent' | 'teal' | 'warn' | 'danger'; className?: string }) {
  const tones = {
    muted: 'bg-surface-3 text-muted',
    accent: 'bg-accent/15 text-accent',
    teal: 'bg-teal/15 text-teal',
    warn: 'bg-warn/15 text-warn',
    danger: 'bg-danger/15 text-danger',
  };
  return <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium', tones[tone], className)}>{children}</span>;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
}) {
  return (
    <div className={clsx('inline-flex rounded-xl bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition',
            value === o.value ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-fg">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const inputCls =
  'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/15';

export function Select({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={clsx(inputCls, 'appearance-none pr-8', className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-start justify-between gap-4 text-left">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      <span className={clsx('relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition', checked ? 'bg-accent' : 'bg-surface-3')}>
        <span className={clsx('absolute top-0.5 size-5 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }>(
  ({ maxRows = 8, className, value, ...p }, ref) => {
    const inner = useRef<HTMLTextAreaElement | null>(null);
    useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = 'auto';
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
      el.style.height = Math.min(el.scrollHeight, lh * maxRows + 20) + 'px';
    }, [value, maxRows]);
    return (
      <textarea
        ref={(el) => {
          inner.current = el;
          if (typeof ref === 'function') ref(el);
          else if (ref) ref.current = el;
        }}
        rows={1}
        value={value}
        className={clsx('resize-none', className)}
        {...p}
      />
    );
  },
);

export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={clsx(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl sm:rounded-3xl',
          wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 text-[15px] font-semibold">{title}</div>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('rounded-2xl border border-line bg-surface p-4', className)}>{children}</div>;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <div className="text-base font-semibold">{title}</div>
      {children && <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, left }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; left?: ReactNode }) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
        {left}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{title}</div>
          {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function ScoreRing({ value, size = 56 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = v >= 80 ? 'var(--teal)' : v >= 55 ? 'var(--warn)' : 'var(--danger)';
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth="5" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v / 100)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.3} fontWeight="700" fill="var(--fg)">
        {v}
      </text>
    </svg>
  );
}
