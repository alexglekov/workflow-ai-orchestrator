import { AgentRegistry } from './registry';
import { GeminiAgent } from './providers/gemini.provider';
import { QwenAgent } from './providers/qwen.provider';
import { OrchestratorAgent } from './providers/orchestrator.provider';

export const createDefaultRegistry = (): AgentRegistry => {
  const registry = new AgentRegistry([new GeminiAgent(), new QwenAgent()]);

  registry.register(new OrchestratorAgent(registry));

  return registry;
};
