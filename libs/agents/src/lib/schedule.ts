import { completeLlm, type LlmProviderId } from '@ai-worker/connectors';
import {
  clampScheduleIntent,
  looksLikeSchedule,
  parseScheduleIntent,
  type ScheduleIntent,
} from '@ai-worker/workflow';
import { agentConfig } from './config';

export const SCHEDULE_SYSTEM_PROMPT = `Ты извлекаешь расписание автозапуска workflow.
Пойми смысл даже с опечатками и сленгом: кажлый/кждый/кажый час = каждый час, каждуб минуту = каждую минуту, каждое утро в 9 = 09:00, раз в час = 60 минут.
Верни только JSON: {"everyMinutes":number|null,"at":"HH:MM"|null}
Правила:
- everyMinutes — интервал в минутах от 1 до 10080. Каждый час = 60, каждые 5 минут = 5, каждые 2 часа = 120, ежедневно = 1440.
- at — только для ежедневного времени, формат HH:MM (24 часа). Тогда everyMinutes=1440.
- Разовый запуск, «подожди минуту», нет периодичности → {"everyMinutes":null,"at":null}.
Не выдумывай расписание, которого нет в тексте.`;

const credentials = () => {
  if (agentConfig.qwenKey()) {
    return {
      provider: 'qwen' as LlmProviderId,
      apiKey: agentConfig.qwenKey(),
      model: agentConfig.qwenModel(),
      baseUrl: agentConfig.qwenBaseUrl(),
    };
  }

  if (agentConfig.openaiKey()) {
    return {
      provider: 'openai' as LlmProviderId,
      apiKey: agentConfig.openaiKey(),
      model: agentConfig.openaiModel(),
      baseUrl: agentConfig.openaiBaseUrl(),
    };
  }

  return null;
};

export const parseScheduleReply = (text: string): ScheduleIntent | null => {
  try {
    const parsed = JSON.parse(
      text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '').trim(),
    ) as unknown;

    return clampScheduleIntent(parsed);
  } catch {
    return null;
  }
};

export const inferScheduleIntent = async (
  text: string,
): Promise<ScheduleIntent | null> => {
  const fromRegex = parseScheduleIntent(text);

  if (fromRegex) {
    return fromRegex;
  }

  if (!looksLikeSchedule(text)) {
    return null;
  }

  const creds = credentials();

  if (!creds) {
    return null;
  }

  try {
    const reply = await completeLlm({
      ...creds,
      temperature: 0,
      json: true,
      timeoutMs: 12_000,
      messages: [
        { role: 'system', content: SCHEDULE_SYSTEM_PROMPT },
        { role: 'user', content: text.slice(0, 4000) },
      ],
    });

    return parseScheduleReply(reply);
  } catch {
    return null;
  }
};
