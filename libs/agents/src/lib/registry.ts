import type { AgentCapability, AgentInfo, AgentProvider } from './types';

export const NO_AGENT_ERROR = 'Нет доступного агента. Задайте QWEN_API_KEY.';

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
    _providerId?: string,
  ): AgentProvider => {
    const requested = this.get('qwen');

    if (
      requested?.available() &&
      requested.capabilities.includes(capability)
    ) {
      return requested;
    }

    const fallback = this.list().find(
      (agent) =>
        agent.available() && agent.capabilities.includes(capability),
    );

    if (!fallback) {
      throw new Error(NO_AGENT_ERROR);
    }

    return fallback;
  };
}
