import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function createOpenAIMock({ audioSupported = false } = {}) {
  const calls = { transcriptions: 0, chat: [] };
  const openaiClient = {
    models: {
      retrieve: async (model) => ({ id: model, input_modalities: audioSupported ? ['text', 'audio'] : ['text'] }),
    },
    audio: {
      transcriptions: {
        create: async () => {
          calls.transcriptions += 1;
          return { text: 'hello from transcript' };
        },
      },
    },
    chat: {
      completions: {
        create: async (payload) => {
          calls.chat.push(payload);
          return { choices: [{ message: { content: 'mock answer' } }] };
        },
      },
    },
  };
  return { openaiClient, calls };
}

async function injectAudioChat(app, model = 'gpt-4o-mini') {
  const form = new FormData();
  form.append('model', model);
  form.append('prompt', 'reply in zh-TW');
  form.append('audio', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/wav' }), 'recording.wav');
  return app.inject({ method: 'POST', url: '/api/audio-chat', body: form });
}

test('routes supported audio models directly without Whisper', async () => {
  const { openaiClient, calls } = createOpenAIMock({ audioSupported: true });
  const app = createApp({ openaiClient, logger: false });
  const response = await injectAudioChat(app, 'audio-model');

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.route, 'direct-audio');
  assert.equal(body.supportsAudioInput, true);
  assert.equal(body.transcript, null);
  assert.equal(calls.transcriptions, 0);
  assert.equal(calls.chat[0].messages[0].content[1].type, 'input_audio');
});

test('routes text-only models through Whisper before chat completion', async () => {
  const { openaiClient, calls } = createOpenAIMock({ audioSupported: false });
  const app = createApp({ openaiClient, logger: false });
  const response = await injectAudioChat(app, 'text-model');

  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.route, 'whisper-then-text');
  assert.equal(body.supportsAudioInput, false);
  assert.equal(body.transcript, 'hello from transcript');
  assert.equal(calls.transcriptions, 1);
  assert.match(calls.chat[0].messages[0].content, /hello from transcript/);
});
