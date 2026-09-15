import { useEffect, useState } from 'react';
import {
  createConnection,
  deleteConnection,
  testConnection,
  updateConnection,
  type Connection,
} from '~/entities/connection';
import type { ConnectorCatalog } from '~/entities/connector';
import { connectorKind } from '~/shared/lib/connector-visuals';
import { connectionStatusLabel } from '~/shared/lib/status';
import { Banner } from '~/shared/ui/Banner';
import { Button } from '~/shared/ui/Button';
import { ConnectorMark } from '~/shared/ui/ConnectorMark';
import { Icon } from '~/shared/ui/Icon';
import { StatusBadge } from '~/shared/ui/StatusBadge';
import { useToast } from '~/shared/model/ui';
import { TelegramConnectGuide } from './TelegramConnectGuide';

export const ConnectorCard = ({
  connector,
  connections,
  expanded,
  busy,
  onToggle,
  onBusy,
  onRefresh,
}: {
  connector: ConnectorCatalog;
  connections: Connection[];
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onBusy: (value: boolean) => void;
  onRefresh: () => Promise<void>;
}) => {
  const [form, setForm] = useState<Record<string, string>>({});
  const [name, setName] = useState(`${connector.name} аккаунт`);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const defaults: Record<string, string> = {};

    for (const field of connector.credentialFields) {
      defaults[field.key] = field.options?.[0]?.value ?? '';
    }

    setForm(defaults);
  }, [connector]);

  const save = async () => {
    onBusy(true);
    setLocalError(null);

    try {
      const wasEditing = Boolean(editingId);

      if (editingId) {
        await updateConnection(editingId, { name, credentials: form });
      } else {
        await createConnection({
          connectorId: connector.id,
          name,
          credentials: form,
        });
      }

      setEditingId(null);
      toast(
        wasEditing ? 'Подключение сохранено' : `${connector.name} подключён`,
        'ok',
      );
      await onRefresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось сохранить';

      setLocalError(message);
      toast(message, 'error');
    } finally {
      onBusy(false);
    }
  };

  const test = async (id: string) => {
    onBusy(true);
    setLocalError(null);

    try {
      const result = await testConnection(id);
      await onRefresh();

      if (result.status === 'error') {
        const message = result.lastError || 'Проверка не удалась';

        setLocalError(message);
        toast(message, 'error');
      } else {
        toast('Подключение работает', 'ok');
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Проверка не удалась';

      setLocalError(message);
      toast(message, 'error');
    } finally {
      onBusy(false);
    }
  };

  const remove = async (id: string) => {
    onBusy(true);

    try {
      await deleteConnection(id);
      toast('Подключение удалено', 'ok');
      await onRefresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Не удалось удалить';

      setLocalError(message);
      toast(message, 'error');
    } finally {
      onBusy(false);
    }
  };

  const kind = connectorKind(connector.id);
  const status =
    connections.find((item) => item.status === 'connected')?.status ||
    connections.find((item) => item.status === 'error')?.status ||
    connections[0]?.status ||
    'disconnected';
  const canConfigure = kind !== 'action';
  const credentialForm = (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {localError ? <Banner>{localError}</Banner> : null}
      <label>
        Название
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {connector.credentialFields.length === 0 ? (
        <p className="muted">Этому коннектору не нужны учётные данные.</p>
      ) : (
        connector.credentialFields.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.type === 'select' && field.options?.length ? (
              <select
                value={form[field.key] ?? field.options[0].value}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={
                  field.secret || field.type === 'password'
                    ? 'password'
                    : field.type === 'number'
                      ? 'number'
                      : 'text'
                }
                placeholder={field.placeholder}
                value={form[field.key] ?? ''}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
              />
            )}
          </label>
        ))
      )}
      <Button type="submit" disabled={busy}>
        {editingId ? 'Сохранить' : 'Подключить'}
      </Button>
    </form>
  );

  const row = (
    <>
      <ConnectorMark id={connector.id} />
      <span className="node-copy">
        <strong>{connector.name}</strong>
        <span>{connector.description}</span>
      </span>
      <span className="node-row-meta">
        {kind === 'service' || connections[0] ? (
          <StatusBadge status={status} label={connectionStatusLabel(status)} />
        ) : null}
        <span
          className={`chevron${expanded ? ' open' : ''}${canConfigure ? '' : ' is-placeholder'}`}
          aria-hidden={!canConfigure}
        >
          <Icon name="chevron" size={16} />
        </span>
      </span>
    </>
  );

  return (
    <section className="panel">
      {canConfigure ? (
        <button type="button" className="node-row" onClick={onToggle}>
          {row}
        </button>
      ) : (
        <div className="node-row is-static">{row}</div>
      )}
      {canConfigure && expanded ? (
        <>
          <div className="chip-row">
            {connector.actions.map((action) => (
              <span key={action.id} className="chip">
                {action.name}
              </span>
            ))}
          </div>
          {connector.id === 'web' ? (
            <p className="muted">
              Подключать аккаунт не обязательно. Поиск — DuckDuckGo, курсы
              BestChange — шаг «Курсы» (архив API, не HTML-страница). Сайт
              логина этим шагом не открыть. Поля из страницы достаёт шаг LLM.
            </p>
          ) : null}
          {connector.id === 'browser' ? (
            <p className="muted">
              Chromium через Playwright: SPA и страницы с JavaScript. На машине
              worker выполните npx playwright install chromium. Cookies —
              необязательный storageState JSON. Парк аккаунтов этим шагом не
              автоматизируется.
            </p>
          ) : null}
          {connector.id === 'llm' ? (
            <p className="muted">
              Подключать не обязательно, если в .env задан QWEN_API_KEY. Ключ в
              карточке нужен, только чтобы переопределить окружение.
            </p>
          ) : null}
          {connector.id === 'telegram' ? (
            <TelegramConnectGuide
              onConnected={onRefresh}
              onChanged={onRefresh}
            />
          ) : null}
          {connector.id === 'telegram' ? null : connections.length ? (
            <ul className="connection-list">
              {connections.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <StatusBadge
                      status={item.status}
                      label={connectionStatusLabel(item.status)}
                    />
                    {item.lastError ? (
                      <small className="muted">{item.lastError}</small>
                    ) : null}
                  </div>
                  <div className="row-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void test(item.id)}
                      disabled={busy}
                    >
                      Проверить
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        const next: Record<string, string> = {};

                        for (const field of connector.credentialFields) {
                          next[field.key] =
                            item.credentials[field.key] ??
                            field.options?.[0]?.value ??
                            '';
                        }

                        setEditingId(item.id);
                        setName(item.name);
                        setForm(next);
                      }}
                    >
                      Изменить
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void remove(item.id)}
                    >
                      Удалить
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : kind === 'service' ? (
            <p className="muted">Аккаунт ещё не подключён</p>
          ) : null}
          {connector.id === 'telegram' ? null : credentialForm}
        </>
      ) : null}
    </section>
  );
};
