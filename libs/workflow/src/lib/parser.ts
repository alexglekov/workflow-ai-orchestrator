import type { Connector } from '@ai-worker/connectors';
import type { ParsedStep } from './types';

const EXAMPLE_PROMPT =
  'Взять новые заявки из почты, извлечь имя телефон компанию и сумму, создать запись в 1С, добавить строку в Excel и отправить уведомление в Telegram';

export const fallbackParse = (prompt: string): ParsedStep[] => {
  const text = prompt.toLowerCase();
  const steps: ParsedStep[] = [];

  const wantsMail = /почт|mail|email|письм|заявк/.test(text);
  const wantsOneC = /1с|1c|onec/.test(text);
  const wantsExcel = /excel|эксель|таблиц|xlsx/.test(text);
  const wantsTelegram = /telegram|телеграм/.test(text);
  const excelName =
    prompt.match(/["«]([^"»]+\.xlsx?)["»]/i)?.[1] ||
    prompt.match(/\b([\w.-]+\.xlsx?)\b/i)?.[1] ||
    '';
  const excelUrl = (
    prompt.match(/https?:\/\/[^\s)\]>'"]+/i)?.[0] || ''
  ).replace(/[.,;]+$/u, '');
  const excelLink =
    excelUrl &&
    /xlsx|docs\.google|drive\.google|disk\.yandex|yadi\.sk/i.test(excelUrl)
      ? excelUrl
      : '';

  if (wantsMail || steps.length === 0) {
    steps.push({
      title: 'Проверить новые письма с заявками',
      connectorId: 'mail',
      action: 'fetch_new',
      params: { subjectContains: 'заявк', limit: 5 },
    });
  }

  if (wantsOneC) {
    steps.push({
      title: 'Создать запись в 1С',
      connectorId: 'onec',
      action: 'create_record',
      params: {},
    });
  }

  if (wantsExcel) {
    const fileName = excelName || undefined;
    const fileUrl = excelLink || undefined;

    if (fileUrl) {
      steps.push({
        title: 'Открыть Excel по ссылке',
        connectorId: 'excel',
        action: 'find_file',
        params: { fileUrl },
      });
    } else if (/найти|диск|drive|яндекс|google/.test(text) || fileName) {
      steps.push({
        title: fileName
          ? `Найти Excel «${fileName}»`
          : 'Найти Excel по названию',
        connectorId: 'excel',
        action: 'find_file',
        params: fileName ? { fileName } : {},
      });
    }

    steps.push({
      title: 'Добавить строку в Excel',
      connectorId: 'excel',
      action: 'append_row',
      params: fileUrl ? { fileUrl } : fileName ? { fileName } : {},
    });
  }

  if (wantsTelegram) {
    steps.push({
      title: 'Отправить уведомление в Telegram',
      connectorId: 'telegram',
      action: 'send_message',
      params: {
        text: 'Новая заявка: {{previous.name}}, {{previous.phone}}, {{previous.company}}, {{previous.amount}}',
      },
    });
  }

  if (steps.length === 0) {
    return fallbackParse(EXAMPLE_PROMPT);
  }

  return steps.slice(0, 5);
};

export const parsePromptToSteps = async (
  prompt: string,
  connectors: Connector[],
): Promise<ParsedStep[]> => {
  const key = process.env['OPENAI_API_KEY'];

  if (!key) {
    return fallbackParse(prompt);
  }

  const catalog = connectors.map((connector) => ({
    id: connector.id,
    name: connector.name,
    actions: connector.actions.map((action) => ({
      id: action.id,
      name: action.name,
      description: action.description,
    })),
  }));

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
              content: `Ты планировщик workflow. Разложи задачу пользователя в 3-5 последовательных шагов.
Доступные коннекторы: ${JSON.stringify(catalog)}.
Верни JSON: {"name":"кратко","steps":[{"title":"...","connectorId":"...","action":"...","params":{}}]}.
Передавай данные дальше через params с плейсхолдерами {{previous.field}}.`,
            },
            { role: 'user', content: prompt },
          ],
        }),
      },
    );

    if (!response.ok) {
      return fallbackParse(prompt);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(content) as { steps?: ParsedStep[] };

    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return fallbackParse(prompt);
    }

    return parsed.steps.slice(0, 5).map((step) => ({
      title: step.title || `${step.connectorId}.${step.action}`,
      connectorId: step.connectorId,
      action: step.action,
      params: step.params && typeof step.params === 'object' ? step.params : {},
    }));
  } catch {
    return fallbackParse(prompt);
  }
};
