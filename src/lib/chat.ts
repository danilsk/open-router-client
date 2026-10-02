import { create } from 'zustand';
import { chatStream, generateImages, type ChatMessage, type Citation, type ContentPart } from './api';
import { audioFormatOf, dataUrlToBlob } from './audio';
import { db, uid, type Attachment, type Chat, type Message } from './db';
import { accepts, reasoningParam, useCatalog, type ModelInfo } from './models';
import { getSettings } from './store';
import { transcribe } from './stt';
import { toastError } from './toast';
import { speak } from './tts';

interface Live {
  text: string;
  reasoning: string;
}

export const useLive = create<Record<string, Live>>(() => ({}));
export const useRunning = create<Record<string, boolean>>(() => ({}));
const controllers = new Map<string, AbortController>();

export function stopChat(chatId: string) {
  controllers.get(chatId)?.abort();
}

export function newChat(partial: Partial<Chat> = {}): Chat {
  const s = getSettings();
  const now = Date.now();
  return {
    id: uid(),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    model: s.chatModel,
    system: '',
    webSearch: false,
    reasoning: 'default',
    autoSpeak: false,
    ...partial,
  };
}

async function partsFor(m: Message, model: ModelInfo | undefined): Promise<ContentPart[] | string> {
  const atts = m.attachments ?? [];
  if (!atts.length) return m.text;
  const parts: ContentPart[] = [];
  const notes: string[] = [];
  for (const a of atts) {
    if (a.kind === 'image') parts.push({ type: 'image_url', image_url: { url: a.dataUrl } });
    else if (a.kind === 'file' && a.mime !== 'application/pdf') {
      const body = new TextDecoder().decode(await dataUrlToBlob(a.dataUrl).arrayBuffer());
      notes.push(`File "${a.name}":\n\`\`\`\n${body.slice(0, 200_000)}\n\`\`\``);
    } else if (a.kind === 'file') parts.push({ type: 'file', file: { filename: a.name, file_data: a.dataUrl } });
    else if (a.kind === 'video') parts.push({ type: 'video_url', video_url: { url: a.dataUrl } });
    else if (a.kind === 'audio') {
      if (accepts(model, 'audio')) {
        parts.push({ type: 'input_audio', input_audio: { data: a.dataUrl.slice(a.dataUrl.indexOf(',') + 1), format: audioFormatOf(a.mime) } });
      } else {
        if (a.transcript == null) {
          a.transcript = await transcribe(dataUrlToBlob(a.dataUrl));
          await db.messages.update(m.id, { attachments: atts });
        }
        notes.push(`[Voice message "${a.name}" transcript]: ${a.transcript}`);
      }
    }
  }
  const text = [m.text, ...notes].filter(Boolean).join('\n\n');
  if (text) parts.unshift({ type: 'text', text });
  return parts;
}

function systemPrompt(chat: Chat): string {
  const date = new Date().toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
  return [chat.system.trim(), `Current date and time: ${date}.`].filter(Boolean).join('\n\n');
}

export function checkAttachments(atts: Attachment[], model: ModelInfo | undefined): string | null {
  if (!model) return null;
  for (const kind of ['image', 'video'] as const) {
    if (atts.some((a) => a.kind === kind) && !accepts(model, kind)) {
      const what = kind === 'image' ? 'images' : 'videos';
      return `${model.name} can't read ${what}. Pick a model that can (use the filters in the model picker).`;
    }
  }
  return null;
}

