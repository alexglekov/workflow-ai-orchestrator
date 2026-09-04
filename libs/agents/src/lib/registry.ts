import {
  NO_AGENT_ERROR,
  OrchestratorAgent,
} from './providers/orchestrator.provider';
import type { AgentCapability, AgentInfo, AgentProvider } from './types';

export class AgentRegistry {
  private readonly agents = new Map<string, AgentProvider>();

  constructor(agents: AgentProvider[] = []) {
    for (const agent of agents) {
      this.register(agent);
    }
  }

  register = (agent: AgentProvider) => {
    this.agents.set(agent.id, agent);
  };

  get = (id: string): AgentProvider | undefined => this.agents.get(id);

  list = (): AgentProvider[] => [...this.agents.values()];

  info = (): AgentInfo[] =>
    this.list().map((agent) => ({
      id: agent.id,
      name: agent.name,
      available: agent.available(),
      capabilities: agent.capabilities,
    }));

  resolve = (
    capability: AgentCapability,
    providerId?: string,
  ): AgentProvider => {
    const orchestrator = this.get('orchestrator');

    if (orchestrator instanceof OrchestratorAgent) {
      return orchestrator.pick(capability, providerId);
    }

    const requested = providerId ? this.get(providerId) : undefined;

    if (requested?.available() && requested.capabilities.includes(capability)) {
      return requested;
    }

    const fallback = this.list().find(
      (agent) =>
        agent.id !== 'orchestrator' &&
        agent.available() &&
        agent.capabilities.includes(capability),
    );

    if (!fallback) {
      throw new Error(NO_AGENT_ERROR);
    }

    return fallback;
  };
}
