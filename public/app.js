const modelInput = document.querySelector('#model');
const checkModelButton = document.querySelector('#checkModel');
const capability = document.querySelector('#capability');
const recordButton = document.querySelector('#record');
const stopButton = document.querySelector('#stop');
const sendButton = document.querySelector('#send');
const promptInput = document.querySelector('#prompt');
const playback = document.querySelector('#playback');
const recordingState = document.querySelector('#recordingState');
const route = document.querySelector('#route');
const supportsAudio = document.querySelector('#supportsAudio');
const transcript = document.querySelector('#transcript');
const answer = document.querySelector('#answer');

let audioContext;
let source;
let processor;
let recordingStream;
let recordedChunks = [];
let recordedBlob;
let recordingSampleRate = 44100;

function setStatus(element, message, className = '') {
  element.className = `status ${className}`.trim();
  element.textContent = message;
}

function encodeWav(chunks, sampleRate) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const samples = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (position, string) => {
    for (let i = 0; i < string.length; i += 1) view.setUint8(position + i, string.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let position = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(position, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    position += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function loadConfig() {
  const response = await fetch('/api/config');
  const config = await response.json();
  modelInput.value = config.defaultModel;
}

async function checkModel() {
  const model = modelInput.value.trim();
  if (!model) {
    setStatus(capability, 'Enter a model name.', 'error');
    return null;
  }
  setStatus(capability, 'Checking...');
  const response = await fetch(`/api/model/${encodeURIComponent(model)}/capability`);
  const data = await response.json();
  if (!response.ok) {
    setStatus(capability, data.error || 'Failed to check model capability.', 'error');
    return null;
  }
  setStatus(
    capability,
    data.supportsAudioInput
      ? 'This model supports audio input: WAV audio will be sent directly.'
      : 'Audio input support was not detected for this model: Whisper will transcribe it first.',
    data.supportsAudioInput ? 'ok' : 'warn',
  );
  return data;
}

async function startRecording() {
  recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new AudioContext();
  recordingSampleRate = audioContext.sampleRate;
  source = audioContext.createMediaStreamSource(recordingStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  recordedChunks = [];
  recordedBlob = null;

  processor.onaudioprocess = (event) => {
    recordedChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  recordButton.disabled = true;
  stopButton.disabled = false;
  sendButton.disabled = true;
  playback.hidden = true;
  setStatus(recordingState, 'Recording...');
}

async function stopRecording() {
  if (!audioContext) return;
  processor?.disconnect();
  source?.disconnect();
  recordingStream?.getTracks().forEach((track) => track.stop());
  await audioContext.close();

  recordedBlob = encodeWav(recordedChunks, recordingSampleRate);
  playback.src = URL.createObjectURL(recordedBlob);
  playback.hidden = false;
  sendButton.disabled = false;
  recordButton.disabled = false;
  stopButton.disabled = true;
  setStatus(recordingState, `Recording complete: ${Math.round(recordedBlob.size / 1024)} KB WAV`, 'ok');

  audioContext = null;
  source = null;
  processor = null;
  recordingStream = null;
}

async function sendAudio() {
  if (!recordedBlob) return;
  sendButton.disabled = true;
  answer.textContent = 'Processing...';
  transcript.textContent = '-';
  route.textContent = '-';
  supportsAudio.textContent = '-';

  const form = new FormData();
  form.append('model', modelInput.value.trim());
  form.append('prompt', promptInput.value.trim());
  form.append('audio', recordedBlob, 'recording.wav');

  const response = await fetch('/api/audio-chat', { method: 'POST', body: form });
  const data = await response.json();
  sendButton.disabled = false;

  if (!response.ok) {
    answer.textContent = data.error || 'Failed to send audio.';
    return;
  }

  route.textContent = data.route;
  supportsAudio.textContent = data.supportsAudioInput ? 'Yes' : 'No';
  transcript.textContent = data.transcript || '-';
  answer.textContent = data.answer || '(empty response)';
}

checkModelButton.addEventListener('click', checkModel);
recordButton.addEventListener('click', () => startRecording().catch((error) => setStatus(recordingState, error.message, 'error')));
stopButton.addEventListener('click', () => stopRecording().catch((error) => setStatus(recordingState, error.message, 'error')));
sendButton.addEventListener('click', () => sendAudio().catch((error) => {
  sendButton.disabled = false;
  answer.textContent = error.message;
}));

loadConfig().then(checkModel).catch((error) => setStatus(capability, error.message, 'error'));
