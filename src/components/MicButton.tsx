import clsx from 'clsx';
import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useRecorder } from '../hooks/useRecorder';
import { toastError } from '../lib/toast';

export function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function MicButton({
  onAudio,
  size = 'md',
  className,
  disabled,
  label = 'Record',
  children,
  hold = false,
  onRecordingChange,
  tone = 'accent',
}: {
  onAudio: (blob: Blob) => void;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  disabled?: boolean;
  label?: string;
  children?: ReactNode;
  hold?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  tone?: 'accent' | 'teal';
}) {
  const rec = useRecorder();
  const downAt = useRef(0);
  const holding = useRef(false);
  const cb = useRef(onRecordingChange);
  cb.current = onRecordingChange;
  useEffect(() => cb.current?.(rec.recording), [rec.recording]);

  const begin = async () => {
    try {
      await rec.start();
    } catch (e) {
      toastError(new Error(`Microphone unavailable: ${(e as Error).message}`));
    }
  };
  const finish = async () => {
    const blob = await rec.stop();
    if (blob && blob.size > 1500) onAudio(blob);
  };

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    downAt.current = performance.now();
    if (rec.recording) return;
    holding.current = true;
    begin();
  };
  const onUp = () => {
    if (!holding.current && !rec.recording) return;
    const held = performance.now() - downAt.current;
    if (holding.current && (hold || held > 350)) {
      holding.current = false;
      finish();
      return;
    }
    if (holding.current) {
      holding.current = false;
      return;
    }
    finish();
  };

  const dim = size === 'xl' ? 'size-24' : size === 'lg' ? 'size-14' : 'size-10';
  return (
    <div className={clsx('relative inline-flex shrink-0 flex-col items-center', className)}>
      <button
        type="button"
        aria-label={label}
        title={hold ? `${label} (hold)` : `${label} (tap or hold)`}
        disabled={disabled}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={() => holding.current && rec.recording && onUp()}
        onContextMenu={(e) => e.preventDefault()}
        className={clsx(
          'relative flex touch-none select-none items-center justify-center rounded-full transition disabled:opacity-40',
          dim,
          rec.recording
            ? 'bg-danger text-white'
            : size === 'md'
              ? 'text-muted hover:bg-surface-2 hover:text-fg'
              : tone === 'teal'
                ? 'bg-teal text-white shadow-lg shadow-teal/25'
                : 'bg-accent text-accent-fg shadow-lg shadow-accent/25',
        )}
      >
        {rec.recording && <span className="pulse-ring absolute inset-0 rounded-full bg-danger" style={{ transform: `scale(${1 + rec.level})` }} />}
        <span className="relative">
          {children ?? (rec.recording ? <Square className={size === 'md' ? 'size-4' : 'size-6'} fill="currentColor" /> : <Mic className={size === 'md' ? 'size-5' : size === 'lg' ? 'size-6' : 'size-9'} />)}
        </span>
      </button>
      {rec.recording && size !== 'md' && <span className="mt-2 text-xs tabular-nums text-danger">{fmtTime(rec.elapsed)}</span>}
    </div>
  );
}
