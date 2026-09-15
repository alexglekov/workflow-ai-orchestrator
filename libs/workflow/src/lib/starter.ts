import type { ParsedStep } from './types';

export const STARTER_PROMPT =
  'Проверять новые письма с заявками. На каждое письмо добавить строку в Excel и отправить уведомление в Telegram.';

export const starterSteps = (): ParsedStep[] => [
  {
    title: 'Проверить новые письма с заявками',
    connectorId: 'mail',
    action: 'fetch_new',
    params: { subjectContains: 'заявк', limit: 5 },
  },
  {
    title: 'Добавить строку в Excel',
    connectorId: 'excel',
    action: 'append_row',
    params: {},
    iterate: true,
  },
  {
    title: 'Отправить уведомление в Telegram',
    connectorId: 'telegram',
    action: 'send_message',
    params: {
      text: 'Новая заявка: {{item.subject}}\nОт: {{item.from}}\n{{item.text}}',
    },
    iterate: true,
  },
];
