export function pcm16ToWav(pcm: Uint8Array, rate: number, channels = 1): Blob {
  const h = new DataView(new ArrayBuffer(44));
  const w = (o: number, s: string) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF');
  h.setUint32(4, 36 + pcm.length, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  h.setUint32(16, 16, true);
  h.setUint16(20, 1, true);
  h.setUint16(22, channels, true);
  h.setUint32(24, rate, true);
  h.setUint32(28, rate * channels * 2, true);
  h.setUint16(32, channels * 2, true);
  h.setUint16(34, 16, true);
  w(36, 'data');
  h.setUint32(40, pcm.length, true);
  return new Blob([h.buffer, pcm as BlobPart], { type: 'audio/wav' });
}

export function floatToWav(samples: Float32Array, rate: number): Blob {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16ToWav(new Uint8Array(pcm.buffer), rate, 1);
}

let ctx: AudioContext | null = null;
const audioCtx = () => (ctx ??= new AudioContext());

export async function decodeMono(blob: Blob, rate = 16000): Promise<Float32Array> {
  const buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
  const frames = Math.max(1, Math.ceil(buf.duration * rate));
  const off = new OfflineAudioContext(1, frames, rate);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

export async function toWav16k(blob: Blob): Promise<Blob> {
  if (blob.type === 'audio/wav') return blob;
  return floatToWav(await decodeMono(blob), 16000);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const url = await blobToDataUrl(blob);
  return url.slice(url.indexOf(',') + 1);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export function audioFormatOf(mime: string): string {
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('flac')) return 'flac';
  if (mime.includes('webm')) return 'webm';
  return 'wav';
}

export async function blobDuration(blob: Blob): Promise<number> {
  try {
    const buf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
    return buf.duration;
  } catch {
    return 0;
  }
}

type Listener = (key: string | null) => void;

class Player {
  private el = new Audio();
  private url: string | null = null;
  private resolve: (() => void) | null = null;
  private listeners = new Set<Listener>();
  key: string | null = null;

  constructor() {
    this.el.addEventListener('ended', () => this.finish());
    this.el.addEventListener('error', () => this.finish());
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l(this.key));
  }

  private finish() {
    const r = this.resolve;
    this.resolve = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.key = null;
    this.emit();
    r?.();
  }

  play(blob: Blob, key = 'audio', rate = 1): Promise<void> {
    this.stop();
    this.url = URL.createObjectURL(blob);
    this.el.src = this.url;
    this.el.playbackRate = rate;
    this.key = key;
    this.emit();
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.el.play().catch(() => this.finish());
    });
  }

  stop() {
    if (!this.el.paused) this.el.pause();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    if (this.resolve || this.key) this.finish();
  }

  setKey(key: string | null) {
    this.key = key;
    this.emit();
  }
}

export const player = new Player();
