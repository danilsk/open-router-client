import { Camera, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toastError } from '../lib/toast';

export function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (dataUrl: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let alive = true;
    setReady(false);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().then(() => setReady(true));
        }
      })
      .catch((e) => {
        toastError(new Error(`Camera unavailable: ${e.message}`));
        close.current();
      });
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, facing]);

  const snap = () => {
    const v = video.current;
    if (!v) return;
    const max = 1600;
    const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * scale);
    c.height = Math.round(v.videoHeight * scale);
    c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
    onCapture(c.toDataURL('image/jpeg', 0.88));
    onClose();
  };

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={video} playsInline muted className="min-h-0 flex-1 object-contain" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
      <div className="flex items-center justify-around px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <button type="button" onClick={onClose} className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white" aria-label="Close camera">
          <X className="size-6" />
        </button>
        <button
          type="button"
          onClick={snap}
          disabled={!ready}
          className="flex size-20 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white disabled:opacity-40"
          aria-label="Take photo"
        >
          <Camera className="size-8" />
        </button>
        <button
          type="button"
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          className="flex size-12 items-center justify-center rounded-full bg-white/10 text-white"
          aria-label="Switch camera"
        >
          <RefreshCw className="size-6" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
