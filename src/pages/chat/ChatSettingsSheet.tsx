import { useEffect, useState } from 'react';
import { ModelButton } from '../../components/ModelPicker';
import { VoiceButton } from '../../components/VoicePicker';
import { AutoTextarea, Field, Segmented, Sheet, Toggle, inputCls } from '../../components/ui';
import type { Chat } from '../../lib/db';
import { useCatalog } from '../../lib/models';
import { useSettings, type ReasoningLevel } from '../../lib/store';

const PRESETS = [
  { label: 'Concise', text: 'Be concise and direct. Prefer short answers and bullet points.' },
  { label: 'Explain simply', text: 'Explain things in simple, plain language, as if to a smart 12-year-old. Use examples.' },
  { label: 'Coder', text: 'You are a senior software engineer. Give correct, idiomatic code with brief explanations.' },
  { label: 'Translator', text: 'Translate everything the user writes. If it is English, translate to Spanish; otherwise translate to English. Output only the translation.' },
];

export function ChatSettingsSheet({ open, onClose, chat, onChange }: { open: boolean; onClose: () => void; chat: Chat; onChange: (p: Partial<Chat>) => void }) {
  const settings = useSettings();
  const model = useCatalog((s) => s.byId.get(chat.model));
  const canReason = model?.params.includes('reasoning');
  const efforts = model?.reasoning?.efforts;
  const [title, setTitle] = useState(chat.title);
  const [system, setSystem] = useState(chat.system);
  useEffect(() => {
    if (!open) return;
    setTitle(chat.title);
    setSystem(chat.system);
  }, [open, chat.id]);
  return (
    <Sheet open={open} onClose={onClose} title="Chat settings">
      <div className="space-y-5">
        <Field label="Title">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              onChange({ title: e.target.value });
            }}
          />
        </Field>
        <Field label="Model">
          <ModelButton role="chat" value={chat.model} onChange={(m) => onChange({ model: m })} />
        </Field>
        <Field label="System prompt" hint="Instructions the model follows for this whole chat.">
          <AutoTextarea
            className={inputCls}
            maxRows={10}
            value={system}
            placeholder="You are a helpful assistant."
            onChange={(e) => {
              setSystem(e.target.value);
              onChange({ system: e.target.value });
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setSystem(p.text);
                  onChange({ system: p.text });
                }} className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs text-muted hover:text-fg">
                {p.label}
              </button>
            ))}
          </div>
        </Field>
        {canReason && (
          <Field
            label="Reasoning"
            hint={model?.reasoning?.mandatory ? 'This model always reasons; “Off” uses the lowest effort.' : 'More reasoning is slower and costs more, but helps hard problems.'}
          >
            <Segmented<ReasoningLevel>
              value={chat.reasoning}
              onChange={(reasoning) => onChange({ reasoning })}
              className="w-full"
              options={(['default', 'off', 'low', 'medium', 'high'] as ReasoningLevel[])
                .filter((l) => l === 'default' || l === 'off' || !efforts || efforts.includes(l))
                .map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))}
            />
          </Field>
        )}
        <Field label={`Temperature · ${chat.temperature == null ? 'model default' : chat.temperature.toFixed(1)}`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={chat.temperature ?? 1}
              onChange={(e) => onChange({ temperature: Number(e.target.value) })}
              className="flex-1 accent-[var(--accent)]"
            />
            <button type="button" className="text-xs text-accent" onClick={() => onChange({ temperature: undefined })}>
              Reset
            </button>
          </div>
        </Field>
        <Toggle
          checked={chat.webSearch}
          onChange={(webSearch) => onChange({ webSearch })}
          label="Web search"
          hint={`Engine: ${settings.searchEngine}. Change it in Settings.`}
        />
        <Field label="Voice for this chat">
          <VoiceButton value={chat.voice ?? settings.voice} onChange={(voice) => onChange({ voice })} />
        </Field>
        <Toggle checked={chat.autoSpeak} onChange={(autoSpeak) => onChange({ autoSpeak })} label="Read replies aloud" hint="Speak each new answer automatically." />
        <Field label="Image model for this chat">
          <ModelButton role="image" value={chat.imageModel ?? settings.imageModel} onChange={(imageModel) => onChange({ imageModel })} />
        </Field>
      </div>
    </Sheet>
  );
}
