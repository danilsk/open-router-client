import { useCallback, useEffect, useRef, useState } from 'react';

const MIME = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const r = useRef<{
    stream?: MediaStream;
    rec?: MediaRecorder;
    chunks: Blob[];
    ctx?: AudioContext;
    raf?: number;
    t0: number;
    done?: (b: Blob | null) => void;
    discard?: boolean;
    starting?: boolean;
    abort?: boolean;
  }>({ chunks: [], t0: 0 });

  const cleanup = useCallback(() => {
    const s = r.current;
    if (s.raf) cancelAnimationFrame(s.raf);
    s.stream?.getTracks().forEach((t) => t.stop());
    s.ctx?.close().catch(() => {});
    s.stream = undefined;
    s.ctx = undefined;
    s.rec = undefined;
    setRecording(false);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    const s = r.current;
    if (s.rec || s.starting) return;
    s.starting = true;
    s.abort = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } finally {
      s.starting = false;
    }
    if (s.abort) {
      stream.getTracks().forEach((t) => t.stop());
      s.abort = false;
      const done = s.done;
      s.done = undefined;
      done?.(null);
      return;
    }
    const mimeType = MIME.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    s.stream = stream;
    s.rec = rec;
    s.chunks = [];
    s.discard = false;
    s.t0 = performance.now();
    rec.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
    rec.onstop = () => {
      const blob = s.discard || !s.chunks.length ? null : new Blob(s.chunks, { type: rec.mimeType || mimeType || 'audio/webm' });
      const done = s.done;
      s.done = undefined;
      cleanup();
      done?.(blob);
    };
    rec.start(200);
    setRecording(true);
    setElapsed(0);
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      s.ctx = ctx;
      const data = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        setElapsed(performance.now() - s.t0);
        s.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* level meter is optional */
    }
  }, [cleanup]);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const s = r.current;
        if (s.starting) {
          s.abort = true;
          s.done = resolve;
          return;
        }
        if (!s.rec || s.rec.state === 'inactive') return resolve(null);
        s.done = resolve;
        s.rec.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    const s = r.current;
    if (s.starting) s.abort = true;
    s.discard = true;
    if (s.rec && s.rec.state !== 'inactive') s.rec.stop();
    else cleanup();
  }, [cleanup]);

  useEffect(() => () => cancel(), [cancel]);

  return { recording, level, elapsed, start, stop, cancel };
}
