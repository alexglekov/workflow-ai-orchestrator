import { AgentRegistry } from './registry';
import { QwenAgent } from './providers/qwen.provider';

export const createDefaultRegistry = (): AgentRegistry =>
  new AgentRegistry([new QwenAgent()]);
