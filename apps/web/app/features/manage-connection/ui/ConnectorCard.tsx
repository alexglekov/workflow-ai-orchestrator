import { useEffect, useState } from 'react';
import {
  createConnection,
  deleteConnection,
  testConnection,
  updateConnection,
  type Connection,
} from '~/entities/connection';
import type { ConnectorCatalog } from '~/entities/connector';
import { connectorVisual } from '~/shared/lib/connector-visuals';
import { connectionStatusLabel } from '~/shared/lib/status';
import { Banner } from '~/shared/ui/Banner';
import { Button } from '~/shared/ui/Button';
import { Icon } from '~/shared/ui/Icon';
import { StatusBadge } from '~/shared/ui/StatusBadge';

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
      await onRefresh();
    } catch (err) {
      setLocalError(
        err instanceof Error ? err.message : 'Не удалось сохранить',
      );
    } finally {
      onBusy(false);
    }
  };

  const test = async (id: string) => {
    onBusy(true);
    setLocalError(null);

    try {
      await testConnection(id);
      await onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Проверка не удалась');
    } finally {
      onBusy(false);
    }
  };

  const remove = async (id: string) => {
    onBusy(true);

    try {
      await deleteConnection(id);
      await onRefresh();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Не удалось удалить');
    } finally {
      onBusy(false);
    }
  };

  const status = connections[0]?.status || 'disconnected';
  const visual = connectorVisual(connector.id);

  return (
    <section className="panel">
      <button type="button" className="node-row" onClick={onToggle}>
        <span
          className="node-icon"
          style={{ background: visual.bg, color: visual.color }}
        >
          {visual.letter}
        </span>
        <span className="node-copy">
          <strong>{connector.name}</strong>
          <span>{connector.description}</span>
        </span>
        <span className="chip mcp">MCP</span>
        <StatusBadge status={status} label={connectionStatusLabel(status)} />
        <span className={`chevron ${expanded ? 'open' : ''}`}>
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {expanded ? (
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
              Подключать аккаунт не обязательно. Поиск идёт через DuckDuckGo;
              Brave API — если HTML-поиск режут. Сайт логина этим шагом не
              открыть.
            </p>
          ) : null}
          {connections.length ? (
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
          ) : (
            <p className="muted">Аккаунт ещё не подключён</p>
          )}
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
        </>
      ) : null}
    </section>
  );
};
