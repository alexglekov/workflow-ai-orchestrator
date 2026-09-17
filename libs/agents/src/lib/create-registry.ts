import { AgentRegistry } from './registry';
import { OpenAIAgent } from './providers/openai.provider';
import { OrchestratorAgent } from './providers/orchestrator.provider';
import { QwenAgent } from './providers/qwen.provider';

export const createDefaultRegistry = (): AgentRegistry => {
  const registry = new AgentRegistry([new QwenAgent(), new OpenAIAgent()]);

  registry.register(new OrchestratorAgent(registry));

  return registry;
};
