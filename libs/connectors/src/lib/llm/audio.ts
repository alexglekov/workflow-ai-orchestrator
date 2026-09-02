import { resolveLlm } from './resolve';

const asBuffer = (value: unknown): Buffer | null => {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return Buffer.from(value, 'base64');
    } catch {
      return null;
    }
  }

  return null;
};

const transcribeOpenAi = async (
  apiKey: string,
  baseUrl: string,
  buffer: Buffer,
  filename: string,
): Promise<string> => {
  const form = new FormData();
  form.append('model', process.env['OPENAI_TRANSCRIBE_MODEL'] || 'whisper-1');
  form.append(
    'file',
    new Blob([new Uint8Array(buffer)], { type: 'audio/ogg' }),
    filename,
  );

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    },
  );
  const body = (await response.json()) as {
    text?: string;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(body.error?.message || `Whisper HTTP ${response.status}`);
  }

  return (body.text || '').trim();
};

const transcribeGeminiInline = async (
  apiKey: string,
  model: string,
  baseUrl: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> => {
  const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(
    /\/+$/,
    '',
  );
  const response = await fetch(
    `${base}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  mimeType: mimeType || 'audio/ogg',
                  data: buffer.toString('base64'),
                },
              },
              {
                text: 'Расшифруй аудио в текст на языке оригинала. Верни только транскрипт, без пояснений.',
              },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const body = (await response.json()) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (!response.ok) {
    throw new Error(body.error?.message || `Gemini STT HTTP ${response.status}`);
  }

  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text || '')
    .join('')
    .trim();
};

export const transcribeAudio = async (options: {
  buffer: Buffer;
  filename?: string;
  mimeType?: string;
  credentials?: Record<string, string>;
}): Promise<string> => {
  const llm = resolveLlm(options.credentials);
  const filename = options.filename || 'voice.ogg';
  const mimeType = options.mimeType || 'audio/ogg';

  if (llm.provider === 'openai' && llm.apiKey) {
    return transcribeOpenAi(llm.apiKey, llm.baseUrl, options.buffer, filename);
  }

  if (llm.apiKey) {
    return transcribeGeminiInline(
      llm.apiKey,
      llm.model,
      llm.baseUrl,
      options.buffer,
      mimeType,
    );
  }

  const openaiKey = process.env['OPENAI_API_KEY'] || '';

  if (openaiKey) {
    return transcribeOpenAi(
      openaiKey,
      process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
      options.buffer,
      filename,
    );
  }

  throw new Error('Для распознавания голоса нужен GEMINI_API_KEY или OPENAI_API_KEY');
};

export const speakText = async (options: {
  text: string;
  voice?: string;
  credentials?: Record<string, string>;
}): Promise<{ buffer: Buffer; mimeType: string; audioBase64: string }> => {
  const openaiKey =
    options.credentials?.['apiKey'] &&
    (options.credentials['provider'] || '') === 'openai'
      ? options.credentials['apiKey']
      : process.env['OPENAI_API_KEY'] || options.credentials?.['apiKey'] || '';
  const base =
    process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1';

  if (!openaiKey) {
    throw new Error(
      'Озвучка send_voice/llm.speak сейчас идёт через OpenAI TTS. Задайте OPENAI_API_KEY или отправьте текст через telegram.send_message',
    );
  }

  const response = await fetch(`${base.replace(/\/+$/, '')}/audio/speech`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env['OPENAI_TTS_MODEL'] || 'tts-1',
      voice: options.voice || process.env['OPENAI_TTS_VOICE'] || 'alloy',
      input: options.text.slice(0, 4000),
      response_format: 'opus',
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err.slice(0, 400) || `OpenAI TTS HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return {
    buffer,
    mimeType: 'audio/ogg',
    audioBase64: buffer.toString('base64'),
  };
};

export const bufferFromPrevious = (previous: unknown): Buffer | null => {
  if (!previous || typeof previous !== 'object') {
    return asBuffer(previous);
  }

  const record = previous as Record<string, unknown>;

  return asBuffer(record['audioBase64'] || record['audio']);
};
