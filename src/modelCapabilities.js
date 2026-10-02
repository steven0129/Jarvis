const AUDIO_INPUT_MODALITIES = new Set(['audio', 'realtime']);

export function normalizeModel(model) {
  return String(model || '').trim().toLowerCase();
}

export function inferAudioInputSupport(modelInfo = {}) {
  const id = normalizeModel(modelInfo.id || modelInfo.model || modelInfo.name);
  const modalities = [
    ...(Array.isArray(modelInfo.input_modalities) ? modelInfo.input_modalities : []),
    ...(Array.isArray(modelInfo.modalities) ? modelInfo.modalities : []),
  ].map((value) => String(value).toLowerCase());

  if (modalities.some((modality) => AUDIO_INPUT_MODALITIES.has(modality))) {
    return true;
  }

  if (modelInfo.capabilities?.audio === true || modelInfo.capabilities?.audio_input === true) {
    return true;
  }

  // OpenAI model metadata is not always explicit about audio input support, so
  // keep the fallback deliberately conservative. Plain GPT-4o/GPT-4.1 models
  // are multimodal for images, but not necessarily chat-completions audio input.
  return /(^|-)gpt-4o(-mini)?-audio|realtime|audio-preview/.test(id);
}

export function buildModelCapability(modelId, modelInfo = {}) {
  return {
    id: modelId,
    supportsAudioInput: inferAudioInputSupport({ ...modelInfo, id: modelId }),
  };
}
