import { useEffect, useRef, useState, type ReactNode } from 'react';
import { deleteConnection } from '~/entities/connection';
import {
  fetchTelegramStatus,
  registerTelegram,
  type TelegramBotHealth,
  type TelegramStatus,
} from '~/entities/telegram';
import { Button } from '~/shared/ui/Button';
import { StatusBadge } from '~/shared/ui/StatusBadge';
import { useToast } from '~/shared/model/ui';

const emptyStatus = (): TelegramStatus => ({
  configured: false,
  connected: false,
  waiting: false,
  mode: 'none',
  botUsername: '',
  canReply: false,
  error: null,
  connectionId: null,
  bots: [],
});

const botHandle = (username: string) =>
  username ? `@${username.replace(/^@/, '')}` : '';

const botBadge = (bot: TelegramBotHealth) => {
  if (bot.state === 'connected') {
    return { status: 'connected', label: 'подключено' };
  }

  if (bot.state === 'invalid') {
    return { status: 'error', label: 'ошибка' };
  }

  return { status: 'disconnected', label: 'не подключено' };
};

const botStateText = (bot: TelegramBotHealth) => {
  const handle = botHandle(bot.username);

  if (bot.state === 'invalid') {
    return bot.lastError || 'Бот удалён или токен недействителен';
  }

  if (bot.state === 'connected') {
    if (!bot.canReply) {
      return handle
        ? `${handle} подключён, но нет права «Ответы от вашего имени».`
        : 'Подключён, но нет права «Ответы от вашего имени».';
    }

    return handle ? `${handle} подключён` : 'Подключён через Telegram для бизнеса';
  }

  return handle
    ? `Токен живой. Добавьте ${handle} в Telegram для бизнеса.`
    : 'Токен сохранён. Добавьте бота в Telegram для бизнеса.';
};

const GuideSteps = ({
  items,
}: {
  items: Array<{ state: 'done' | 'now' | 'todo'; text: ReactNode }>;
}) => (
  <ol className="telegram-guide-steps">
    {items.map((item, index) => (
      <li key={index} className={`is-${item.state}`}>
        <span className="telegram-guide-mark">
          {item.state === 'done' ? 'Готово' : item.state === 'now' ? 'Сейчас' : index + 1}
        </span>
        <span>{item.text}</span>
      </li>
    ))}
  </ol>
);

const CREATE_STEPS: Array<{ state: 'done' | 'now' | 'todo'; text: ReactNode }> = [
  {
    state: 'now',
    text: (
      <>
        Откройте <strong>@BotFather</strong> и отправьте <strong>/newbot</strong>
      </>
    ),
  },
  {
    state: 'todo',
    text: 'В настройках бота включите Business Mode: Bot Settings → Business',
  },
  {
    state: 'todo',
    text: 'Скопируйте токен и вставьте его ниже',
  },
  {
    state: 'todo',
    text: (
      <>
        Откройте Telegram → <strong>Telegram для бизнеса</strong> →{' '}
        <strong>Чат-боты</strong>
      </>
    ),
  },
  {
    state: 'todo',
    text: 'Введите имя бота и нажмите «Продолжить»',
  },
  {
    state: 'todo',
    text: 'Включите «Новые чаты», «Не из контактов», «Ответы от вашего имени» и нажмите «Сохранить»',
  },
];

type GuideStep = { state: 'done' | 'now' | 'todo'; text: ReactNode };

