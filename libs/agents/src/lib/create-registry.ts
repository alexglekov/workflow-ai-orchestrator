import { AgentRegistry } from './registry';
import { GeminiAgent } from './providers/gemini.provider';
import { LocalAgent } from './providers/local.provider';
import { OpenAiAgent } from './providers/openai.provider';
import { OrchestratorAgent } from './providers/orchestrator.provider';

export const createDefaultRegistry = (): AgentRegistry => {
  const registry = new AgentRegistry([
    new GeminiAgent(),
    new OpenAiAgent(),
    new LocalAgent(),
  ]);

  registry.register(new OrchestratorAgent(registry));

  return registry;
};
