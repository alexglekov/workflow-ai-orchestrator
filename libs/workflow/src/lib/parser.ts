import type { Connector } from '@ai-worker/connectors';
import { planFromCatalog, type PlanCatalogConnector } from './catalog-plan';
import type { ParsedStep } from './types';

const toPlanCatalog = (connectors: Connector[]): PlanCatalogConnector[] =>
  connectors.map((connector) => ({
    id: connector.id,
    name: connector.name,
    description: connector.description,
    actions: connector.actions.map((action) => ({
      id: action.id,
      name: action.name,
      description: action.description,
    })),
  }));

const catalogJson = (connectors: Connector[]) =>
  connectors.map((connector) => ({
    id: connector.id,
    name: connector.name,
    description: connector.description,
    actions: connector.actions.map((action) => ({
      id: action.id,
      name: action.name,
      description: action.description,
      params: action.paramsSchema,
    })),
  }));

export const fallbackParse = (
  prompt: string,
  connectors: Connector[] = [],
): ParsedStep[] => {
  if (connectors.length > 0) {
    return planFromCatalog(prompt, toPlanCatalog(connectors));
  }

  return planFromCatalog(prompt, [
    {
      id: 'mail',
      name: 'Mail',
      actions: [
        { id: 'fetch_new', name: 'Получить новые письма' },
        { id: 'search', name: 'Найти письма' },
        { id: 'send', name: 'Отправить письмо' },
      ],
    },
    {
      id: 'web',
      name: 'Web',
      actions: [
        { id: 'search', name: 'Найти в вебе' },
        { id: 'fetch', name: 'Открыть страницу' },
        { id: 'rates', name: 'Курсы BestChange' },
      ],
    },
    {
      id: 'browser',
      name: 'Browser',
      actions: [{ id: 'open', name: 'Открыть страницу' }],
    },
    {
      id: 'excel',
      name: 'Excel',
      actions: [
        { id: 'find_file', name: 'Найти файл' },
        { id: 'read_rows', name: 'Прочитать строки' },
        { id: 'append_row', name: 'Добавить строку' },
      ],
    },
    {
      id: 'llm',
      name: 'LLM',
      actions: [
        { id: 'extract', name: 'Извлечь поля' },
        { id: 'classify', name: 'Классифицировать' },
        { id: 'generate', name: 'Сгенерировать текст' },
        { id: 'transcribe', name: 'Распознать речь' },
        { id: 'speak', name: 'Озвучить текст' },
      ],
    },
    {
      id: 'transform',
      name: 'Transform',
      actions: [
        { id: 'filter', name: 'Отфильтровать' },
        { id: 'sort', name: 'Отсортировать' },
        { id: 'pick', name: 'Выбрать поля' },
        { id: 'join', name: 'Склеить список' },
        { id: 'template', name: 'Собрать текст' },
      ],
    },
    {
      id: 'memory',
      name: 'Memory',
      actions: [
        { id: 'get', name: 'Прочитать' },
        { id: 'set', name: 'Записать' },
      ],
    },
    {
      id: 'onec',
      name: '1С',
      actions: [
        { id: 'query', name: 'Найти записи' },
        { id: 'get', name: 'Прочитать запись' },
        { id: 'create_record', name: 'Создать запись' },
        { id: 'update', name: 'Обновить запись' },
      ],
    },
    {
      id: 'telegram',
      name: 'Telegram',
      actions: [
        { id: 'get_updates', name: 'Получить входящие' },
        { id: 'send_message', name: 'Отправить сообщение' },
        { id: 'send_voice', name: 'Отправить голосовое' },
      ],
    },
    {
      id: 'social',
      name: 'Social',
      actions: [
        { id: 'followers', name: 'Подписчики' },
        { id: 'reels', name: 'Рилсы' },
      ],
    },
  ]);
};

export const parsePromptToSteps = async (
  prompt: string,
  connectors: Connector[],
): Promise<ParsedStep[]> => {
  const catalogFallback = () => fallbackParse(prompt, connectors);
  const key = process.env['OPENAI_API_KEY'];

  if (!key) {
    return catalogFallback();
  }

  try {
    const baseUrl =
      process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1';
    const model = process.env['OPENAI_MODEL'] || 'gpt-4o-mini';
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `Ты планировщик workflow. Разложи задачу пользователя в шаги.
Используй только действия из каталога. Выбери все действия, которые реально нужны по смыслу промпта, не только «типовую» цепочку почта→Excel→Telegram.
Доступные коннекторы и параметры: ${JSON.stringify(catalogJson(connectors))}.
Верни JSON: {"name":"кратко","steps":[{"title":"...","connectorId":"...","action":"...","params":{},"iterate":false}]}.
Параметры бери из текста пользователя. Данные между шагами: {{previous.field}}, {{item.field}}, {{input.field}}, {{steps.1.field}}.
iterate: true — если шаг для каждого письма или строки. transform.*, web.fetch, web.rates, social.followers, social.reels и onec.query без iterate.
Для курса/полей со страницы: web.fetch → llm.extract. Курсы BestChange — web.rates, не fetch. Instagram/VK/LinkedIn — social. Поиск в 1С — onec.query. Переписка в почте — mail.search.`,
            },
            { role: 'user', content: prompt },
          ],
        }),
      },
    );

    if (!response.ok) {
      return catalogFallback();
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content) as { steps?: ParsedStep[] };

    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return catalogFallback();
    }

    const allowed = new Map(
      connectors.map((connector) => [
        connector.id,
        new Set(connector.actions.map((action) => action.id)),
      ]),
    );

    const steps = parsed.steps
      .filter((step) => allowed.get(step.connectorId)?.has(step.action))
      .slice(0, 8)
      .map((step) => ({
        title: step.title || `${step.connectorId}.${step.action}`,
        connectorId: step.connectorId,
        action: step.action,
        params: step.params && typeof step.params === 'object' ? step.params : {},
        iterate: Boolean(step.iterate),
      }));

    return steps.length > 0 ? steps : catalogFallback();
  } catch {
    return catalogFallback();
  }
};
