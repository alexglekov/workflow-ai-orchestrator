export type TelegramBotHealth = {
  connectionId: string;
  name: string;
  username: string;
  state: 'connected' | 'waiting' | 'invalid';
  canReply: boolean;
  lastError: string | null;
};

export type TelegramStatus = {
  configured: boolean;
  connected: boolean;
  waiting: boolean;
  mode: 'webhook' | 'poll' | 'none';
  botUsername: string;
  canReply: boolean;
  error: string | null;
  connectionId: string | null;
  bots: TelegramBotHealth[];
};
