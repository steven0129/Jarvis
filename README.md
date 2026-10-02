# Jarvis OpenAI Audio Server

這是一個以 OpenAI API 為 backend 的小型 Web Server。啟動後會提供一個網頁，讓你選擇模型、錄音、檢查目前模型是否支援音訊輸入，並自動選擇路由：

- 支援 multimodal/audio input：直接把音訊送給模型。
- 不支援音訊輸入：先用 Whisper 轉成文字，再把逐字稿送給後面的模型。

## 安裝

```bash
npm install
cp .env.example .env
```

編輯 `.env`：

```bash
OPENAI_API_KEY=你的 OpenAI API Key
OPENAI_MODEL=gpt-4o-mini
WHISPER_MODEL=whisper-1
```

如果你使用相容 OpenAI API 的 gateway，也可以設定 `OPENAI_BASE_URL`。

## 啟動

```bash
npm start
```

打開 http://localhost:3000 。

## 測試

```bash
npm test
```

## API

### `GET /api/model/:modelId/capability`

回傳 server 判斷的模型音訊輸入能力：

```json
{
  "id": "gpt-4o-mini-audio-preview",
  "supportsAudioInput": true
}
```

Server 會優先使用 OpenAI Models API 的 metadata；如果 provider 沒有提供明確 metadata，會用保守的模型名稱規則 fallback。

### `POST /api/audio-chat`

`multipart/form-data`：

- `audio`: 音訊檔
- `model`: 目標模型
- `prompt`: 給模型的提示詞

回傳：

```json
{
  "model": "gpt-4o-mini",
  "route": "whisper-then-text",
  "supportsAudioInput": false,
  "transcript": "...",
  "answer": "..."
}
```
