import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import OpenAI, { toFile } from 'openai';
import { buildModelCapability } from './modelCapabilities.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'whisper-1';

export function createApp({ openaiClient, env = process.env, logger = true } = {}) {
  const openai = openaiClient || new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL || undefined,
  });
  const app = Fastify({ logger });

  function requireOpenAIKey() {
    if (!env.OPENAI_API_KEY && !openaiClient) {
      const err = new Error('OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.');
      err.statusCode = 500;
      throw err;
    }
  }

  async function getModelCapability(modelId) {
    requireOpenAIKey();
    try {
      const model = await openai.models.retrieve(modelId);
      return buildModelCapability(modelId, model);
    } catch (error) {
      app.log.warn({ err: error, modelId }, 'Could not retrieve model metadata; falling back to name-based capability detection');
      return buildModelCapability(modelId);
    }
  }

  async function transcribeAudio(fileBuffer, filename, mimetype) {
    const transcription = await openai.audio.transcriptions.create({
      file: await toFile(fileBuffer, filename || 'recording.wav', {
        type: mimetype || 'audio/wav',
      }),
      model: env.WHISPER_MODEL || WHISPER_MODEL,
    });
    return transcription.text || '';
  }

  async function askWithAudio({ model, prompt, fileBuffer }) {
    const audioBase64 = fileBuffer.toString('base64');
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt || 'Please respond to this audio.' },
            {
              type: 'input_audio',
              input_audio: {
                data: audioBase64,
                format: 'wav',
              },
            },
          ],
        },
      ],
    });
    return response.choices?.[0]?.message?.content || '';
  }

  async function askWithText({ model, prompt, transcript }) {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: `${prompt || 'Please respond to this audio transcript.'}\n\nTranscript:\n${transcript}`,
        },
      ],
    });
    return response.choices?.[0]?.message?.content || '';
  }

  app.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
      files: 1,
    },
  });

  app.get('/api/config', async () => ({
    defaultModel: env.OPENAI_MODEL || DEFAULT_MODEL,
    whisperModel: env.WHISPER_MODEL || WHISPER_MODEL,
  }));

  app.get('/api/model/:modelId/capability', async (request) => {
    const modelId = request.params.modelId || env.OPENAI_MODEL || DEFAULT_MODEL;
    return getModelCapability(modelId);
  });

  app.post('/api/audio-chat', async (request, reply) => {
    requireOpenAIKey();
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'Missing audio file field named audio.' });
    }

    const fields = data.fields || {};
    const model = fields.model?.value || env.OPENAI_MODEL || DEFAULT_MODEL;
    const prompt = fields.prompt?.value || '';
    const fileBuffer = await data.toBuffer();
    const capability = await getModelCapability(model);

    let transcript = null;
    let answer;
    let route;

    if (capability.supportsAudioInput) {
      route = 'direct-audio';
      answer = await askWithAudio({ model, prompt, fileBuffer });
    } else {
      route = 'whisper-then-text';
      transcript = await transcribeAudio(fileBuffer, data.filename, data.mimetype);
      answer = await askWithText({ model, prompt, transcript });
    }

    return { model, route, supportsAudioInput: capability.supportsAudioInput, transcript, answer };
  });

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error);
    reply.code(error.statusCode || 500).send({ error: error.message || 'Internal server error' });
  });

  return app;
}

export async function startServer({ port = Number(process.env.PORT || 3000), host = '0.0.0.0' } = {}) {
  const app = createApp();
  await app.register(staticPlugin, { root: publicDir, index: 'index.html' });
  await app.listen({ port, host });
  return app;
}
