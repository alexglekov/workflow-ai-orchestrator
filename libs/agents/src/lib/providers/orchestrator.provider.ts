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

const FALLBACK_ORDER = ['gemini', 'openai', 'local'] as const;

export class OrchestratorAgent implements AgentProvider {
  id = 'orchestrator';
  name = 'Авто';
  capabilities: AgentProvider['capabilities'] = ['ask', 'plan'];

  constructor(private readonly agents: AgentRegistry) {}

  available = () => true;

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
      ...FALLBACK_ORDER,
    ].filter((id): id is string => Boolean(id) && id !== this.id);

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

    const local = this.agents.get('local');

    if (!local) {
      throw new Error('Не найден локальный агент');
    }

    return local;
  };
}
