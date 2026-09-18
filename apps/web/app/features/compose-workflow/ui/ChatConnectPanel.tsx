import { useEffect, useState } from 'react';
import {
  createConnection,
  testConnection,
  type Connection,
} from '~/entities/connection';
import type { ConnectorCatalog } from '~/entities/connector';
import {
  ExcelConnectGuide,
  TelegramConnectGuide,
} from '~/features/manage-connection';
import { Button } from '~/shared/ui/Button';
import { useToast } from '~/shared/model/ui';

export const ChatConnectPanel = ({
  connector,
  connections,
  preferredTelegramKind,
  onConnected,
}: {
  connector: ConnectorCatalog;
  connections: Connection[];
  preferredTelegramKind?: 'bot' | 'business';
  onConnected: (connectionId: string) => void | Promise<void>;
}) => {
  const existing = connections.filter(
    (item) => item.connectorId === connector.id && item.status === 'connected',
  );
  const [mode, setMode] = useState<'choose' | 'create'>(
    existing.length ? 'choose' : 'create',
  );
  const [form, setForm] = useState<Record<string, string>>({});
  const [name, setName] = useState(`${connector.name} аккаунт`);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const defaults: Record<string, string> = {};

    for (const field of connector.credentialFields) {
      defaults[field.key] = field.options?.[0]?.value ?? '';
    }

    setForm(defaults);
    setName(`${connector.name} аккаунт`);
    setMode(existing.length ? 'choose' : 'create');
  }, [connector]);

  const save = async () => {
    setBusy(true);

    try {
      const created = await createConnection({
        connectorId: connector.id,
        name,
        credentials: form,
      });
      const tested = await testConnection(created.id);

      if (tested.status === 'error') {
        toast(tested.lastError || 'Проверка не удалась', 'error');
        return;
      }

      toast(`${connector.name} подключён`, 'ok');
      await onConnected(created.id);
    } catch (err) {
      toast(
        err instanceof Error ? err.message : 'Не удалось подключить',
        'error',
      );
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'choose' && existing.length) {
    return (
      <div className="chat-connect-form">
        <p className="muted">
          Уже есть подключения {connector.name}. Выберите одно для этого чата
          или создайте новое.
        </p>
        {existing.map((item) => (
          <Button
            key={item.id}
            type="button"
            disabled={busy}
            onClick={() => {
              toast(`Для этого чата выбран ${item.name}`, 'ok');
              void onConnected(item.id);
            }}
          >
            Использовать {item.name}
          </Button>
        ))}
        <Button type="button" variant="ghost" onClick={() => setMode('create')}>
          Создать новый
        </Button>
      </div>
    );
  }

  if (connector.id === 'telegram') {
    return (
      <TelegramConnectGuide
        fresh
        preferredKind={preferredTelegramKind}
        onConnected={async (connectionId) => {
          if (connectionId) {
            await onConnected(connectionId);
          }
        }}
      />
    );
  }

  if (!connector.credentialFields.length) {
    return <p className="muted">Этому сервису не нужны учётные данные.</p>;
  }

  const connectForm = (
    <form
      className="chat-connect-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {existing.length && mode === 'create' ? (
        <Button type="button" variant="ghost" onClick={() => setMode('choose')}>
          К существующим подключениям
        </Button>
      ) : null}
      <label>
        Название
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {connector.credentialFields.map((field) => (
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
      ))}
      <Button type="submit" loading={busy}>
        Сохранить и проверить
      </Button>
    </form>
  );

  if (connector.id === 'excel') {
    return <ExcelConnectGuide>{connectForm}</ExcelConnectGuide>;
  }

  return connectForm;
};
