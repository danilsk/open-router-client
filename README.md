# OpenRouter Client

An installable web app (PWA) for [OpenRouter](https://openrouter.ai). It has no backend: your key and data stay in your browser, and requests go straight to `openrouter.ai`.

## Features

- **Chat** with any of 450+ models:
  - streamed replies, reasoning, markdown, code and math
  - per-chat system prompt, temperature, reasoning effort and voice
- **Model browser**:
  - popularity from OpenRouter's weekly rankings and intelligence scores from Artificial Analysis
  - filters (vision, audio, PDF, video, reasoning, tools, free) and favorites
- **Attachments**: camera, photo library, PDFs, audio and video files, voice messages
  - Audio is transcribed automatically for models that can't hear.
- **Web search** with source links.
- **Image generation and editing**, with any image model.
- **Voice**: read replies aloud with any text-to-speech model and voice, or the device's voice. Generated audio is cached.
- **Dictation** with any transcription or listening model.
- **Live translator**:
  - "hold to listen" or "always" (on-device speech detection)
  - transcript, romanization and translation, plus tap-to-speak reply suggestions when someone expects an answer
  - a "Me" button that translates what you say and speaks it
- **Language teacher** for any language:
  - spoken conversation with corrections and pronunciation tips
  - listening and speaking drills
  - flashcards with spaced repetition
- **Accent trainer** for any accent: practice sets with IPA, reference voice, side-by-side judgement, scores for each word and sound, and a check of what a speech recognizer heard.

Default models: `google/gemini-3.8-flash` for chat and listening, `google/gemini-3.8-flash-tts` for voice, `openai/gpt-4o-mini-transcribe` for transcription, and `google/gemini-3.1-flash-image` for images. You can change all of them.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173/open-router-client/
npm run build
```

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the app and publishes it to GitHub Pages. In the repo settings, go to Pages and set **Source** to **GitHub Actions** once.
