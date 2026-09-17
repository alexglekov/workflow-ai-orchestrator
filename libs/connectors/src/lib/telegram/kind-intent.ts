import type { TelegramKind } from './platform';

export const telegramKindLabel = (kind: TelegramKind) =>
  kind === 'business' ? 'бот для аккаунта' : 'обычный бот';

const asText = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const wantsBot = (value: string) =>
  /обычн[а-яё]*\s+бот|просто(?:го|му|й)?\s+бот|чат[а-яё]*\s+с ботом|без аккаунта|не для бизнеса|не от имени/.test(
    value,
  );

const wantsBusiness = (value: string) =>
  /для бизнеса|business mode|бот для аккаунта|к аккаунту|на аккаунт|с аккаунтом|привяз[а-яё]*\s+аккаунт|от\s+(?:моего|своего|вашего)\s+имени|от имени|отвечать как я|диалог[а-яё]*\s+клиент|сообщен[а-яё]*\s+клиент|клиентск/.test(
    value,
  );

/** Достаёт тип Telegram из формулировки задачи или реплики в чате. */
export const parseTelegramKindIntent = (text: string): TelegramKind | null => {
  const value = asText(text);

  if (!value) {
    return null;
  }

  const bot = wantsBot(value);
  const business = wantsBusiness(value);

  if (bot && business) {
    return /обычн|просто|без аккаунта|не для|не от имени/.test(value)
      ? 'bot'
      : 'business';
  }

  if (bot) {
    return 'bot';
  }

  if (business) {
    return 'business';
  }

  return null;
};
