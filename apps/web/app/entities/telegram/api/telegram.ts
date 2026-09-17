import { http } from '~/shared/api/http';
import type { TelegramKind, TelegramStatus } from '../model/types';

export const fetchTelegramStatus = () => http<TelegramStatus>('/telegram/status');

export const registerTelegram = (botToken: string, kind: TelegramKind = 'bot') =>
  http<TelegramStatus>('/telegram/register', {
    method: 'POST',
    body: JSON.stringify({ botToken, kind }),
  });

export const setTelegramKind = (connectionId: string, kind: TelegramKind) =>
  http<TelegramStatus>('/telegram/kind', {
    method: 'POST',
    body: JSON.stringify({ connectionId, kind }),
  });

export const prepareTelegram = () =>
  http<TelegramStatus>('/telegram/prepare', { method: 'POST' });

export const syncTelegram = () =>
  http<{ ok?: boolean }>('/telegram/sync', { method: 'POST' });
