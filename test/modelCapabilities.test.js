import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelCapability, inferAudioInputSupport } from '../src/modelCapabilities.js';

test('detects audio support from explicit model modalities', () => {
  assert.equal(inferAudioInputSupport({ id: 'custom-model', input_modalities: ['text', 'audio'] }), true);
  assert.deepEqual(buildModelCapability('custom-model', { modalities: ['text'] }), {
    id: 'custom-model',
    supportsAudioInput: false,
  });
});

test('detects known OpenAI audio/realtime model names conservatively', () => {
  assert.equal(inferAudioInputSupport({ id: 'gpt-4o-mini-audio-preview' }), true);
  assert.equal(inferAudioInputSupport({ id: 'gpt-4o-realtime-preview' }), true);
  assert.equal(inferAudioInputSupport({ id: 'gpt-4o-mini' }), false);
});
