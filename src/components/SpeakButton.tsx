import clsx from 'clsx';
import { Loader2, Square, Volume2 } from 'lucide-react';
import type { VoiceSel } from '../lib/store';
import { speak, stopSpeaking, useSpeech } from '../lib/tts';

export function SpeakButton({
  text,
  voice,
  id,
  slow,
  className,
  size = 'sm',
  label = 'Read aloud',
}: {
  text: string;
  voice: VoiceSel;
  id: string;
  slow?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}) {
  const { loadingKey, playingKey } = useSpeech();
  const loading = loadingKey === id;
  const playing = playingKey === id;
  const icon = size === 'lg' ? 'size-5' : 'size-4';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        if (loading || playing) stopSpeaking();
        else speak(text, voice, id, { slow });
      }}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition',
        size === 'sm' && 'size-8',
        size === 'md' && 'size-10',
        size === 'lg' && 'size-12',
        playing ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg',
        className,
      )}
    >
      {loading ? <Loader2 className={clsx(icon, 'animate-spin')} /> : playing ? <Square className={clsx(icon, 'scale-75')} fill="currentColor" /> : <Volume2 className={icon} />}
    </button>
  );
}
