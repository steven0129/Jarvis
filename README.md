# Jarvis OpenAI Audio Server

Jarvis is a small OpenAI API-backed web server. When it starts, it serves a browser UI where you can choose a model, record audio, check whether the selected model supports audio input, and automatically route the request:

- Models with multimodal/audio input support receive the audio directly.
- Models without audio input support use Whisper first, then receive the transcript as text.

## Installation

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```bash
OPENAI_API_KEY=your OpenAI API key
OPENAI_MODEL=gpt-4o-mini
WHISPER_MODEL=whisper-1
```

If you use an OpenAI-compatible gateway, you can also set `OPENAI_BASE_URL`.

## Start the server

```bash
npm start
```

Open http://localhost:3000.

## Test

```bash
npm test
```

## API

### `GET /api/model/:modelId/capability`

Returns the server's detected audio input capability for the model:

```json
{
  "id": "gpt-4o-mini-audio-preview",
  "supportsAudioInput": true
}
```

The server prefers metadata from the OpenAI Models API. If the provider does not expose explicit metadata, the server falls back to conservative model-name rules.

### `POST /api/audio-chat`

`multipart/form-data` fields:

- `audio`: audio file
- `model`: target model
- `prompt`: prompt for the model

Response:

```json
{
  "model": "gpt-4o-mini",
  "route": "whisper-then-text",
  "supportsAudioInput": false,
  "transcript": "...",
  "answer": "..."
}
```
