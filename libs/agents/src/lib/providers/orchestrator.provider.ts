import { agentConfig } from '../config';
import type { AgentRegistry } from '../registry';
import type {
  AgentAskInput,
  AgentCapability,
  AgentPlanInput,
  AgentPlanResult,
  AgentProvider,
  AgentReply,
} from '../types';

export const CHAT_WORKERS = ['qwen', 'openai'] as const;

export const NO_AGENT_ERROR =
  'Нет доступного агента. Задайте QWEN_API_KEY или OPENAI_API_KEY.';

export class OrchestratorAgent implements AgentProvider {
  id = 'orchestrator';
  name = 'Auto';
  capabilities: AgentProvider['capabilities'] = ['ask', 'plan'];

  constructor(private readonly agents: AgentRegistry) {}

  available = () =>
    this.agents
      .list()
      .some(
        (agent) =>
          agent.id !== this.id &&
          agent.available() &&
          (agent.capabilities.includes('ask') ||
            agent.capabilities.includes('plan')),
      );

  ask = async (input: AgentAskInput): Promise<AgentReply> => {
    const provider = this.pick('ask', input.providerId);

    return provider.ask(input);
  };

  plan = async (input: AgentPlanInput): Promise<AgentPlanResult> => {
    const provider = this.pick('plan', input.providerId);

    if (!provider.plan) {
      throw new Error(`Агент ${provider.name} не умеет собирать workflow`);
    }

    return provider.plan(input);
  };

  pick = (capability: AgentCapability, requestedId?: string): AgentProvider => {
    const candidates = [
      requestedId,
      agentConfig.defaultProvider(),
      ...CHAT_WORKERS,
    ].filter(
      (id): id is string =>
        Boolean(id) && id !== this.id && id !== 'auto',
    );
    const seen = new Set<string>();

    for (const id of candidates) {
      if (seen.has(id)) {
        continue;
      }

      seen.add(id);

      const provider = this.agents.get(id);

      if (
        provider &&
        provider.available() &&
        provider.capabilities.includes(capability)
      ) {
        return provider;
      }
    }

    throw new Error(NO_AGENT_ERROR);
  };
}
