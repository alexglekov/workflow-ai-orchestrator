import { LlmChatAgent } from './llm-chat.provider';

export class QwenAgent extends LlmChatAgent {
  constructor() {
    super('qwen', 'Qwen');
  }
}
