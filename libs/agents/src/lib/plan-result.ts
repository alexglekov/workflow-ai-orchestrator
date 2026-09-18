import type {
  AgentContext,
  AgentPlanResult,
  AgentPlannedStep,
} from './types';
import { clampScheduleIntent } from '@ai-worker/workflow';
import {
  searchFreshness,
  shapeSearchQuery,
} from '../../../connectors/src/lib/web/query';
import { namedSite, wantsPageVisit, p2pPageUrl, p2pSearchQuery, bestchangePageUrl } from '../../../connectors/src/lib/web/site';

const stripFences = (text: string): string =>
  text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '').trim();

const asSteps = (value: unknown): AgentPlannedStep[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const step = item as Partial<AgentPlannedStep>;

      return {
        title: String(step.title || `${step.connectorId}.${step.action}`),
        connectorId: String(step.connectorId || ''),
        action: String(step.action || ''),
        params:
          step.params && typeof step.params === 'object' ? step.params : {},
        iterate: Boolean(step.iterate),
      };
    })
    .filter((step) => step.connectorId && step.action)
    .slice(0, 8);
};

const asQuestions = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3);
};

const asTelegramKind = (value: unknown): AgentPlanResult['telegramKind'] =>
  value === 'bot' || value === 'business' ? value : undefined;

export const parsePlanResponse = (
  text: string,
  providerId: string,
): AgentPlanResult => {
  try {
    const parsed = JSON.parse(stripFences(text)) as {
      kind?: string;
      message?: string;
      questions?: unknown;
      connectors?: unknown;
      name?: string;
      telegramKind?: unknown;
      schedule?: unknown;
      steps?: unknown;
    };
    const questions = asQuestions(parsed.questions);
    const steps = asSteps(parsed.steps);
    const kind =
      parsed.kind === 'questions' || (questions.length > 0 && steps.length === 0)
        ? 'questions'
        : 'workflow';
    const schedule = clampScheduleIntent(parsed.schedule);

    return {
      kind,
      providerId,
      message: String(parsed.message || '').trim(),
      questions,
      connectors: Array.isArray(parsed.connectors)
        ? parsed.connectors.map((item) => String(item))
        : steps.map((step) => step.connectorId),
      name: parsed.name ? String(parsed.name) : undefined,
      telegramKind: asTelegramKind(parsed.telegramKind),
      schedule: schedule ?? undefined,
      steps,
    };
  } catch {
    return {
      kind: 'questions',
      providerId,
      message: 'Не получилось разобрать ответ агента. Уточните задачу.',
      questions: ['Какие сервисы из доступных коннекторов нужно использовать?'],
      connectors: [],
      steps: [],
    };
  }
};

const compact = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const isOpenWebQuery = (text: string): boolean =>
  /p2p|п2п|оферт|лучш(?:ие|их)\s+предложен/i.test(text);

const wantsInAppChat = (text: string): boolean => {
  const namesTelegram = /телеграм|telegram|(?<![\p{L}])тг(?![\p{L}])/iu.test(
    text,
  );
  const rejectsTelegram =
    /не\s+в\s+(?:телеграм|telegram|тг)|не\s+(?:в\s+)?телеграм|без\s+телеграм/iu.test(
      text,
    );

  if (namesTelegram && !rejectsTelegram) {
    return false;
  }

  return /(?:^|[^\p{L}])(?:в|сюда(?:\s+в)?)\s+(?:этот\s+|наш\s+)?чат(?![\p{L}])|в этом чате|(?:напиши|отправь|пришли)(?:те)?\s+(?:мне\s+)?сюда(?![\p{L}])/iu.test(
    text,
  );
};

const scrubSearchPlan = <
  T extends {
    connectorId: string;
    action: string;
    params?: Record<string, unknown>;
  },
>(
  steps: T[],
  source = '',
): T[] => {
  const seen = new Set<string>();

  return steps.flatMap((step) => {
    if (step.connectorId !== 'web' || step.action !== 'search') {
      return [step];
    }

    const params = { ...(step.params ?? {}) };
    const query =
      p2pSearchQuery(String(params.query || source)) ||
      shapeSearchQuery(String(params.query || source), {
        stamp: false,
      });
    const blob = `${query} ${source}`;
    const site = namedSite(blob)?.host || namedSite(source)?.host;
    const p2p = isOpenWebQuery(blob);
    const openWeb = p2p && !site;

    if (query) {
      params.query = query;
    }

    if (site && !params.site) {
      params.site = site;
    }

    if (openWeb) {
      delete params.site;
    }

    const freshness = searchFreshness(blob);

    if (freshness) {
      params.freshness =
        p2p && params.freshness === 'day' ? 'week' : params.freshness || freshness;
    } else if (openWeb) {
      delete params.freshness;
    }

    const key = `${params.query}|${params.site || ''}|${params.freshness || ''}`;

    if (seen.has(key)) {
      return [];
    }

    seen.add(key);

    return [{ ...step, params }];
  });
};

