import { planFromCatalog } from '@ai-worker/workflow';
import type {
  AgentAskInput,
  AgentPlanInput,
  AgentPlanResult,
  AgentProvider,
  AgentReply,
} from '../types';

export class LocalAgent implements AgentProvider {
  id = 'local';
  name = 'Локальный';
  capabilities: AgentProvider['capabilities'] = ['ask', 'plan'];

  available = () => true;

  ask = async (input: AgentAskInput): Promise<AgentReply> => {
    const connectors = input.context.connectors
      .map((item) => `• ${item.name} (${item.id})`)
      .join('\n');
    const steps = input.context.workflow?.steps.length
      ? input.context.workflow.steps
          .map(
            (step, index) =>
              `${index + 1}. ${step.title} — ${step.connectorId}.${step.action}`,
          )
          .join('\n')
      : 'Шагов пока нет. В режиме Build опишите задачу и соберите цепочку.';
    const connections = input.context.connections.length
      ? input.context.connections
          .map((item) => `• ${item.name} → ${item.connectorId}`)
          .join('\n')
      : 'Подключённых аккаунтов нет.';

    return {
      providerId: this.id,
      message: [
        `Пока нет внешнего агента, отвечаю локально.`,
        ``,
        `Вопрос: ${input.message}`,
        ``,
        `Текущий workflow: ${input.context.workflow?.name || 'не выбран'}.`,
        steps,
        ``,
        `Доступные коннекторы:`,
        connectors,
        ``,
        `Подключения:`,
        connections,
        ``,
        `Чтобы подключить Gemini, задайте GEMINI_API_KEY и AGENT_PROVIDER=gemini.`,
      ].join('\n'),
    };
  };

  plan = async (input: AgentPlanInput): Promise<AgentPlanResult> => {
    const text = `${input.prompt} ${input.message}`.trim();

    if (text.length < 24 && (input.history?.length ?? 0) === 0) {
      return {
        kind: 'questions',
        providerId: this.id,
        message:
          'Задачи мало для сборки workflow. Нужно чуть больше деталей.',
        questions: [
          'Что нужно сделать: откуда брать данные и куда их отправлять?',
          'Какие сервисы из доступных коннекторов использовать?',
        ],
        connectors: [],
        steps: [],
      };
    }

    const steps = planFromCatalog(text, input.context.connectors).map(
      (step) => ({
        title: step.title,
        connectorId: step.connectorId,
        action: step.action,
        params: step.params ?? {},
        iterate: step.iterate,
      }),
    );

    if (steps.length === 0) {
      return {
        kind: 'questions',
        providerId: this.id,
        message:
          'Не сопоставил задачу с действиями из каталога коннекторов.',
        questions: [
          'Какие действия из доступных коннекторов выполнить?',
          'Откуда взять данные и куда их отправить?',
        ],
        connectors: [],
        steps: [],
      };
    }

    return {
      kind: 'workflow',
      providerId: this.id,
      message: `Собрал черновик по ключевым словам: ${[
        ...new Set(steps.map((step) => step.connectorId)),
      ].join(' → ')}.`,
      questions: [],
      connectors: [...new Set(steps.map((step) => step.connectorId))],
      steps,
    };
  };
}
