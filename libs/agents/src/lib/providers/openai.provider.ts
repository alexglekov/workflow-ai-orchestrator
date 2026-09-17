import { LlmChatAgent } from './llm-chat.provider';

export class OpenAIAgent extends LlmChatAgent {
  constructor() {
    super('openai', 'OpenAI');
  }
}
