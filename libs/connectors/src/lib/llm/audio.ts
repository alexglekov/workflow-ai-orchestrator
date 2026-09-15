import { QWEN_DEFAULT_BASE_URL, resolveLlm } from './resolve';
import { wavToOpus } from './opus';

/** У DashScope два пути: OpenAI-совместимый для чата и нативный для аудио. */
const qwenNativeBase = (baseUrl?: string): string =>
  (baseUrl || process.env['QWEN_BASE_URL'] || QWEN_DEFAULT_BASE_URL)
    .replace(/\/+$/, '')
    .replace(/\/compatible-mode\/v1$/, '/api/v1');

const qwenKeyFrom = (credentials?: Record<string, string>): string =>
  credentials?.['apiKey'] || process.env['QWEN_API_KEY'] || '';

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

/** Qwen ASR принимает аудио как data-URL в мультимодальном сообщении. */
const transcribeQwen = async (
  apiKey: string,
  baseUrl: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string> => {
  const response = await fetch(
    `${qwenNativeBase(baseUrl)}/services/aigc/multimodal-generation/generation`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env['QWEN_TRANSCRIBE_MODEL'] || 'qwen3-asr-flash',
        input: {
          messages: [
            {
              role: 'user',
              content: [
                {
                  audio: `data:${mimeType || 'audio/ogg'};base64,${buffer.toString('base64')}`,
                },
              ],
            },
          ],
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const body = (await response.json()) as {
    code?: string;
    message?: string;
    output?: {
      choices?: Array<{
        message?: { content?: Array<{ text?: string }> | string };
      }>;
    };
  };

  if (!response.ok) {
    throw new Error(
      body.message || `Qwen ASR HTTP ${response.status}`,
    );
  }

  const content = body.output?.choices?.[0]?.message?.content;

  if (typeof content === 'string') {
    return content.trim();
  }

  return (content ?? [])
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
  const mimeType = options.mimeType || 'audio/ogg';
  const apiKey = llm.apiKey || qwenKeyFrom(options.credentials);

  if (!apiKey) {
    throw new Error('Для распознавания голоса нужен QWEN_API_KEY');
  }

  return transcribeQwen(apiKey, llm.baseUrl, options.buffer, mimeType);
};

/** Явный язык Qwen TTS звучит заметно лучше, чем автоопределение. */
const qwenLanguage = (text: string): string =>
  /[\u0400-\u04ff]/.test(text) ? 'Russian' : 'Auto';

export const speakText = async (options: {
  text: string;
  voice?: string;
  credentials?: Record<string, string>;
}): Promise<{ buffer: Buffer; mimeType: string; audioBase64: string }> => {
  const apiKey = qwenKeyFrom(options.credentials);

  if (!apiKey) {
    throw new Error(
      'Озвучка send_voice/llm.speak идёт через Qwen TTS. Задайте QWEN_API_KEY или отправьте текст через telegram.send_message',
    );
  }

  const response = await fetch(
    `${qwenNativeBase(options.credentials?.['baseUrl'])}/services/aigc/multimodal-generation/generation`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env['QWEN_TTS_MODEL'] || 'qwen3-tts-flash',
        input: {
          text: options.text.slice(0, 600),
          voice: options.voice || process.env['QWEN_TTS_VOICE'] || 'Cherry',
          language_type: qwenLanguage(options.text),
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const body = (await response.json()) as {
    code?: string;
    message?: string;
    output?: { audio?: { url?: string; data?: string } };
  };

  if (!response.ok) {
    throw new Error(
      (body.message || '').slice(0, 400) || `Qwen TTS HTTP ${response.status}`,
    );
  }

  const url = body.output?.audio?.url;
  const inline = body.output?.audio?.data;
  let wav: Buffer;

  if (url) {
    const audio = await fetch(url, { signal: AbortSignal.timeout(60_000) });

    if (!audio.ok) {
      throw new Error(`Не удалось скачать озвучку: HTTP ${audio.status}`);
    }

    wav = Buffer.from(await audio.arrayBuffer());
  } else if (inline) {
    wav = Buffer.from(inline, 'base64');
  } else {
    throw new Error('Qwen TTS не вернул аудио');
  }

  const opus = await wavToOpus(wav);
  const buffer = opus ?? wav;

  return {
    buffer,
    mimeType: opus ? 'audio/ogg' : 'audio/wav',
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
