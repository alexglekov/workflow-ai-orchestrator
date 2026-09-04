import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import {
  firstNonEmpty,
  interpolate,
  stringifyResult,
} from '../interpolate';
import { completeLlm } from './complete';
import { parseJsonObject } from './parse-json';
import { resolveLlm } from './resolve';
import { bufferFromPrevious, speakText, transcribeAudio } from './audio';

const asLabels = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const asSchema = (value: unknown): Record<string, unknown> | string => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return value.trim();
    }

    return value.trim();
  }

  return {};
};

const sourceText = (
  params: Record<string, unknown>,
  previous: unknown,
): string => {
  const fromParams = firstNonEmpty(params['text'], params['input']);
  const record =
    previous && typeof previous === 'object'
      ? (previous as Record<string, unknown>)
      : {};
  const tables = Array.isArray(record['tables'])
    ? `\n\nТаблицы:\n${JSON.stringify(record['tables']).slice(0, 8000)}`
    : '';
  const fromPrevious = firstNonEmpty(
    record['text'],
    record['subject'],
    record['body'],
    typeof previous === 'string' ? previous : '',
  );

  if (fromParams) {
    return fromParams;
  }

  if (fromPrevious || tables) {
    return `${fromPrevious}${tables}`.trim();
  }

  return stringifyResult(previous);
};

const GENERATE_SYSTEM = [
  'Ты пишешь готовый текст, который сразу уйдёт пользователю (Telegram, почта, отчёт).',
  'Верни только этот текст: без преамбулы, без кавычек вокруг всего ответа, без markdown-ограждений.',
  'Запрещено: код, функции, скрипты, JSON, инструкции для n8n/Make/Pipedream, комментарии //, блоки ```.',
  'Если в контексте есть числа — подставь их в текст. Не описывай, как посчитать, а посчитай сам.',
].join(' ');

const unwrapFences = (value: string): string => {
  const trimmed = value.trim();
  const fenced = /^```[a-zA-Z0-9_-]*\s*\n?([\s\S]*?)\n?```$/m.exec(trimmed);

  if (fenced) {
    return fenced[1].trim();
  }

  return trimmed
    .replace(/^```[a-zA-Z0-9_-]*\s*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
};

const looksLikeCode = (value: string): boolean => {
  const body = unwrapFences(value);
  const signals = [
    /(?:^|\n)\s*(?:const|let|var|function|class|import|export|return)\b/,
    /\/\/\s*Код для интеграции/i,
    /\bn8n\b|\bPipedream\b|\bMake\b/,
    /\bparseFloat\s*\(/,
    /\bmodule\.exports\b/,
  ];

  return signals.filter((pattern) => pattern.test(body)).length >= 2;
};

const generatePlainText = async (
  llm: ReturnType<typeof resolveLlm>,
  instruction: string,
  context: string,
  signal?: AbortSignal,
): Promise<string> => {
  const ask = (extra?: string) =>
    completeLlm({
      ...llm,
      timeoutMs: 45_000,
      signal,
      messages: [
        { role: 'system', content: GENERATE_SYSTEM },
        {
          role: 'user',
          content: [
            instruction,
            extra,
            `Контекст:\n${context.slice(0, 24_000)}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
      temperature: extra ? 0.2 : 0.4,
    });

  let generated = unwrapFences(await ask());

  if (looksLikeCode(generated)) {
    generated = unwrapFences(
      await ask(
        'Предыдущий ответ был кодом. Сейчас напиши только готовое сообщение человеку, с уже подставленными числами и эмодзи, без кода.',
      ),
    );
  }

  return generated;
};

