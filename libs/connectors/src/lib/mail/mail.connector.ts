import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as nodemailer from 'nodemailer';
import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { interpolate, mergeContext } from '../interpolate';

const imapOptions = (credentials: Record<string, string>) => {
  const port = Number(credentials['port'] || 993);

  return {
    host: credentials['host'] || '',
    port,
    secure: credentials['secure'] !== 'false',
    auth: {
      user: credentials['user'] || '',
      pass: credentials['password'] || '',
    },
    logger: false as const,
  };
};

const smtpHostFromImap = (host: string): string =>
  host.replace(/^imap\./i, 'smtp.');

const listInbox = async (
  credentials: Record<string, string>,
  params: Record<string, unknown>,
  unseenOnly: boolean,
): Promise<ConnectorExecuteResult> => {
  const client = new ImapFlow(imapOptions(credentials));

  await client.connect();

  const lock = await client.getMailboxLock('INBOX');

  try {
    const limit = Number(params['limit'] || 10);
    const subjectContains = String(
      params['subjectContains'] || params['subject'] || '',
    ).toLowerCase();
    const fromContains = String(
      params['fromContains'] || params['from'] || '',
    ).toLowerCase();
    const markRead =
      params['markRead'] === true || params['markRead'] === 'true';
    const sinceDays = Number(params['sinceDays'] || 0);
    const search: Record<string, unknown> = {};

    if (unseenOnly) {
      search['seen'] = false;
    }

    if (fromContains) {
      search['from'] = fromContains;
    }

    if (subjectContains) {
      search['subject'] = subjectContains;
    }

    if (sinceDays > 0) {
      search['since'] = new Date(Date.now() - sinceDays * 86_400_000);
    }

    const uids = await client.search(search, { uid: true });
    const list = Array.isArray(uids) ? uids : [];
    const chosen = list.slice(-Math.min(Math.max(limit, 1), 50));
    const messages: Array<Record<string, unknown>> = [];

    if (chosen.length === 0) {
      return {
        ok: true,
        data: { count: 0, messages, from: null, subject: null, text: '' },
      };
    }

    for await (const msg of client.fetch(
      chosen,
      { envelope: true, source: true, uid: true },
      { uid: true },
    )) {
      const parsed = msg.source ? await simpleParser(msg.source) : null;
      const from =
        parsed?.from?.text ||
        msg.envelope?.from?.map((item) => item.address).join(', ') ||
        '';
      const subject = parsed?.subject || msg.envelope?.subject || '';
      const text = (parsed?.text || parsed?.html || '').toString();

      if (subjectContains && !subject.toLowerCase().includes(subjectContains)) {
        continue;
      }

      if (fromContains && !from.toLowerCase().includes(fromContains)) {
        continue;
      }

      messages.push({
        uid: msg.uid,
        from,
        subject,
        date: parsed?.date?.toISOString() || msg.envelope?.date?.toISOString(),
        text,
      });

      if (markRead && msg.uid) {
        await client.messageFlagsAdd(`${msg.uid}`, ['\\Seen'], { uid: true });
      }
    }

    const first = messages[0] ?? null;

    return {
      ok: true,
      data: {
        count: messages.length,
        messages,
        from: first?.['from'],
        subject: first?.['subject'],
        text: first?.['text'],
      },
    };
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
};

const sendMail = async (
  credentials: Record<string, string>,
  params: Record<string, unknown>,
  previous: unknown,
): Promise<ConnectorExecuteResult> => {
  const host = smtpHostFromImap(credentials['host'] || '');

  const transporter = nodemailer.createTransport({
    host,
    port: 465,
    secure: true,
    auth: {
      user: credentials['user'],
      pass: credentials['password'],
    },
  });

  const ctx = mergeContext(params, previous);
  const to = String(ctx['to'] || '');
  const subject = String(ctx['subject'] || 'Уведомление');
  const text = String(
    ctx['text'] || ctx['body'] || JSON.stringify(previous ?? {}, null, 2),
  );

  if (!to) {
    return { ok: false, error: 'Не указан получатель (to)' };
  }

  const info = await transporter.sendMail({
    from: credentials['user'],
    to,
    subject,
    text,
  });

  return { ok: true, data: { messageId: info.messageId, to, subject } };
};

export const mailConnector: Connector = {
  id: 'mail',
  name: 'Mail',
  description: 'IMAP/SMTP: новые письма, поиск переписки и отправка',
  credentialFields: [
    { key: 'host', label: 'IMAP-хост', placeholder: 'imap.gmail.com' },
    { key: 'port', label: 'IMAP-порт', placeholder: '993', type: 'number' },
    { key: 'user', label: 'Логин (email)' },
    { key: 'password', label: 'Пароль / пароль приложения', secret: true },
    { key: 'secure', label: 'TLS (true/false)', placeholder: 'true' },
  ],
  actions: [
    {
      id: 'fetch_new',
      name: 'Получить новые письма',
      description:
        'Непрочитанные письма из INBOX, опционально по теме и отправителю',
      paramsSchema: {
        subjectContains: { type: 'string', description: 'Фильтр по теме' },
        fromContains: { type: 'string', description: 'Фильтр по отправителю' },
        limit: { type: 'number', description: 'Максимум писем' },
        markRead: { type: 'boolean', description: 'Пометить прочитанными' },
      },
    },
    {
      id: 'search',
      name: 'Найти письма',
      description:
        'Поиск по INBOX, в том числе прочитанные: from, тема, за N дней',
      paramsSchema: {
        fromContains: {
          type: 'string',
          description: 'Отправитель, можно {{item.email}}',
        },
        subjectContains: { type: 'string', description: 'Тема содержит' },
        sinceDays: {
          type: 'number',
          description: 'За сколько дней, по умолчанию 30',
        },
        limit: { type: 'number', description: 'Максимум писем' },
      },
    },
    {
      id: 'send',
      name: 'Отправить письмо',
      description: 'Отправка через SMTP',
      paramsSchema: {
        to: { type: 'string', required: true, description: 'Получатель' },
        subject: { type: 'string', required: true },
        text: {
          type: 'string',
          description: 'Текст; по умолчанию результат предыдущего шага',
        },
      },
    },
  ],
  testConnection: async (credentials) => {
    if (
      !credentials['host'] ||
      !credentials['user'] ||
      !credentials['password']
    ) {
      return { ok: false, error: 'Укажите host, user и password' };
    }

    const client = new ImapFlow(imapOptions(credentials));

    try {
      await client.connect();
      await client.logout();

      return { ok: true, message: 'IMAP-подключение успешно' };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'IMAP connection failed',
      };
    }
  },
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    const params = interpolate(
      input.params,
      input.context ?? input.previousResult,
    ) as Record<string, unknown>;

    try {
      if (input.action === 'fetch_new') {
        return await listInbox(input.credentials, params, true);
      }

      if (input.action === 'search') {
        const withSince = {
          ...params,
          sinceDays: params['sinceDays'] ?? 30,
        };

        return await listInbox(input.credentials, withSince, false);
      }

      if (input.action === 'send') {
        return await sendMail(input.credentials, params, input.previousResult);
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Mail connector error',
      };
    }
  },
};
