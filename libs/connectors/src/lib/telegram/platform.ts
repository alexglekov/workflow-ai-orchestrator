export const TELEGRAM_ALLOWED_UPDATES = [
  'message',
  'edited_message',
  'callback_query',
  'business_connection',
  'business_message',
  'edited_business_message',
] as const;

export {
  LAUNCH_MARK,
  TELEGRAM_CONNECT_MARK,
  connectMark,
  missingConnectorIds,
  requiredConnectorIds,
  unresolvedConnectorIds,
  runMark,
  stripChatMarks,
  withReadyCta,
  withTelegramConnectCta,
} from '../chat-cta';

export const resolveBotToken = (
  credentials: Record<string, string> = {},
): string => (credentials['botToken'] || '').trim();

export type TelegramKind = 'bot' | 'business';

export const resolveTelegramKind = (
  credentials: Record<string, string> = {},
): TelegramKind => {
  if (credentials['telegramKind'] === 'business') {
    return 'business';
  }

  if (credentials['telegramKind'] === 'bot') {
    return 'bot';
  }

  return credentials['businessConnectionId'] ? 'business' : 'bot';
};

export const stripTelegramConnectMark = (text: string): string =>
  text
    .split('[[connect_telegram]]')
    .join('')
    .replace(/\[\[connect:telegram\]\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