const botProgress = (bot: TelegramBotHealth): GuideStep[] => {
  const handle = botHandle(bot.username);

  if (bot.state === 'invalid') {
    return [
      {
        state: 'now',
        text: bot.lastError || 'Бот удалён или токен недействителен',
      },
      {
        state: 'todo',
        text: (
          <>
            Создайте нового в <strong>@BotFather</strong> или вставьте новый токен
            ниже
          </>
        ),
      },
    ];
  }

  if (bot.state === 'connected') {
    const items: GuideStep[] = [
      {
        state: 'done',
        text: handle ? `Бот ${handle}, токен сохранён` : 'Бот создан, токен сохранён',
      },
      {
        state: 'done',
        text: 'Бот добавлен в Telegram для бизнеса',
      },
    ];

    if (!bot.canReply) {
      items.push({
        state: 'now',
        text: 'В Telegram включите «Ответы от вашего имени» и нажмите «Сохранить»',
      });
    }

    return items;
  }

  return [
    {
      state: 'done',
      text: handle
        ? `Бот ${handle} создан, токен сохранён`
        : 'Бот создан, токен сохранён',
    },
    {
      state: 'now',
      text: (
        <>
          Откройте Telegram → <strong>Telegram для бизнеса</strong> →{' '}
          <strong>Чат-боты</strong>
        </>
      ),
    },
    {
      state: 'todo',
      text: (
        <>
          Введите <strong>{handle || 'имя бота'}</strong> и нажмите «Продолжить»
        </>
      ),
    },
    {
      state: 'todo',
      text: 'Включите «Новые чаты», «Не из контактов», «Ответы от вашего имени» и нажмите «Сохранить»',
    },
  ];
};

