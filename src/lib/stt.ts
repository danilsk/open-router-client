import { chat, transcribeEndpoint } from './api';
import { blobToBase64, toWav16k } from './audio';
import { langCode } from './languages';
import { fastParams, useCatalog } from './models';
import { getSettings } from './store';

export async function transcribe(
  blob: Blob,
  opts: { model?: string; language?: string; signal?: AbortSignal } = {},
): Promise<string> {
  const model = opts.model ?? getSettings().sttModel;
  const m = useCatalog.getState().byId.get(model);
  const b64 = await blobToBase64(await toWav16k(blob));
  if (!m || m.output.includes('transcription')) {
    const code = opts.language ? langCode(opts.language) : undefined;
    const r = await transcribeEndpoint(model, b64, 'wav', code, opts.signal);
    return r.text.trim();
  }
  const hint = opts.language ? ` The language is probably ${opts.language}.` : '';
  const r = await chat(
    {
      model,
      temperature: 0,
      ...fastParams(model),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `Transcribe this audio verbatim in its original language and script.${hint} Output only the transcript.` },
            { type: 'input_audio', input_audio: { data: b64, format: 'wav' } },
          ],
        },
      ],
    },
    opts.signal,
  );
  return r.text.trim();
}

export async function dictate(blob: Blob, language?: string): Promise<string> {
  const s = getSettings();
  return transcribe(blob, { model: s.dictateWith === 'stt' ? s.sttModel : s.listenModel, language });
}
