import { http } from '~/shared/api/http';
import type { TelegramStatus } from '../model/types';

export const fetchTelegramStatus = () => http<TelegramStatus>('/telegram/status');

export const registerTelegram = (botToken: string) =>
  http<TelegramStatus>('/telegram/register', {
    method: 'POST',
    body: JSON.stringify({ botToken }),
  });

export const prepareTelegram = () =>
  http<TelegramStatus>('/telegram/prepare', { method: 'POST' });

export const syncTelegram = () =>
  http<{ ok?: boolean }>('/telegram/sync', { method: 'POST' });
