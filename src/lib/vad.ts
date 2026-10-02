import { floatToWav } from './audio';

export interface VadHandle {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  destroy: () => Promise<void>;
}

export interface VadOptions {
  onSpeechStart?: () => void;
  onSpeechEnd: (wav: Blob, seconds: number) => void;
  onMisfire?: () => void;
  onLevel?: (p: number) => void;
  sensitivity?: number;
}

export async function createVad(o: VadOptions): Promise<VadHandle> {
  const [{ MicVAD }, ort] = await Promise.all([import('@ricky0123/vad-web'), import('onnxruntime-web/wasm')]);
  ort.env.wasm.numThreads = 1;
  const base = import.meta.env.BASE_URL + 'vad/';
  const s = o.sensitivity ?? 0.5;
  const vad = await MicVAD.new({
    model: 'v5',
    baseAssetPath: base,
    onnxWASMBasePath: base,
    positiveSpeechThreshold: 0.75 - s * 0.4,
    negativeSpeechThreshold: 0.6 - s * 0.4,
    redemptionMs: 700,
    preSpeechPadMs: 300,
    minSpeechMs: 350,
    startOnLoad: false,
    getStream: () =>
      navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      }),
    onSpeechStart: () => o.onSpeechStart?.(),
    onVADMisfire: () => o.onMisfire?.(),
    onFrameProcessed: (p) => o.onLevel?.(p.isSpeech),
    onSpeechEnd: (audio) => o.onSpeechEnd(floatToWav(audio, 16000), audio.length / 16000),
  });
  return { start: () => vad.start(), pause: () => vad.pause(), destroy: () => vad.destroy() };
}