export async function runAssistant(chat: Chat, opts: { image?: { model: string; aspect?: string; refs: string[]; prompt: string } } = {}) {
  const ac = new AbortController();
  controllers.set(chat.id, ac);
  useRunning.setState({ [chat.id]: true });
  const id = uid();
  const now = await nextTime(chat.id);
  const model = useCatalog.getState().byId.get(chat.model);
  const base: Message = { id, chatId: chat.id, role: 'assistant', createdAt: now, text: '', status: 'streaming', model: opts.image?.model ?? chat.model };
  await db.messages.add(base);
  await db.chats.update(chat.id, { updatedAt: now });
  useLive.setState({ [id]: { text: '', reasoning: '' } });

  let text = '';
  let reasoning = '';
  let details: unknown[] = [];
  const citations: Citation[] = [];
  const images: string[] = [];
  let lastFlush = 0;

  try {
    if (opts.image) {
      const r = await generateImages(
        {
          model: opts.image.model,
          prompt: opts.image.prompt,
          ...(opts.image.aspect && opts.image.aspect !== 'auto' ? { aspect_ratio: opts.image.aspect } : {}),
          ...(opts.image.refs.length ? { input_references: opts.image.refs.map((url) => ({ type: 'image_url' as const, image_url: { url } })) } : {}),
        },
        ac.signal,
      );
      await db.messages.update(id, { images: r.images, imagePrompt: true, status: 'done', cost: r.usage?.cost, text: r.images.length ? '' : 'No image was returned.' });
      return;
    }

    const history = await db.messages.where('[chatId+createdAt]').between([chat.id, 0], [chat.id, now], true, false).toArray();
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt(chat) }];
    for (const m of history) {
      if (m.status === 'error' || (m.role === 'assistant' && !m.text)) continue;
      if (m.role === 'user') messages.push({ role: 'user', content: await partsFor(m, model) });
      else messages.push({ role: 'assistant', content: m.text, ...(m.reasoningDetails?.length ? { reasoning_details: m.reasoningDetails } : {}) });
    }

    const s = getSettings();
    const body: Record<string, unknown> = { model: chat.model, messages };
    const r = reasoningParam(model, chat.reasoning);
    if (r) body.reasoning = r;
    if (chat.temperature != null) body.temperature = chat.temperature;
    if (chat.webSearch) body.tools = [{ type: 'openrouter:web_search', parameters: { engine: s.searchEngine, max_results: s.searchMaxResults } }];

    for await (const ev of chatStream(body, ac.signal)) {
      if (ev.type === 'content') text += ev.text;
      else if (ev.type === 'reasoning') reasoning += ev.text;
      else if (ev.type === 'reasoning_details') details = [...details, ...ev.details];
      else if (ev.type === 'citations') {
        for (const c of ev.citations) if (!citations.some((x) => x.url === c.url)) citations.push(c);
      } else if (ev.type === 'images') images.push(...ev.images);
      else if (ev.type === 'usage') {
        await db.messages.update(id, {
          cost: ev.usage.cost,
          model: ev.model ?? chat.model,
          tokens: { in: ev.usage.prompt_tokens, out: ev.usage.completion_tokens, reasoning: ev.usage.completion_tokens_details?.reasoning_tokens },
        });
      }
      useLive.setState({ [id]: { text, reasoning } });
      if (performance.now() - lastFlush > 1500) {
        lastFlush = performance.now();
        db.messages.update(id, { text, reasoning });
      }
    }
    await db.messages.update(id, { text, reasoning: reasoning || undefined, reasoningDetails: details.length ? details : undefined, citations: citations.length ? citations : undefined, images: images.length ? images : undefined, status: 'done' });
    if (chat.autoSpeak && text) speak(text, chat.voice ?? getSettings().voice, id);
  } catch (e) {
    const aborted = (e as Error).name === 'AbortError';
    await db.messages.update(id, { text, reasoning, status: aborted ? 'done' : 'error', error: aborted ? undefined : (e as Error).message });
    if (!aborted) toastError(e);
  } finally {
    if (controllers.get(chat.id) === ac) {
      controllers.delete(chat.id);
      useRunning.setState({ [chat.id]: false });
    }
    useLive.setState((st) => {
      const { [id]: _, ...rest } = st;
      return rest;
    }, true);
    await db.chats.update(chat.id, { updatedAt: Date.now() });
  }
}

async function nextTime(chatId: string) {
  const last = await db.messages.where('[chatId+createdAt]').between([chatId, 0], [chatId, Infinity]).last();
  return Math.max(Date.now(), (last?.createdAt ?? 0) + 1);
}

export async function sendUser(chat: Chat, text: string, attachments: Attachment[]) {
  const msg: Message = { id: uid(), chatId: chat.id, role: 'user', createdAt: await nextTime(chat.id), text, attachments: attachments.length ? attachments : undefined };
  await db.messages.add(msg);
  if (chat.title === 'New chat') {
    const t = (text || attachments[0]?.name || 'New chat').replace(/\s+/g, ' ').trim();
    const title = t.length > 48 ? t.slice(0, 46) + '…' : t;
    chat.title = title;
    await db.chats.update(chat.id, { title });
  }
  return msg;
}

export async function deleteFrom(chatId: string, createdAt: number) {
  const ids = await db.messages.where('[chatId+createdAt]').between([chatId, createdAt], [chatId, Infinity], true, true).primaryKeys();
  await db.messages.bulkDelete(ids);
}