export const TelegramConnectGuide = ({
  variant = 'card',
  fresh = false,
  onClose,
  onConnected,
  onChanged,
}: {
  variant?: 'card' | 'modal';
  fresh?: boolean;
  onClose?: () => void;
  onConnected?: (connectionId?: string) => void | Promise<void>;
  onChanged?: () => void | Promise<void>;
}) => {
  const [status, setStatus] = useState<TelegramStatus>(emptyStatus);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  const onConnectedRef = useRef(onConnected);
  const onChangedRef = useRef(onChanged);
  const statusRef = useRef(status);
  const seenConnected = useRef(new Set<string>());

  onConnectedRef.current = onConnected;
  onChangedRef.current = onChanged;
  statusRef.current = status;

  const notify = async (next: TelegramStatus) => {
    for (const bot of next.bots) {
      if (bot.state !== 'connected' || seenConnected.current.has(bot.connectionId)) {
        continue;
      }

      seenConnected.current.add(bot.connectionId);
      await onConnectedRef.current?.(bot.connectionId);
    }

    for (const id of [...seenConnected.current]) {
      if (!next.bots.some((bot) => bot.connectionId === id && bot.state === 'connected')) {
        seenConnected.current.delete(id);
      }
    }
  };

  const refresh = async (changed = false) => {
    const next = await fetchTelegramStatus();

    setStatus(next);
    await notify(next);

    if (changed) {
      await onChangedRef.current?.();
    }

    return next;
  };

  useEffect(() => {
    void fetchTelegramStatus()
      .then(async (next) => {
        setStatus(next);

        if (!fresh) {
          for (const bot of next.bots) {
            if (bot.state === 'connected') {
              seenConnected.current.add(bot.connectionId);
            }
          }
        }

        await onChangedRef.current?.();
      })
      .catch((err) => {
        toast(
          err instanceof Error ? err.message : 'Не удалось проверить Telegram',
          'error',
        );
      });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void (async () => {
        const current = statusRef.current;

        const next = await fetchTelegramStatus();
        const becameInvalid = next.bots.some(
          (bot) =>
            bot.state === 'invalid' &&
            current.bots.find((item) => item.connectionId === bot.connectionId)
              ?.state !== 'invalid',
        );

        setStatus(next);
        await notify(next);

        if (becameInvalid) {
          await onChangedRef.current?.();
        }
      })().catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [fresh]);

  const checkBot = async (bot: TelegramBotHealth) => {
    setBusyId(bot.connectionId);

    try {
      const next = await refresh(true);
      const current = next.bots.find((item) => item.connectionId === bot.connectionId);

      if (!current) {
        toast('Бот больше не в списке', 'error');
        return;
      }

      const handle = botHandle(current.username);

      if (current.state === 'connected') {
        toast(
          handle ? `Telegram подключён · ${handle}` : 'Telegram подключён',
          'ok',
        );
        return;
      }

      if (current.state === 'invalid') {
        toast(
          current.lastError || 'Бот удалён или токен недействителен',
          'error',
        );
        return;
      }

      toast(
        handle
          ? `Пока не видно подключения. Добавьте ${handle} в Telegram для бизнеса и сохраните права.`
          : 'Пока не видно подключения. Сохраните права в Telegram для бизнеса и нажмите ещё раз.',
        'error',
      );
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Не удалось проверить Telegram',
        'error',
      );
    } finally {
      setBusyId(null);
    }
  };

  const saveToken = async () => {
    const nextToken = token.trim();

    if (!nextToken) {
      toast('Вставьте токен бота из @BotFather', 'error');
      return;
    }

    setBusy(true);

    try {
      const next = await registerTelegram(nextToken);

      setStatus(next);
      setToken('');
      await notify(next);
      await onChangedRef.current?.();

      const created =
        next.bots.find((bot) => bot.username && nextToken) ??
        next.bots[next.bots.length - 1];
      const name = botHandle(created?.username ?? next.botUsername);

      if (name) {
        await navigator.clipboard?.writeText(name).catch(() => undefined);
        toast(`Токен сохранён. Имя бота ${name} скопировано.`, 'ok');
      } else {
        toast('Токен сохранён. Дальше добавьте бота в Telegram для бизнеса.', 'ok');
      }

      if (next.connected) {
        toast('Telegram подключён', 'ok');
      }
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Не удалось сохранить токен',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  const removeBot = async (bot: TelegramBotHealth) => {
    setBusyId(bot.connectionId);

    try {
      await deleteConnection(bot.connectionId);
      toast(botHandle(bot.username) ? `${botHandle(bot.username)} удалён` : 'Бот удалён', 'ok');
      await refresh(true);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Не удалось удалить', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const body = (
    <>
      <div className="telegram-guide-head">
        <strong>Подключение Telegram</strong>
        {onClose ? (
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        ) : null}
      </div>
      {status.bots.length ? null : <GuideSteps items={CREATE_STEPS} />}
      {status.bots.length ? (
        <ul className="telegram-bot-list">
          {status.bots.map((bot) => {
            const badge = botBadge(bot);
            const handle = botHandle(bot.username);

            return (
              <li key={bot.connectionId} className={`telegram-bot is-${bot.state}`}>
                <div className="telegram-bot-head">
                  <div>
                    <strong>{handle || bot.name}</strong>
                    <p className={`telegram-bot-state is-${bot.state}`}>
                      {botStateText(bot)}
                    </p>
                  </div>
                  <StatusBadge status={badge.status} label={badge.label} />
                </div>
                <GuideSteps items={botProgress(bot)} />
                <div className="telegram-guide-actions">
                  {fresh && bot.state === 'connected' ? (
                    <Button
                      type="button"
                      onClick={() => void onConnected?.(bot.connectionId)}
                    >
                      Использовать
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    loading={busyId === bot.connectionId}
                    onClick={() => void checkBot(bot)}
                  >
                    Обновить статус
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    loading={busyId === bot.connectionId}
                    onClick={() => void removeBot(bot)}
                  >
                    Удалить
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <form
        className="chat-connect-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveToken();
        }}
      >
        <label>
          Токен бота
          <input
            type="password"
            autoComplete="off"
            placeholder="123456:ABC..."
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <div className="telegram-guide-actions">
          <Button type="submit" loading={busy} disabled={!token.trim()}>
            {status.bots.length ? 'Добавить бота' : 'Сохранить и продолжить'}
          </Button>
        </div>
      </form>
    </>
  );

  if (variant === 'modal') {
    return (
      <div
        className="node-picker"
        role="dialog"
        aria-label="Подключение Telegram"
        onClick={onClose}
      >
        <div
          className="dialog-sheet telegram-guide-sheet"
          onClick={(event) => event.stopPropagation()}
        >
          {body}
        </div>
      </div>
    );
  }

  return <div className="telegram-guide">{body}</div>;
};
