import type {
  AgentContext,
  AgentPlanResult,
  AgentPlannedStep,
} from './types';

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
      steps?: unknown;
    };
    const questions = asQuestions(parsed.questions);
    const steps = asSteps(parsed.steps);
    const kind =
      parsed.kind === 'questions' || (questions.length > 0 && steps.length === 0)
        ? 'questions'
        : 'workflow';

    return {
      kind,
      providerId,
      message: String(parsed.message || '').trim(),
      questions,
      connectors: Array.isArray(parsed.connectors)
        ? parsed.connectors.map((item) => String(item))
        : steps.map((step) => step.connectorId),
      name: parsed.name ? String(parsed.name) : undefined,
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

export const sanitizePlan = (
  plan: AgentPlanResult,
  context: AgentContext,
): AgentPlanResult => {
  const allowed = new Map(
    context.connectors.map((connector) => [
      connector.id,
      new Set(connector.actions.map((action) => action.id)),
    ]),
  );
  const steps = plan.steps.flatMap((step) => {
    const actions = allowed.get(step.connectorId);

    if (!actions) {
      return [];
    }

    const action = resolveAction(step.action, actions);

    if (!action) {
      return [];
    }

    return [{ ...step, action }];
  });
  const connectors = [...new Set(steps.map((step) => step.connectorId))];

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
    message:
      plan.message ||
      `Собрал цепочку: ${connectors.join(' → ')}.`,
  };
};