const stepKey = (step: { connectorId: string; action: string }) =>
  `${step.connectorId}.${step.action}`;

/** Одна и та же цепочка часто приходит дважды: LLM копирует текущий workflow. */
export const collapseDuplicateSteps = <
  T extends { connectorId: string; action: string },
>(
  steps: T[],
): T[] => {
  if (steps.length >= 2 && steps.length % 2 === 0) {
    const mid = steps.length / 2;
    const doubled = steps
      .slice(0, mid)
      .every((step, index) => stepKey(step) === stepKey(steps[mid + index]));

    if (doubled) {
      steps = steps.slice(0, mid);
    }
  }

  const seen = new Set<string>();

  return steps.filter((step) => {
    const key = stepKey(step);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
};

const resolveAction = (action: string, allowed: Set<string>): string | null => {
  if (allowed.has(action)) {
    return action;
  }

  const needle = compact(action);

  if (!needle) {
    return null;
  }

  const exact = [...allowed].find((id) => compact(id) === needle);

  if (exact) {
    return exact;
  }

  const partial = [...allowed].find((id) => {
    const idc = compact(id);

    return idc.includes(needle) || needle.includes(idc);
  });

  return partial ?? null;
};

const dumpPlaceholder = (text: string) =>
  /\{\{\s*previous(?:\.results|\.json|\.items|\.rows)?\s*\}\}/i.test(text) &&
  !/\{\{\s*previous\.text\s*\}\}/i.test(text);

const headingOnlyTemplate = (text: string) => {
  const stripped = text.replace(/\{\{[^}]+\}\}/g, '').trim();

  return stripped.length > 0 && stripped.length < 160 && /:$/.test(stripped);
};

const generateInstruction = (prompt: string) => {
  const task = prompt.trim().replace(/\s+/g, ' ').slice(0, 300);

  return [
    `Запрос пользователя: «${task}».`,
    'По тексту страницы и поиска составь готовый ответ человеку: только нужные факты, запрошенное количество пунктов и формат.',
    'Не оставляй один заголовок с двоеточием. Если топ-списка в данных нет — так и напиши, не выдумывай строки.',
    'Без преамбулы, кода, JSON и списка источников.',
  ].join(' ');
};

const repairDeliverySteps = (
  steps: AgentPlannedStep[],
  prompt: string,
  allowed: Map<string, Set<string>>,
): AgentPlannedStep[] => {
  const hasIncoming = steps.some(
    (step) => step.connectorId === 'telegram' && step.action === 'get_updates',
  );
  const hasWeb = steps.some(
    (step) =>
      step.connectorId === 'web' &&
      (step.action === 'fetch' || step.action === 'search' || step.action === 'rates'),
  );
  const hasGenerate = steps.some(
    (step) =>
      step.connectorId === 'llm' &&
      (step.action === 'generate' || step.action === 'extract'),
  );
  const canGenerate = Boolean(allowed.get('llm')?.has('generate'));
  // Всегда осмысливаем добытый веб-контент через LLM и вычленяем нужные данные.
  const wantsReport = hasWeb;

  const repaired = steps.map((step) => {
    const send =
      (step.connectorId === 'telegram' && step.action === 'send_message') ||
      (step.connectorId === 'mail' && step.action === 'send');

    if (!send) {
      return step;
    }

    const params = { ...(step.params ?? {}) };
    const text = String(params['text'] ?? '');

    if (!text.trim() || dumpPlaceholder(text) || headingOnlyTemplate(text)) {
      params['text'] = '{{previous.text}}';
    }

    if (!hasIncoming && /\{\{\s*item\.chatId\s*\}\}/i.test(String(params['chatId'] || ''))) {
      delete params['chatId'];
    }

    return { ...step, params, iterate: hasIncoming ? step.iterate : false };
  });

  if (!wantsReport || !canGenerate || hasGenerate) {
    return collapseDuplicateSteps(repaired);
  }

  const generateStep: AgentPlannedStep = {
    title: 'Собрать отчёт',
    connectorId: 'llm',
    action: 'generate',
    params: {
      instruction: generateInstruction(prompt),
      text: '{{previous.text}}',
    },
    iterate: false,
  };
  const sendIndex = repaired.findIndex(
    (step) =>
      (step.connectorId === 'telegram' && step.action === 'send_message') ||
      (step.connectorId === 'mail' && step.action === 'send'),
  );
  const withGenerate =
    sendIndex >= 0
      ? [
          ...repaired.slice(0, sendIndex),
          generateStep,
          ...repaired.slice(sendIndex),
        ]
      : [...repaired, generateStep];

  return collapseDuplicateSteps(withGenerate);
};

export const sanitizePlan = (
  plan: AgentPlanResult,
  context: AgentContext,
  source = '',
): AgentPlanResult => {
  const allowed = new Map(
    context.connectors.map((connector) => [
      connector.id,
      new Set(connector.actions.map((action) => action.id)),
    ]),
  );
  const prompt = source || plan.message;
  let steps = collapseDuplicateSteps(
    scrubSearchPlan(
      plan.steps.flatMap((step) => {
        const actions = allowed.get(step.connectorId);

        if (!actions) {
          return [];
        }

        const action = resolveAction(step.action, actions);

        if (!action) {
          return [];
        }

        return [{ ...step, action }];
      }),
      prompt,
    ).filter((step) => {
      if (!wantsInAppChat(prompt)) {
        return true;
      }

      return !(
        (step.connectorId === 'telegram' && step.action === 'send_message') ||
        (step.connectorId === 'mail' && step.action === 'send')
      );
    }),
  );

  const canFetch = allowed.get('web')?.has('fetch');
  const canSearch = allowed.get('web')?.has('search');
  const visitPage =
    wantsPageVisit(prompt) || /топ|предложен|оферт|зайди/i.test(prompt);

  if (visitPage) {
    steps = steps.filter(
      (step) => !(step.connectorId === 'web' && step.action === 'rates'),
    );
  }

  const hasSearch = steps.some(
    (step) => step.connectorId === 'web' && step.action === 'search',
  );
  const hasFetch = steps.some(
    (step) => step.connectorId === 'web' && step.action === 'fetch',
  );
  const hasRates = steps.some(
    (step) => step.connectorId === 'web' && step.action === 'rates',
  );
  const needsPage =
    canFetch &&
    !hasFetch &&
    !hasRates &&
    // Всегда читаем саму страницу после Tavily: поиск даёт ссылку, данные — на странице.
    (hasSearch ||
      wantsPageVisit(prompt) ||
      /(найд|поищ|зайди)/i.test(prompt) ||
      /сводк|отч[её]т|топ\s*\d/i.test(prompt));

  if (needsPage) {
    const site = namedSite(prompt)?.host;
    const direct = p2pPageUrl(prompt) || bestchangePageUrl(prompt);
    const searchIndex = steps.findIndex(
      (step) => step.connectorId === 'web' && step.action === 'search',
    );
    const fetchStep = {
      title: 'Открыть страницу',
      connectorId: 'web',
      action: 'fetch',
      params: {
        url: direct || '{{previous.results.0.url}}',
        ...(site && !direct ? { site } : {}),
      },
      iterate: false,
    };

    if (searchIndex >= 0) {
      steps = collapseDuplicateSteps([
        ...steps.slice(0, searchIndex + 1),
        fetchStep,
        ...steps.slice(searchIndex + 1),
      ]);
    } else if (direct) {
      steps = collapseDuplicateSteps([fetchStep, ...steps]);
    } else if (canSearch && !hasSearch) {
      const searchStep = {
        title: 'Найти в вебе',
        connectorId: 'web',
        action: 'search',
        params: {
          query: shapeSearchQuery(prompt) || prompt.slice(0, 80),
          ...(site ? { site } : {}),
        },
        iterate: false,
      };
      steps = collapseDuplicateSteps([searchStep, fetchStep, ...steps]);
    }
  }

  const p2p = p2pPageUrl(prompt);
  const bestchange = bestchangePageUrl(prompt);
  const pinned = p2p || bestchange;

  if (pinned) {
    steps = steps.map((step) => {
      if (step.connectorId !== 'web' || step.action !== 'fetch') {
        return step;
      }

      return {
        ...step,
        params: { ...step.params, url: pinned },
      };
    });
  }

  steps = repairDeliverySteps(steps, prompt, allowed);

  const connectors = [...new Set(steps.map((step) => step.connectorId))];
  const telegramKind = connectors.includes('telegram')
    ? plan.telegramKind
    : undefined;

  if (plan.kind === 'questions') {
    const questions =
      plan.questions.length > 0
        ? plan.questions
        : ['Что именно нужно сделать и с какими сервисами?'];

    return {
      ...plan,
      kind: 'questions',
      steps: [],
      connectors: [],
      telegramKind: plan.telegramKind,
      questions,
      message:
        plan.message ||
        'Нужно чуть больше деталей, чтобы собрать workflow.',
    };
  }

  if (steps.length === 0) {
    return {
      kind: 'questions',
      providerId: plan.providerId,
      steps: [],
      connectors: [],
      questions: [
        'Какие сервисы из доступных коннекторов нужно задействовать?',
      ],
      message:
        'Не удалось сопоставить задачу с доступными коннекторами. Уточните сервисы.',
    };
  }

  return {
    ...plan,
    kind: 'workflow',
    steps,
    connectors,
    telegramKind,
    message:
      plan.message ||
      `Собрал цепочку: ${connectors.join(' → ')}.`,
  };
};