const runJson = async (
  credentials: Record<string, string>,
  system: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> => {
  const llm = resolveLlm(credentials);
  const text = await completeLlm({
    ...llm,
    timeoutMs: 45_000,
    signal,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
    json: true,
  });

  return parseJsonObject(text);
};

export const llmConnector: Connector = {
  id: 'llm',
  name: 'LLM',
  description:
    'Извлечение полей, классификация и генерация текста во время запуска. Ключ из подключения или GEMINI_API_KEY / QWEN_API_KEY',
  credentialFields: [
    {
      key: 'provider',
      label: 'Провайдер',
      type: 'select',
      options: [
        { value: 'gemini', label: 'Gemini' },
        { value: 'qwen', label: 'Qwen' },
      ],
    },
    {
      key: 'apiKey',
      label: 'API-ключ (необязательно, иначе из .env)',
      secret: true,
      placeholder: 'Оставьте пустым, чтобы взять ключ из окружения',
    },
    {
      key: 'model',
      label: 'Модель (необязательно)',
      placeholder: 'gemini-3.6-flash или qwen-plus',
    },
  ],
  actions: [
    {
      id: 'extract',
      name: 'Извлечь поля',
      description:
        'Достаёт структурированные поля из текста/страницы по JSON-схеме',
      paramsSchema: {
        text: {
          type: 'string',
          description: 'Текст. По умолчанию {{previous.text}}',
        },
        schema: {
          type: 'object',
          required: true,
          description: 'Ожидаемые поля, например {"btcRub":"number"}',
        },
        instruction: {
          type: 'string',
          description: 'Доп. указание модели',
        },
      },
    },
    {
      id: 'classify',
      name: 'Классифицировать',
      description: 'Выбирает одну метку из списка и коротко объясняет',
      paramsSchema: {
        text: { type: 'string', description: 'Текст. Иначе предыдущий шаг' },
        labels: {
          type: 'string',
          required: true,
          description: 'Метки через запятую или массив',
        },
        instruction: { type: 'string', description: 'Критерии выбора' },
      },
    },
    {
      id: 'generate',
      name: 'Сгенерировать текст',
      description:
        'Пишет готовый текст для человека (Telegram, письмо). Не код и не JSON',
      paramsSchema: {
        instruction: {
          type: 'string',
          required: true,
          description: 'Что написать',
        },
        text: {
          type: 'string',
          description: 'Контекст. По умолчанию предыдущий шаг',
        },
      },
    },
    {
      id: 'transcribe',
      name: 'Распознать речь',
      description: 'Аудио (base64 с предыдущего шага) → текст. Gemini inline или Qwen ASR',
      paramsSchema: {
        audioBase64: { type: 'string', description: 'Если нет — previous.audioBase64' },
      },
    },
    {
      id: 'speak',
      name: 'Озвучить текст',
      description: 'TTS через Qwen. Нужен QWEN_API_KEY. Результат: audioBase64',
      paramsSchema: {
        text: { type: 'string', description: 'Текст. Иначе previous.text' },
        voice: { type: 'string', description: 'Голос Qwen: Cherry | Ethan | Jennifer | Ryan | Katerina' },
      },
    },
  ],
  testConnection: async (credentials) => {
    try {
      const llm = resolveLlm(credentials);

      if (!llm.apiKey) {
        return {
          ok: false,
          error: 'Задайте API-ключ в подключении или в GEMINI_API_KEY / QWEN_API_KEY',
        };
      }

      const text = await completeLlm({
        ...llm,
        messages: [
          { role: 'user', content: 'Ответь одним словом: ok' },
        ],
        temperature: 0,
      });

      return {
        ok: true,
        message: `${llm.provider}/${llm.model}: ${text.slice(0, 80)}`,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'LLM connection failed',
      };
    }
  },
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    const params = interpolate(
      input.params,
      input.context ?? input.previousResult,
    ) as Record<string, unknown>;

    try {
      if (input.action === 'extract') {
        const schema = asSchema(params['schema']);
        const empty =
          typeof schema === 'string'
            ? !schema
            : Object.keys(schema).length === 0;

        if (empty) {
          return { ok: false, error: 'Укажите schema — ожидаемые поля' };
        }

        const text = sourceText(params, input.previousResult);

        if (!text.trim()) {
          return { ok: false, error: 'Нет текста для извлечения' };
        }

        const extra = firstNonEmpty(params['instruction']);
        const data = await runJson(
          input.credentials,
          [
            'Ты извлекаешь структурированные данные из текста.',
            'Верни только JSON-объект с полями из схемы. Числа — числами, без валютных символов.',
            'Если поля нет в тексте — null. Не выдумывай.',
            extra ? `Дополнительно: ${extra}` : '',
          ]
            .filter(Boolean)
            .join(' '),
          `Схема полей:\n${JSON.stringify(schema, null, 2)}\n\nТекст:\n${text.slice(0, 24_000)}`,
          input.signal,
        );

        return { ok: true, data };
      }

      if (input.action === 'classify') {
        const labels = asLabels(params['labels']);

        if (labels.length === 0) {
          return { ok: false, error: 'Укажите labels' };
        }

        const text = sourceText(params, input.previousResult);

        if (!text.trim()) {
          return { ok: false, error: 'Нет текста для классификации' };
        }

        const extra = firstNonEmpty(params['instruction']);
        const data = await runJson(
          input.credentials,
          [
            'Ты классификатор. Верни JSON {"label":"...","reason":"кратко"}.',
            `label — ровно одна из меток: ${labels.join(', ')}.`,
            extra ? `Критерии: ${extra}` : '',
          ]
            .filter(Boolean)
            .join(' '),
          text.slice(0, 24_000),
          input.signal,
        );
        const label = String(data['label'] || '').trim();

        if (!labels.includes(label)) {
          data['label'] = labels[0];
          data['matched'] = false;
        } else {
          data['matched'] = true;
        }

        return { ok: true, data };
      }

      if (input.action === 'generate') {
        const instruction = firstNonEmpty(params['instruction']);

        if (!instruction) {
          return { ok: false, error: 'Укажите instruction' };
        }

        const text = sourceText(params, input.previousResult);
        const llm = resolveLlm(input.credentials);
        const generated = await generatePlainText(
          llm,
          instruction,
          text,
          input.signal,
        );

        return { ok: true, data: { text: generated } };
      }

      if (input.action === 'transcribe') {
        const buffer =
          bufferFromPrevious({
            audioBase64: params['audioBase64'],
          }) || bufferFromPrevious(input.previousResult);

        if (!buffer) {
          return { ok: false, error: 'Нет аудио (audioBase64)' };
        }

        const text = await transcribeAudio({
          buffer,
          credentials: input.credentials,
        });

        return { ok: true, data: { text } };
      }

      if (input.action === 'speak') {
        const text = firstNonEmpty(
          params['text'],
          sourceText(params, input.previousResult),
        );

        if (!text) {
          return { ok: false, error: 'Нет текста для озвучки' };
        }

        const spoken = await speakText({
          text,
          voice: firstNonEmpty(params['voice']),
          credentials: input.credentials,
        });

        return {
          ok: true,
          data: {
            text,
            audioBase64: spoken.audioBase64,
            mimeType: spoken.mimeType,
          },
        };
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'LLM connector error',
      };
    }
  },
};
